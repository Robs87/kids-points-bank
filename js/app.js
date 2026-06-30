/**
 * 积分银行 - 核心应用逻辑
 * 
 * 功能：
 * - 底部 Tab 路由（地图/打卡/兑换/复盘/作品）
 * - 全局状态管理（余额、今日打卡、连续天数）
 * - 5 个模块的渲染与交互
 * - 家长门禁（长按或 PIN）
 * - 积分动画 + 震动反馈
 */

(function() {
  'use strict';

  const STORAGE = window.PointsBankStorage;
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
    selectedDimension: null,
    reviewWeek: null,
  };

  // ==================== 初始化 ====================
  function init() {
    const isFirstOpen = STORAGE.initIfFirstOpen();
    state.settings = STORAGE.getSettings();
    state.dimensions = DATA.dimensions;
    state.rewards = DATA.rewards;
    state.pendingClaims = STORAGE.getPendingClaims();
    state.streak = STORAGE.calculateStreak();
    
    // 绑定 Tab 导航
    bindTabs();
    
    // 加载今日状态
    refreshTodayState();
    
    // 渲染初始页面
    switchTab('map');
    
    // 首次打开显示欢迎页
    if (isFirstOpen) {
      showWelcome();
    }
  }

  function refreshTodayState() {
    const today = STORAGE.getDateKey(new Date());
    state.todayCheckins = STORAGE.getDayCheckins(today);
    state.balance = STORAGE.getBalance();
    
    // 更新顶部余额显示
    const topBalance = document.getElementById('top-balance');
    if (topBalance) {
      topBalance.textContent = state.balance;
    }
  }

  // ==================== Tab 路由 ====================
  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });
  }

  function switchTab(tabName) {
    state.currentTab = tabName;
    
    // 更新底部导航高亮
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    
    // 显示目标页面
    const page = document.getElementById(`page-${tabName}`);
    if (page) {
      page.classList.add('active');
      // 触发入场动画
      page.style.animation = 'none';
      page.offsetHeight; // reflow
      page.style.animation = '';
    }
    
    // 刷新数据
    refreshTodayState();
    
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
  function renderMap() {
    const container = document.getElementById('map-container');
    if (!container) return;
    
    // 计算每个维度已完成的今日任务
    const dimStats = {};
    for (const dim of state.dimensions) {
      const todayDone = dim.tasks.filter(t => state.todayCheckins.includes(t.id)).length;
      dimStats[dim.id] = { total: dim.tasks.length, done: todayDone };
    }
    
    // 计算哪些维度已被点亮（历史上至少完成过1次）
    const allTx = STORAGE.queryTransactions({ type: 'earn' });
    const litDims = new Set();
    for (const tx of allTx) {
      if (tx.taskId) {
        const task = findTask(tx.taskId);
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
              const minAgeOk = !task.minAge || getAge() >= task.minAge;
              return `
                <div class="task-mini ${checked ? 'done' : ''} ${!minAgeOk ? 'hidden-age' : ''}">
                  <span>${task.name}</span>
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

  window._app = {
    expandDimension: function(dimId) {
      const el = document.getElementById(`dim-tasks-${dimId}`);
      if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
    }
  };

  function findTask(taskId) {
    for (const dim of state.dimensions) {
      const task = dim.tasks.find(t => t.id === taskId);
      if (task) return { ...task, dimension: dim.id };
    }
    return null;
  }

  function getAge() {
    const settings = STORAGE.getSettings();
    return settings.childAge || 6;
  }

  // ==================== 模块2：今日打卡 ====================
  function renderCheckin() {
    const container = document.getElementById('checkin-container');
    if (!container) return;
    
    const today = STORAGE.getDateKey(new Date());
    const todayTx = STORAGE.queryTransactions({ dateFrom: today, dateTo: today });
    const todayEarned = todayTx.reduce((sum, tx) => sum + tx.amount, 0);
    
    // 筛选标签
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
          <span class="big-number">${todayEarned}</span>
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
        const minAgeOk = !task.minAge || getAge() >= task.minAge;
        
        html += `
          <label class="task-item ${checked ? 'checked' : ''} ${!minAgeOk ? 'age-hidden' : ''}" data-task="${task.id}" data-dim="${dim.id}">
            <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._app.toggleCheckin('${task.id}', this.checked)" />
            <span class="task-label">${task.name}</span>
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
    if (checked) {
      // 检查是否已打卡
      if (STORAGE.hasCheckedIn(taskId)) {
        showToast('今天已经打过卡啦！', 'info');
        return;
      }
      
      const task = findTask(taskId);
      if (!task) return;
      
      // 检查每日上限
      const today = STORAGE.getDateKey(new Date());
      const todayTx = STORAGE.queryTransactions({ dateFrom: today, dateTo: today, type: 'earn' });
      if (todayTx.length >= (state.settings.maxDailyTasks || 10)) {
        showToast('今日打卡已达上限！', 'warning');
        return;
      }
      
      // 添加交易
      STORAGE.addTransaction({
        type: 'earn',
        amount: task.points,
        taskId: taskId,
        note: `完成任务: ${task.name}`,
        date: today
      });
      
      // 动画效果
      playCheckinAnimation(task.points, task.color || '#4ECDC4');
      
      // 震动反馈
      if (navigator.vibrate) navigator.vibrate(50);
      
      // 检查连续打卡奖励
      const newStreak = STORAGE.calculateStreak();
      if (newStreak > state.streak) {
        // 新的连续天数
        const bonusThresholds = DATA.streakBonus.days;
        for (const threshold of bonusThresholds) {
          if (newStreak === threshold) {
            STORAGE.addTransaction({
              type: 'bonus',
              amount: DATA.streakBonus.bonus,
              note: `连续打卡 ${threshold} 天奖励！`,
              date: today
            });
            showToast(`🎉 连续打卡 ${threshold} 天！获得 +${DATA.streakBonus.bonus} 奖励积分`, 'success');
            break;
          }
        }
      }
      
      state.streak = newStreak;
      refreshTodayState();
      renderCheckin();
      showToast(`+${task.points} 积分！${task.name}`, 'success');
      
    } else {
      // 取消打卡（需要家长确认）
      if (!await parentGate('确定要取消这个打卡吗？')) {
        // 恢复勾选
        const cb = document.querySelector(`input[data-task="${taskId}"]`);
        if (cb) cb.checked = true;
        return;
      }
      
      // 移除最后一笔该任务的交易
      const today = STORAGE.getDateKey(new Date());
      const txs = STORAGE.queryTransactions({ dateFrom: today, dateTo: today, taskId: taskId });
      if (txs.length > 0) {
        const lastTx = txs[0];
        STORAGE.addTransaction({
          type: 'adjust',
          amount: -lastTx.amount,
          note: `取消打卡: ${lastTx.note}`,
          date: today
        });
        refreshTodayState();
        renderCheckin();
      }
    }
  };

  function playCheckinAnimation(points, color) {
    // 创建飘浮积分动画
    const overlay = document.createElement('div');
    overlay.className = 'points-popup';
    overlay.textContent = `+${points}`;
    overlay.style.setProperty('--color', color);
    document.body.appendChild(overlay);
    
    setTimeout(() => overlay.remove(), 1200);
    
    // 星星粒子效果
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
              ${canAfford ? '兑换' : '积分不足'}
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
            <span>${claim.note || '自定义奖励'} (-${claim.cost})</span>
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
    if (state.balance < cost) {
      showToast('积分不够哦！继续加油吧~', 'warning');
      return;
    }
    
    // 家长确认
    const confirmed = await parentGate(`确认兑换这个奖励吗？将消耗 ${cost} 积分`);
    if (!confirmed) return;
    
    const claim = STORAGE.addRewardClaim(itemId, cost, `兑换奖励: ${itemId}`);
    refreshTodayState();
    renderReward();
    showToast('兑换申请已提交，等待家长确认', 'info');
  };

  window._app.confirmClaim = async function(claimId, approved) {
    // 需要 PIN 码
    const pin = await promptPin();
    if (!pin) return;
    
    const settings = STORAGE.getSettings();
    if (settings.parentPin && pin !== settings.parentPin) {
      showToast('PIN 码错误', 'error');
      return;
    }
    
    STORAGE.confirmRewardClaim(claimId, approved);
    refreshTodayState();
    renderReward();
    showToast(approved ? '兑换已确认！' : '兑换已拒绝', approved ? 'success' : 'info');
  };

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

  // ==================== 模块4：每周复盘 ====================
  function renderReview() {
    const container = document.getElementById('review-container');
    if (!container) return;
    
    const weekRange = STORAGE.getWeekRange();
    state.reviewWeek = weekRange;
    
    // 本周统计数据
    const weekTx = STORAGE.queryTransactions({
      dateFrom: weekRange.start,
      dateTo: weekRange.end
    });
    const tasksCompleted = weekTx.filter(t => t.type === 'earn').length;
    const pointsEarned = weekTx.reduce((s, t) => s + (t.amount || 0), 0);
    
    // 已点亮的维度数
    const litDims = new Set();
    for (const tx of weekTx) {
      if (tx.taskId) {
        const task = findTask(tx.taskId);
        if (task) litDims.add(task.dimension);
      }
    }
    
    // 已有复盘？
    const reviews = STORAGE.getReviews();
    const existing = reviews.find(r => r.weekStart === weekRange.start);
    
    let html = `
      <div class="review-stats">
        <div class="stat-card">
          <span class="stat-num">${tasksCompleted}</span>
          <span class="stat-label">完成任务</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">${pointsEarned}</span>
          <span class="stat-label">获得积分</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">${litDims.size}/5</span>
          <span class="stat-label">点亮维度</span>
        </div>
      </div>
      
      <form class="review-form" onsubmit="window._app.submitReview(event)">
        <div class="review-field">
          <label>🌟 这周我最棒的一件事是……</label>
          <textarea name="bestThing" placeholder="让孩子自己写" rows="2">${existing ? existing.bestThing : ''}</textarea>
        </div>
        
        <div class="review-field">
          <label>💪 这周我遇到的困难是……</label>
          <textarea name="difficulty" placeholder="说出来没关系" rows="2">${existing ? existing.difficulty : ''}</textarea>
        </div>
        
        <div class="review-field">
          <label>👀 家长看见的进步</label>
          <textarea name="parentObservation" placeholder="家长填写" rows="2">${existing ? existing.parentObservation : ''}</textarea>
        </div>
        
        <div class="review-field">
          <label>🤝 孩子希望的支持</label>
          <textarea name="childRequest" placeholder="让孩子提需求" rows="2">${existing ? existing.childRequest : ''}</textarea>
        </div>
        
        <button type="submit" class="submit-review-btn">提交本周复盘</button>
      </form>
    `;
    
    // 历史复盘
    if (reviews.length > 0) {
      html += '<div class="history-reviews"><h3>📋 历史复盘</h3>';
      for (const rev of reviews.slice(-5).reverse()) {
        html += `
          <div class="rev-card">
            <div class="rev-date">${rev.weekStart}</div>
            ${rev.bestThing ? `<div class="rev-item"><strong>最棒的：</strong>${escapeHtml(rev.bestThing)}</div>` : ''}
            ${rev.difficulty ? `<div class="rev-item"><strong>困难的：</strong>${escapeHtml(rev.difficulty)}</div>` : ''}
            ${rev.parentObservation ? `<div class="rev-item"><strong>家长看到：</strong>${escapeHtml(rev.parentObservation)}</div>` : ''}
          </div>
        `;
      }
      html += '</div>';
    }
    
    container.innerHTML = html;
  }

  window._app.submitReview = function(e) {
    e.preventDefault();
    const form = e.target;
    const weekRange = state.reviewWeek;
    
    const weekTx = STORAGE.queryTransactions({
      dateFrom: weekRange.start,
      dateTo: weekRange.end
    });
    
    const litDims = new Set();
    for (const tx of weekTx) {
      if (tx.taskId) {
        const task = findTask(tx.taskId);
        if (task) litDims.add(task.dimension);
      }
    }
    
    STORAGE.addReview(weekRange.start, {
      bestThing: form.bestThing.value,
      difficulty: form.difficulty.value,
      parentObservation: form.parentObservation.value,
      childRequest: form.childRequest.value,
      tasksCompleted: weekTx.filter(t => t.type === 'earn').length,
      pointsEarned: weekTx.reduce((s, t) => s + (t.amount || 0), 0),
      dimensionsLit: litDims.size,
    });
    
    showToast('复盘已保存！周末家庭会议完成 🎉', 'success');
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
  };

  // ==================== 模块5：成长作品 ====================
  async function renderPortfolio() {
    const container = document.getElementById('portfolio-container');
    if (!container) return;
    
    const items = STORAGE.getPortfolio();
    
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
        const imgPlaceholder = item.mediaRef
          ? `<img id="pf-img-${item.id}" src="" alt="${escapeHtml(item.title)}" class="pf-image pf-loading" data-ref="${item.mediaRef}" />`
          : '';
        html += `
          <div class="portfolio-card">
            <div class="pf-dim-tag" style="background:${dim ? dim.color : '#ccc'}">${dim ? dim.name : ''}</div>
            <h4>${escapeHtml(item.title)}</h4>
            ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
            <div class="pf-meta">
              <span>${new Date(item.createdAt).toLocaleDateString('zh-CN')}</span>
            </div>
            ${imgPlaceholder}
          </div>
        `;
      }
      html += '</div>';
      
      // 异步加载 IndexedDB 中的图片
      for (const item of items) {
        if (item.mediaRef) {
          try {
            const data = await STORAGE.getMedia(item.mediaRef);
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
    const title = document.getElementById('pf-title').value.trim() || '新作品';
    const desc = document.getElementById('pf-desc').value.trim();
    const dim = document.getElementById('pf-dimension').value;
    
    const item = STORAGE.addPortfolioItem({
      title,
      description: desc,
      dimension: dim,
      mediaType: window._app._selectedMediaType || null,
    });
    
    // 如果有媒体文件，存到 IndexedDB
    if (window._app._selectedMedia) {
      try {
        await STORAGE.saveMedia(item.id, window._app._selectedMedia, window._app._selectedMediaType);
        // 更新 portfolio 项，存引用
        const portfolio = STORAGE.getPortfolio();
        const idx = portfolio.findIndex(p => p.id === item.id);
        if (idx !== -1) {
          portfolio[idx].mediaRef = item.id;
          STORAGE.save('portfolio', portfolio);
        }
      } catch (e) {
        console.warn('[App] 媒体存储失败:', e);
      }
    }
    
    showToast('作品已保存！', 'success');
    renderPortfolio();
  };

  // ==================== 家长门禁 ====================
  async function parentGate(message) {
    // 方法1：长按确认（适合给孩子用的场景）
    // 方法2：PIN码（适合敏感操作）
    
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

  async function promptPin() {
    const settings = STORAGE.getSettings();
    if (!settings.parentPin) return true; // 没有设PIN就直接通过
    
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'parent-gate-overlay';
      overlay.innerHTML = `
        <div class="parent-gate-modal">
          <p>请输入家长 PIN 码</p>
          <input type="password" id="pin-input" maxlength="6" placeholder="PIN 码" />
          <div class="gate-buttons">
            <button class="gate-confirm" onclick="window._pinResolve(document.getElementById('pin-input').value); this.closest('.parent-gate-overlay').remove();">确认</button>
            <button class="gate-cancel" onclick="window._pinResolve(null); this.closest('.parent-gate-overlay').remove();">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      window._pinResolve = resolve;
      setTimeout(() => {
        const inp = document.getElementById('pin-input');
        if (inp) inp.focus();
      }, 100);
    });
  }

  // ==================== Toast 通知 ====================
  function showToast(message, type = 'info') {
    // 移除已有的 toast
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

  // ==================== 欢迎页 ====================
  function showWelcome() {
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML = `
      <div class="welcome-modal">
        <h1>🏦 ${state.settings.appTitle || '我的积分银行'}</h1>
        <p>欢迎来到积分银行！</p>
        <p>在这里，每一次努力都会变成看得见的积分。</p>
        <p>完成挑战 → 赚取积分 → 兑换奖励 → 见证成长</p>
        <button class="welcome-start-btn" onclick="this.closest('.welcome-overlay').remove()">开始赚钱吧！</button>
      </div>
    `;
    document.body.appendChild(overlay);
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
