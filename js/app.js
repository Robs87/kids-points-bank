/**
 * 积分银行 - 核心应用逻辑（前后端分离版）
 * 
 * 功能：
 * - 登录/注册/登出
 * - 多小孩切换
 * - 底部 Tab 路由（地图/打卡/兑换/复盘/作品）
 * - 全局状态管理（余额、今日打卡、连续天数）
 * - 5 个模块的渲染与交互
 * - 家长门禁（确认弹窗）
 * - 积分动画 + 震动反馈
 */

(function() {
  'use strict';

  const STORAGE = window.PointsBankStorage;
  const UTILS = window.PBUtils;
  const DATA = window.DEFAULT_DATA;

  // ==================== 全局状态 ====================
  let state = {
    currentTab: 'map',
    balance: 0,
    todayCheckins: [],
    streak: 0,
    settings: {},
    dimensions: [],
    rewards: [],
    pendingClaims: [],
    children: [],
    currentChild: null,
    currentUser: null,
    selectedDimension: null,
    reviewWeek: null,
  };

  // ==================== 初始化 ====================
  async function init() {
    state.dimensions = DATA.dimensions;
    state.rewards = DATA.rewards;

    // 检查登录状态
    if (!STORAGE.isLoggedIn()) {
      showLoginScreen();
      return;
    }

    // 验证 token 并获取用户信息
    try {
      const me = await STORAGE.me();
      state.currentUser = { account_id: me.account_id, username: me.username };
      state.children = me.children || [];
      state.settings = me.settings || {};

      // 检查是否有小孩
      if (state.children.length === 0) {
        showAddChildScreen();
        return;
      }

      // 尝试恢复上次选中的小孩
      const savedChildId = STORAGE.getChildId();
      const child = state.children.find(c => c.id === savedChildId);
      if (child) {
        state.currentChild = child;
      } else {
        state.currentChild = state.children[0];
        STORAGE.setChildId(state.currentChild.id);
      }

      // 加载数据
      await loadChildData();
      showAppScreen();
    } catch (e) {
      console.error('[App] 登录验证失败:', e);
      localStorage.removeItem('pb_token');
      localStorage.removeItem('pb_account_id');
      showLoginScreen();
    }
  }

  async function loadChildData() {
    if (!state.currentChild) return;
    const today = UTILS.getDateKey(new Date());
    
    try {
      const [checkinsResult, balanceResult, streakResult, claimsResult] = await Promise.all([
        STORAGE.getTodayCheckins(state.currentChild.id),
        STORAGE.getBalance(state.currentChild.id),
        STORAGE.getStreak(state.currentChild.id),
        STORAGE.listRewardClaims(state.currentChild.id),
      ]);

      state.todayCheckins = (checkinsResult || []).map(c => c.task_id);
      state.balance = (balanceResult || {}).balance || 0;
      state.streak = (streakResult || {}).streak || 0;
      state.pendingClaims = (claimsResult || []).filter(c => c.status === 'pending');
      
      updateTopBar();
    } catch (e) {
      console.error('[App] 加载数据失败:', e);
      showToast('数据加载失败，请检查网络连接', 'error');
    }
  }

  function updateTopBar() {
    const childNameEl = document.getElementById('top-child-name');
    const topBalance = document.getElementById('top-balance');
    if (childNameEl) {
      childNameEl.textContent = `🏦 ${state.currentChild?.name || state.settings.appTitle || '我的积分银行'}`;
    }
    if (topBalance) {
      topBalance.textContent = state.balance;
    }
  }

  // ==================== 工具函数 ====================
  
  /**
   * 转义 HTML，防止 XSS
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==================== 登录/注册 ====================

  function showLoginScreen() {
    hideAppElements();
    const screen = document.getElementById('screen-login');
    if (screen) {
      screen.style.display = 'flex';
      renderLoginForm(false);
    }
  }

  function renderLoginForm(isRegister) {
    const container = document.getElementById('login-form-container');
    if (!container) return;
    
    container.innerHTML = `
      <h2>${isRegister ? '📝 注册新家长' : '🔐 家长登录'}</h2>
      <form onsubmit="window._app.handleAuth(event, ${isRegister})">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="auth-username" placeholder="输入用户名" required minlength="2" autocomplete="username" />
        </div>
        <div class="form-group">
          <label>PIN 码（4-6位数字）</label>
          <input type="password" id="auth-pin" placeholder="输入PIN码" required pattern="[0-9]{4,6}" maxlength="6" autocomplete="${isRegister ? 'new-password' : 'current-password'}" />
        </div>
        ${isRegister ? '<div class="form-hint">注册时设置的PIN码将用于后续登录和家长操作确认</div>' : ''}
        <button type="submit" class="auth-btn">${isRegister ? '注册' : '登录'}</button>
      </form>
      <div class="auth-switch">
        ${isRegister 
          ? '<a href="#" onclick="window._app.toggleAuthMode(false); return false;">已有账号？去登录</a>'
          : '<a href="#" onclick="window._app.toggleAuthMode(true); return false;">还没有账号？注册一个</a>'
        }
      </div>
    `;
  }

  window._app.toggleAuthMode = function(isRegister) {
    renderLoginForm(isRegister);
  };

  window._app.handleAuth = async function(e, isRegister) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const pin = document.getElementById('auth-pin').value;
    
    const btn = e.target.querySelector('.auth-btn');
    btn.disabled = true;
    btn.textContent = '处理中...';
    
    try {
      let result;
      if (isRegister) {
        result = await STORAGE.register(username, pin);
      } else {
        result = await STORAGE.login(username, pin);
      }
      
      localStorage.setItem('pb_token', result.token);
      localStorage.setItem('pb_account_id', result.account_id);
      
      // 验证并进入下一步
      const me = await STORAGE.me();
      state.currentUser = { account_id: me.account_id, username: me.username };
      state.children = me.children || [];
      state.settings = me.settings || {};

      if (state.children.length === 0) {
        showAddChildScreen();
      } else {
        state.currentChild = state.children[0];
        STORAGE.setChildId(state.currentChild.id);
        await loadChildData();
        showAppScreen();
      }
    } catch (err) {
      showToast(err.message || '操作失败', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = isRegister ? '注册' : '登录';
    }
  };

  // ==================== 添加小孩 ====================

  function showAddChildScreen() {
    hideAppElements();
    const screen = document.getElementById('screen-add-child');
    if (screen) screen.style.display = 'flex';
    
    const container = document.getElementById('add-child-form');
    if (container) {
      container.innerHTML = `
        <h2>👶 添加第一个小孩</h2>
        <form onsubmit="window._app.handleAddChild(event)">
          <div class="form-group">
            <label>名字</label>
            <input type="text" id="child-name" placeholder="宝贝的名字" required />
          </div>
          <div class="form-group">
            <label>年龄</label>
            <input type="number" id="child-age" value="6" min="2" max="18" />
          </div>
          <div class="form-group">
            <label>主题色</label>
            <div class="color-picker">
              ${DATA.dimensions.map((d, i) => `
                <label class="color-option">
                  <input type="radio" name="child-color" value="${d.color}" ${i === 0 ? 'checked' : ''} />
                  <span class="color-circle" style="background:${d.color}"></span>
                </label>
              `).join('')}
            </div>
          </div>
          <button type="submit" class="auth-btn">添加并开始使用</button>
        </form>
      `;
    }
  }

  window._app.handleAddChild = async function(e) {
    e.preventDefault();
    const name = document.getElementById('child-name').value.trim();
    const age = parseInt(document.getElementById('child-age').value) || 6;
    const colorEl = document.querySelector('input[name="child-color"]:checked');
    const color = colorEl ? colorEl.value : '#4ECDC4';
    
    const btn = e.target.querySelector('.auth-btn');
    btn.disabled = true;
    btn.textContent = '添加中...';
    
    try {
      await STORAGE.addChild(name, age, '', color);
      // 刷新用户信息
      const me = await STORAGE.me();
      state.children = me.children || [];
      state.currentChild = state.children[0];
      STORAGE.setChildId(state.currentChild.id);
      await loadChildData();
      showAppScreen();
    } catch (err) {
      showToast(err.message || '添加失败', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '添加并开始使用';
    }
  };

  // ==================== 小孩切换 ====================

  function showChildSwitcher() {
    const modal = document.getElementById('child-switcher-modal');
    if (!modal) return;
    
    const list = document.getElementById('child-switcher-list');
    if (list) {
      list.innerHTML = state.children.map(c => `
        <div class="child-switch-item ${c.id === (state.currentChild?.id) ? 'active' : ''}" 
             onclick="window._app.switchChild('${c.id}')">
          <div class="child-switch-avatar" style="background:${c.color || '#4ECDC4'}">
            ${c.avatar ? `<img src="${c.avatar}" />` : c.name.charAt(0)}
          </div>
          <div class="child-switch-info">
            <div class="child-switch-name">${escapeHtml(c.name)}</div>
            <div class="child-switch-age">${c.age || 6}岁</div>
          </div>
          ${c.id === (state.currentChild?.id) ? '<span class="child-switch-active">✓</span>' : ''}
        </div>
      `).join('');
    }
    
    modal.style.display = 'flex';
  }

  window._app.switchChild = async function(childId) {
    if (childId === state.currentChild?.id) {
      hideChildSwitcher();
      return;
    }
    
    const child = state.children.find(c => c.id === childId);
    if (!child) return;
    
    state.currentChild = child;
    STORAGE.setChildId(childId);
    
    await loadChildData();
    hideChildSwitcher();
    switchTab(state.currentTab);
  };

  window._app.showChildSwitcher = showChildSwitcher;
  window._app.hideChildSwitcher = hideChildSwitcher;
  window._app.logout = async function() {
    try {
      await STORAGE.logout();
    } catch (e) {
      // 即使 API 失败也清除本地状态
    }
    showLoginScreen();
  };

  function hideChildSwitcher() {
    const modal = document.getElementById('child-switcher-modal');
    if (modal) modal.style.display = 'none';
  }

  // ==================== 屏幕管理 ====================

  function hideAppElements() {
    const ids = ['screen-login', 'screen-add-child', 'main-app', 'child-switcher-modal'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  function showAppScreen() {
    hideAppElements();
    const main = document.getElementById('main-app');
    if (main) main.style.display = 'block';
    
    // 绑定 Tab 导航
    bindTabs();
    // 渲染初始页面
    switchTab('map');
  }

  // ==================== Tab 路由 ====================

  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = function() {
        const tab = this.dataset.tab;
        switchTab(tab);
      };
    });
  }

  function switchTab(tabName) {
    state.currentTab = tabName;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    
    const page = document.getElementById(`page-${tabName}`);
    if (page) {
      page.classList.add('active');
      page.style.animation = 'none';
      page.offsetHeight;
      page.style.animation = '';
    }
    
    // 渲染对应模块
    const renderers = {
      map: renderMap,
      checkin: renderCheckin,
      reward: renderReward,
      review: renderReview,
      portfolio: renderPortfolio,
    };
    
    if (renderers[tabName]) {
      renderers[tabName]();
    }
  }

  // ==================== 模块1：成长地图 ====================

  async function renderMap() {
    const container = document.getElementById('map-container');
    if (!container) return;
    
    const dimStats = {};
    for (const dim of state.dimensions) {
      const todayDone = dim.tasks.filter(t => state.todayCheckins.includes(t.id)).length;
      dimStats[dim.id] = { total: dim.tasks.length, done: todayDone };
    }
    
    // 先加载所有历史交易，确定已点亮的维度
    let allTx = [];
    try {
      allTx = await STORAGE.queryTransactions({ type: 'earn' }, { limit: 500 });
    } catch (e) {
      console.warn('[App] 加载交易记录失败:', e);
    }
    const litDims = new Set();
    for (const tx of allTx) {
      if (tx.task_id) {
        const task = findTask(tx.task_id);
        if (task) litDims.add(task.dimension);
      }
    }
    
    let html = '';
    for (const dim of state.dimensions) {
      const stats = dimStats[dim.id];
      const isLit = litDims.has(dim.id);
      const progress = stats.total > 0 ? (stats.done / stats.total * 100) : 0;
      const pct = Math.round(progress);
      
      html += `
        <div class="dim-card ${isLit ? 'lit' : ''}" data-dim="${dim.id}" onclick="window._app.expandDimension('${dim.id}')">
          <div class="dim-icon">${dim.icon}</div>
          <div class="dim-name">${dim.name}</div>
          <div class="dim-progress">
            <div class="progress-ring" style="--progress: ${pct}; --color: ${dim.color};"></div>
            <span class="progress-text">${pct}%</span>
          </div>
          <div class="dim-stats">${stats.done}/${stats.total} 今日完成</div>
          <div class="dim-desc">${dim.description}</div>
          <div class="dim-tasks" id="dim-tasks-${dim.id}" style="display:none;">
            ${dim.tasks.map(task => {
              const checked = state.todayCheckins.includes(task.id);
              const minAgeOk = !task.minAge || (state.currentChild?.age || 6) >= task.minAge;
              return `
                <div class="task-mini ${checked ? 'done' : ''} ${!minAgeOk ? 'hidden-age' : ''}">
                  <span>${escapeHtml(task.name)}</span>
                  <span class="task-points">+${task.points}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
    
    container.innerHTML = html;
  }

  window._app.expandDimension = function(dimId) {
    const el = document.getElementById(`dim-tasks-${dimId}`);
    if (el) {
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
  };

  function findTask(taskId) {
    for (const dim of state.dimensions) {
      const task = dim.tasks.find(t => t.id === taskId);
      if (task) return { ...task, dimension: dim.id };
    }
    return null;
  }

  // ==================== 模块2：今日打卡 ====================

  function renderCheckin() {
    const container = document.getElementById('checkin-container');
    if (!container) return;
    
    const today = UTILS.getDateKey(new Date());
    STORAGE.queryTransactions({ dateFrom: today, dateTo: today }, { limit: 200 })
      .then(todayTx => {
        const todayEarned = todayTx.reduce((sum, tx) => sum + tx.amount, 0);
        const earnedEl = container.querySelector('.today-earned .big-number');
        if (earnedEl) earnedEl.textContent = todayEarned;
      }).catch(() => {});
    
    const filterBtns = `
      <button class="filter-btn active" data-filter="all" onclick="window._app.filterCheckin('all')">全部</button>
      ${state.dimensions.map(d => `
        <button class="filter-btn" data-filter="${d.id}" onclick="window._app.filterCheckin('${d.id}')">
          ${d.icon} ${d.name}
        </button>
      `).join('')}
    `;
    
    let html = `
      <div class="checkin-header">
        <div class="today-earned">
          <span class="big-number">0</span>
          <span class="label">今日已赚积分</span>
        </div>
        <div class="streak-badge">
          🔥 连续 ${state.streak} 天
        </div>
      </div>
      <div class="filter-bar">${filterBtns}</div>
      <div class="checkin-list" id="checkin-list">
    `;
    
    for (const dim of state.dimensions) {
      html += `
        <div class="dimension-group" data-dim="${dim.id}">
          <div class="group-header" style="border-left-color: ${dim.color};">
            <span class="group-icon">${dim.icon}</span>
            <span class="group-name">${dim.name}</span>
          </div>
          <div class="task-list">
      `;
      
      for (const task of dim.tasks) {
        const checked = state.todayCheckins.includes(task.id);
        const minAgeOk = !task.minAge || (state.currentChild?.age || 6) >= task.minAge;
        
        html += `
          <label class="task-item ${checked ? 'checked' : ''} ${!minAgeOk ? 'age-hidden' : ''}" data-task="${task.id}" data-dim="${dim.id}">
            <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._app.toggleCheckin('${task.id}', this.checked)" />
            <span class="task-label">${escapeHtml(task.name)}</span>
            <span class="task-points-badge">+${task.points}</span>
          </label>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    html += '</div>';
    container.innerHTML = html;
  }

  window._app.filterCheckin = function(filter) {
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === filter);
    });
    
    document.querySelectorAll('.dimension-group').forEach(g => {
      if (filter === 'all') {
        g.style.display = '';
      } else {
        g.style.display = g.dataset.dim === filter ? '' : 'none';
      }
    });
  };

  window._app.toggleCheckin = async function(taskId, checked) {
    if (!state.currentChild) return;
    
    if (checked) {
      if (state.todayCheckins.includes(taskId)) {
        showToast('今天已经打过卡啦！', 'info');
        return;
      }
      
      const task = findTask(taskId);
      if (!task) return;
      
      const today = UTILS.getDateKey(new Date());
      
      try {
        await STORAGE.addTransaction(state.currentChild.id, {
          type: 'earn',
          amount: task.points,
          task_id: taskId,
          note: `完成任务: ${task.name}`,
          date: today
        });
        
        playCheckinAnimation(task.points, task.color || '#4ECDC4');
        if (navigator.vibrate) navigator.vibrate(50);
        
        state.todayCheckins.push(taskId);
        state.balance += task.points;
        refreshTodayState();
        renderCheckin();
        showToast(`+${task.points} 积分！${task.name}`, 'success');
      } catch (err) {
        showToast('打卡失败: ' + err.message, 'error');
        // Restore checkbox
        const cb = document.querySelector(`input[data-task="${taskId}"]`);
        if (cb) cb.checked = false;
      }
    } else {
      if (!await parentGate('确定要取消这个打卡吗？')) {
        const cb = document.querySelector(`input[data-task="${taskId}"]`);
        if (cb) cb.checked = true;
        return;
      }
      
      // 取消打卡：加一笔负向调整
      try {
        const today = UTILS.getDateKey(new Date());
        const txs = await STORAGE.queryTransactions({ dateFrom: today, dateTo: today, type: 'earn' }, { limit: 200 });
        const taskTx = txs.filter(t => t.task_id === taskId);
        if (taskTx.length > 0) {
          await STORAGE.addTransaction(state.currentChild.id, {
            type: 'adjust',
            amount: -taskTx[0].amount,
            note: `取消打卡: ${taskTx[0].note}`,
            date: today
          });
          state.balance -= taskTx[0].amount;
          state.todayCheckins = state.todayCheckins.filter(t => t !== taskId);
          refreshTodayState();
          renderCheckin();
          showToast('已取消打卡', 'info');
        }
      } catch (err) {
        showToast('取消失败: ' + err.message, 'error');
      }
    }
  };

  function playCheckinAnimation(points, color) {
    const overlay = document.createElement('div');
    overlay.className = 'points-popup';
    overlay.textContent = `+${points}`;
    overlay.style.setProperty('--color', color);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 1200);
    createStarParticles(color);
  }

  function createStarParticles(color) {
    for (let i = 0; i < 8; i++) {
      const star = document.createElement('div');
      star.className = 'star-particle';
      star.textContent = '✦';
      star.style.left = (40 + Math.random() * 20) + '%';
      star.style.top = (30 + Math.random() * 20) + '%';
      star.style.color = color;
      star.style.fontSize = (12 + Math.random() * 16) + 'px';
      star.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(star);
      setTimeout(() => star.remove(), 1000);
    }
  }

  // ==================== 模块3：奖励兑换 ====================

  function renderReward() {
    const container = document.getElementById('reward-container');
    if (!container) return;
    
    const balance = state.balance;
    
    let html = `
      <div class="balance-display">
        <div class="balance-amount">${balance}</div>
        <div class="balance-label">${state.settings.currencyName || '积分'}余额</div>
      </div>
      
      <div class="reward-reminder">
        💡 积分不是为了控制孩子，而是让孩子看见：我的努力是有价值的。
      </div>
    `;
    
    for (const tier of state.rewards) {
      html += `
        <div class="reward-tier ${balance < tier.cost ? 'locked' : ''}">
          <div class="tier-header">
            <span class="tier-icon">${tier.icon}</span>
            <span class="tier-label">${tier.label}</span>
            <span class="tier-cost">${tier.cost} ${state.settings.currencyName || '积分'}</span>
          </div>
          <div class="tier-items">
      `;
      
      for (const item of tier.items) {
        const canAfford = balance >= tier.cost;
        html += `
          <div class="reward-item ${canAfford ? '' : 'locked'}">
            <span class="reward-name">${item.name}</span>
            <button class="claim-btn ${canAfford ? '' : 'disabled'}" 
                    onclick="window._app.claimReward('${item.id}', ${tier.cost})"
                    ${canAfford ? '' : 'disabled'}>
              ${canAfford ? '兑换' : '积分不够'}
            </button>
          </div>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    // 待确认的兑换请求
    if (state.pendingClaims.length > 0) {
      html += '<div class="pending-section"><h3>待确认兑换</h3>';
      for (const claim of state.pendingClaims) {
        html += `
          <div class="pending-claim">
            <span>${escapeHtml(claim.reward_name || claim.note)} (-${claim.cost})</span>
            <div class="claim-actions">
              <button class="approve-btn" onclick="window._app.confirmClaim('${claim.id}', true)">✅ 同意</button>
              <button class="reject-btn" onclick="window._app.confirmClaim('${claim.id}', false)">❌ 拒绝</button>
            </div>
          </div>
        `;
      }
      html += '</div>';
    }
    
    container.innerHTML = html;
  }

  window._app.claimReward = async function(itemId, cost) {
    if (!state.currentChild) return;
    if (state.balance < cost) {
      showToast('积分不够哦！继续加油吧~', 'warning');
      return;
    }
    
    if (!await parentGate(`确认兑换这个奖励吗？将消耗 ${cost} 积分`)) return;
    
    try {
      await STORAGE.addRewardClaim(state.currentChild.id, itemId, cost, `兑换奖励: ${itemId}`);
      refreshTodayState();
      renderReward();
      showToast('兑换申请已提交，等待家长确认', 'info');
    } catch (err) {
      showToast('兑换失败: ' + err.message, 'error');
    }
  };

  window._app.confirmClaim = async function(claimId, approved) {
    if (!state.currentChild) return;
    
    try {
      await STORAGE.confirmRewardClaim(state.currentChild.id, claimId, approved);
      refreshTodayState();
      renderReward();
      showToast(approved ? '兑换已确认！' : '兑换已拒绝', approved ? 'success' : 'info');
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
  };

  // ==================== 工具函数（escapeHtml 已移至顶部）====================
  
  // ==================== 模块4：每周复盘 ====================

  function renderReview() {
    const container = document.getElementById('review-container');
    if (!container) return;
    
    const weekRange = UTILS.getWeekRange();
    state.reviewWeek = weekRange;
    
    STORAGE.queryTransactions({
      dateFrom: weekRange.start,
      dateTo: weekRange.end
    }, { limit: 500 }).then(weekTx => {
      const tasksCompleted = weekTx.filter(t => t.type === 'earn').length;
      const pointsEarned = weekTx.reduce((s, t) => s + (t.amount || 0), 0);
      
      const litDims = new Set();
      for (const tx of weekTx) {
        if (tx.task_id) {
          const task = findTask(tx.task_id);
          if (task) litDims.add(task.dimension);
        }
      }
      
      return { tasksCompleted, pointsEarned, litDims: litDims.size, weekTx };
    }).then(stats => {
      const html = `
        <div class="review-stats">
          <div class="stat-card">
            <span class="stat-num">${stats.tasksCompleted}</span>
            <span class="stat-label">完成任务</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">${stats.pointsEarned}</span>
            <span class="stat-label">获得积分</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">${stats.litDims}/5</span>
            <span class="stat-label">点亮维度</span>
          </div>
        </div>
        
        <form class="review-form" onsubmit="window._app.submitReview(event)">
          <div class="review-field">
            <label>🌟 这周我最棒的一件事是……</label>
            <textarea name="bestThing" placeholder="让孩子自己写" rows="2"></textarea>
          </div>
          
          <div class="review-field">
            <label>💪 这周我遇到的困难是……</label>
            <textarea name="difficulty" placeholder="说出来没关系" rows="2"></textarea>
          </div>
          
          <div class="review-field">
            <label>👀 家长看见的进步</label>
            <textarea name="parentObservation" placeholder="家长填写" rows="2"></textarea>
          </div>
          
          <div class="review-field">
            <label>🤝 孩子希望的支持</label>
            <textarea name="childRequest" placeholder="让孩子提需求" rows="2"></textarea>
          </div>
          
          <button type="submit" class="submit-review-btn">提交本周复盘</button>
        </form>
      `;
      
      // 加载历史复盘
      if (state.currentChild) {
        STORAGE.listReviews(state.currentChild.id).then(reviews => {
          if (reviews.length > 0) {
            let histHtml = '<div class="history-reviews"><h3>📋 历史复盘</h3>';
            for (const rev of reviews.slice(-5).reverse()) {
              histHtml += `
                <div class="rev-card">
                  <div class="rev-date">${rev.week_start}</div>
                  ${rev.best_thing ? `<div class="rev-item"><strong>最棒的：</strong>${escapeHtml(rev.best_thing)}</div>` : ''}
                  ${rev.difficulty ? `<div class="rev-item"><strong>困难的：</strong>${escapeHtml(rev.difficulty)}</div>` : ''}
                  ${rev.parent_observation ? `<div class="rev-item"><strong>家长看到：</strong>${escapeHtml(rev.parent_observation)}</div>` : ''}
                </div>
              `;
            }
            histHtml += '</div>';
            container.insertAdjacentHTML('beforeend', histHtml);
          }
        }).catch(() => {});
      }
      
      container.innerHTML = html;
    }).catch(err => {
      container.innerHTML = `<div class="empty-state"><p>加载失败: ${escapeHtml(err.message)}</p></div>`;
    });
  }

  window._app.submitReview = function(e) {
    if (!state.currentChild) return;
    e.preventDefault();
    const form = e.target;
    const weekRange = state.reviewWeek;
    
    STORAGE.addReview(state.currentChild.id, {
      week_start: weekRange.start,
      best_thing: form.bestThing.value,
      difficulty: form.difficulty.value,
      parent_observation: form.parentObservation.value,
      child_request: form.childRequest.value,
    }).then(() => {
      showToast('复盘已保存！周末家庭会议完成 🎉', 'success');
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    }).catch(err => {
      showToast('保存失败: ' + err.message, 'error');
    });
  };

  // ==================== 模块5：成长作品 ====================

  async function renderPortfolio() {
    const container = document.getElementById('portfolio-container');
    if (!container) return;
    
    let items = [];
    if (state.currentChild) {
      try {
        items = await STORAGE.listPortfolio(state.currentChild.id);
      } catch (e) {
        console.warn('[App] 加载作品失败:', e);
      }
    }
    
    let html = `
      <div class="portfolio-header">
        <button class="add-portfolio-btn" onclick="window._app.showUploadForm()">📷 上传新作品</button>
      </div>
      
      <div id="upload-form" style="display:none;" class="upload-form">
        <input type="text" id="pf-title" placeholder="作品标题" />
        <textarea id="pf-desc" placeholder="作品描述（选填）" rows="2"></textarea>
        <select id="pf-dimension">
          <option value="">选择成长维度</option>
          ${state.dimensions.map(d => `<option value="${d.id}">${d.icon} ${d.name}</option>`).join('')}
        </select>
        <input type="file" id="pf-file" accept="image/*,video/*" onchange="window._app.handleFileSelect(this)" />
        <button class="submit-portfolio-btn" onclick="window._app.submitPortfolio()">保存作品</button>
      </div>
    `;
    
    if (items.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-icon">📸</div>
          <p>还没有作品哦！</p>
          <p class="empty-hint">孩子画的画、写的日记、做饭的照片……都可以上传到这里。</p>
          <p class="empty-hint">暑假结束时，这里会自动生成一份独一无二的成长档案。</p>
        </div>
      `;
    } else {
      html += '<div class="portfolio-grid">';
      for (const item of items) {
        const dim = state.dimensions.find(d => d.id === item.dimension);
        const imgPlaceholder = item.media_ref
          ? `<img id="pf-img-${item.id}" src="" alt="${escapeHtml(item.title)}" class="pf-image pf-loading" data-ref="${item.media_ref}" />`
          : '';
        html += `
          <div class="portfolio-card">
            <div class="pf-dim-tag" style="background:${dim ? dim.color : '#ccc'}">${dim ? dim.name : ''}</div>
            <h4>${escapeHtml(item.title)}</h4>
            ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
            <div class="pf-meta">
              <span>${new Date(item.created_at).toLocaleDateString('zh-CN')}</span>
            </div>
            ${imgPlaceholder}
          </div>
        `;
      }
      html += '</div>';
      
      // 异步加载图片
      for (const item of items) {
        if (item.media_ref) {
          try {
            const data = await STORAGE.getMedia(item.media_ref);
            if (data) {
              const img = document.getElementById(`pf-img-${item.id}`);
              if (img) {
                img.src = data;
                img.classList.remove('pf-loading');
              }
            }
          } catch (e) {
            console.warn('[App] 加载作品图片失败:', e);
          }
        }
      }
    }
    
    container.innerHTML = html;
  }

  window._app.showUploadForm = function() {
    document.getElementById('upload-form').style.display = 'block';
  };

  window._app.handleFileSelect = async function(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      window._app._selectedMedia = e.target.result;
      window._app._selectedMediaType = file.type.startsWith('video') ? 'video' : 'photo';
    };
    reader.readAsDataURL(file);
  };

  window._app.submitPortfolio = async function() {
    if (!state.currentChild) return;
    const title = document.getElementById('pf-title').value.trim() || '新作品';
    const desc = document.getElementById('pf-desc').value.trim();
    const dim = document.getElementById('pf-dimension').value;
    
    try {
      const item = await STORAGE.addPortfolio(state.currentChild.id, {
        title,
        description: desc,
        dimension: dim,
        media_type: window._app._selectedMediaType || null,
      });
      
      if (window._app._selectedMedia) {
        await STORAGE.saveMedia(item.id, state.currentChild.id, window._app._selectedMedia, window._app._selectedMediaType);
      }
      
      showToast('作品已保存！', 'success');
      renderPortfolio();
    } catch (err) {
      showToast('保存失败: ' + err.message, 'error');
    }
  };

  // ==================== 家长门禁 ====================
  
  async function parentGate(message) {
    if (message) {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'parent-gate-overlay';
        overlay.innerHTML = `
          <div class="parent-gate-modal">
            <p>${message}</p>
            <div class="gate-buttons">
              <button class="gate-confirm" onclick="this.closest('.parent-gate-overlay').remove(); window._gateResolve(true);">确认</button>
              <button class="gate-cancel" onclick="this.closest('.parent-gate-overlay').remove(); window._gateResolve(false);">取消</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
        window._gateResolve = resolve;
      });
    }
    return true;
  }

  // ==================== Toast 通知 ====================
  
  function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ==================== 刷新状态 ====================
  
  function refreshTodayState() {
    const topBalance = document.getElementById('top-balance');
    if (topBalance) {
      topBalance.textContent = state.balance;
    }
  }

  // ==================== 暴露全局 ====================
  
  window.PointsBankApp = {
    init,
    switchTab,
    refreshTodayState,
    getBalance: () => state.balance,
  };

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
