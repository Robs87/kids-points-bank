/**
 * 积分银行 - 存储层
 * 
 * localStorage 存结构化数据（积分/任务/设置）
 * IndexedDB 存媒体文件（成长作品图片/视频）
 * 支持数据导出/导入备份
 */

const STORAGE_KEYS = {
  transactions: 'pb_transactions',
  checkins: 'pb_checkins',
  rewards: 'pb_rewards',
  reviews: 'pb_reviews',
  portfolio: 'pb_portfolio',
  settings: 'pb_settings',
  firstOpen: 'pb_first_open',
  schemaVersion: 'pb_schema_version'
};

const SCHEMA_VERSION = 1;
const DB_NAME = 'PointsBankDB';
const DB_STORE = 'media';
const DB_VERSION = 1;

// ==================== 通用存储 ====================

function save(key, data) {
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`[Storage] 保存 ${key} 失败:`, e);
    return false;
  }
}

function load(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.error(`[Storage] 读取 ${key} 失败:`, e);
    return defaultValue;
  }
}

// ==================== 事务账本 ====================

/**
 * 添加一笔交易（赚积分或花积分）
 * @param {Object} tx - { type: 'earn'|'spend'|'bonus'|'adjust', amount: number, taskId?: string, rewardId?: string, note?: string, date: string }
 */
function addTransaction(tx) {
  const transactions = load('transactions', []);
  
  // 自动补全日期字段
  if (!tx.date) {
    tx.date = getDateKey(new Date());
  }
  
  // 生成唯一ID
  tx.id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  tx.createdAt = new Date().toISOString();
  
  transactions.push(tx);
  save('transactions', transactions);
  
  // 如果是赚积分，记录到当日打卡
  if (tx.type === 'earn' && tx.taskId) {
    const today = tx.date;
    const checkins = load('checkins', {});
    if (!checkins[today]) checkins[today] = [];
    if (!checkins[today].includes(tx.taskId)) {
      checkins[today].push(tx.taskId);
      save('checkins', checkins);
    }
  }
  
  return tx;
}

/**
 * 查询交易记录
 * @param {Object} opts - { type?, dateFrom?, dateTo?, taskId?, limit? }
 */
function queryTransactions(opts = {}) {
  const transactions = load('transactions', []);
  let result = [...transactions];
  
  if (opts.type) result = result.filter(t => t.type === opts.type);
  if (opts.dateFrom) result = result.filter(t => t.date >= opts.dateFrom);
  if (opts.dateTo) result = result.filter(t => t.date <= opts.dateTo);
  if (opts.taskId) result = result.filter(t => t.taskId === opts.taskId);
  if (opts.limit) result = result.slice(-opts.limit);
  
  return result.reverse(); // 最新的在前
}

/**
 * 计算指定日期的积分余额
 */
function getBalance(dateFrom = null, dateTo = null) {
  const transactions = queryTransactions({ dateFrom, dateTo });
  let balance = 0;
  for (const tx of transactions) {
    if (tx.type === 'earn' || tx.type === 'bonus' || tx.type === 'adjust') {
      balance += tx.amount;
    } else if (tx.type === 'spend') {
      balance -= tx.amount;
    }
  }
  return balance;
}

// ==================== 打卡记录 ====================

/**
 * 检查某日是否已打卡某任务
 */
function hasCheckedIn(taskId, date = null) {
  if (!date) date = getDateKey(new Date());
  const checkins = load('checkins', {});
  return !!(checkins[date] && checkins[date].includes(taskId));
}

/**
 * 获取指定日期的打卡列表
 */
function getDayCheckins(date = null) {
  if (!date) date = getDateKey(new Date());
  const checkins = load('checkins', {});
  return checkins[date] || [];
}

/**
 * 计算连续打卡天数
 */
function calculateStreak() {
  const checkins = load('checkins', {});
  const dates = Object.keys(checkins).sort().reverse();
  if (dates.length === 0) return 0;
  
  let streak = 0;
  const today = new Date();
  
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getDateKey(d);
    
    if (checkins[key] && checkins[key].length > 0) {
      streak++;
    } else if (i > 0) {
      // 允许今天还没到打卡时间，但从昨天开始断
      break;
    }
  }
  
  return streak;
}

// ==================== 奖励兑换 ====================

/**
 * 添加奖励兑换请求（待确认状态）
 */
function addRewardClaim(rewardId, cost, note = '') {
  const claims = load('rewards', []);
  claims.push({
    id: 'claim_' + Date.now(),
    rewardId,
    cost,
    note,
    status: 'pending', // pending | approved | rejected
    claimedAt: new Date().toISOString(),
  });
  save('rewards', claims);
  return claims[claims.length - 1];
}

/**
 * 确认/拒绝奖励兑换
 */
function confirmRewardClaim(claimId, approved = true) {
  const claims = load('rewards', []);
  const idx = claims.findIndex(c => c.id === claimId);
  if (idx === -1) return null;
  
  claims[idx].status = approved ? 'approved' : 'rejected';
  claims[idx].confirmedAt = new Date().toISOString();
  save('rewards', claims);
  
  if (approved) {
    // 扣除积分
    addTransaction({
      type: 'spend',
      amount: claims[idx].cost,
      rewardId: claimId,
      note: `兑换奖励: ${claims[idx].note || '自定义奖励'}`
    });
  }
  
  return claims[idx];
}

/**
 * 获取待确认的兑换
 */
function getPendingClaims() {
  const claims = load('rewards', []);
  return claims.filter(c => c.status === 'pending');
}

// ==================== 每周复盘 ====================

/**
 * 添加复盘记录
 */
function addReview(weekStart, data) {
  const reviews = load('reviews', []);
  reviews.push({
    id: 'rev_' + Date.now(),
    weekStart,
    bestThing: data.bestThing || '',
    difficulty: data.difficulty || '',
    parentObservation: data.parentObservation || '',
    childRequest: data.childRequest || '',
    tasksCompleted: data.tasksCompleted || 0,
    pointsEarned: data.pointsEarned || 0,
    dimensionsLit: data.dimensionsLit || 0,
    createdAt: new Date().toISOString()
  });
  save('reviews', reviews);
  return reviews[reviews.length - 1];
}

function getReviews() {
  return load('reviews', []);
}

// ==================== 成长作品 ====================

/**
 * 添加成长作品（纯文本元数据，图片存 IndexedDB，只存引用）
 */
function addPortfolioItem(item) {
  const portfolio = load('portfolio', []);
  portfolio.push({
    id: 'pf_' + Date.now(),
    title: item.title || '新作品',
    description: item.description || '',
    dimension: item.dimension || '',
    mediaUrl: null, // 不存 base64，改用 mediaRef 指向 IndexedDB
    mediaRef: null, // IndexedDB key
    mediaType: item.mediaType || null, // photo | video
    createdAt: new Date().toISOString()
  });
  save('portfolio', portfolio);
  return portfolio[portfolio.length - 1];
}

function getPortfolio() {
  return load('portfolio', []);
}

// ==================== IndexedDB 媒体存储 ====================

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        const store = db.createObjectStore(DB_STORE, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
    };
    
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
  
  return dbPromise;
}

/**
 * 保存图片到 IndexedDB
 * @param {string} id - 唯一标识（通常是 portfolio item id）
 * @param {string} base64Data - base64 编码的图片数据
 * @param {string} type - 'photo' | 'video'
 */
async function saveMedia(id, base64Data, type = 'photo') {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      
      // 压缩图片（如果是图片类型且超过500KB）
      if (type === 'photo' && base64Data.length > 500000) {
        // 超过500KB则异步压缩
        compressImageAsync(base64Data).then(compressed => {
          store.put({ id, data: compressed, type, date: getDateKey(new Date()), savedAt: new Date().toISOString() });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        }).catch(err => {
          console.warn('[Storage] 图片压缩失败，直接存储原始数据:', err);
          store.put({ id, data: base64Data, type, date: getDateKey(new Date()), savedAt: new Date().toISOString() });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });
        return;
      }
      
      store.put({ id, data: base64Data, type, date: getDateKey(new Date()), savedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[Storage] IndexedDB 写入失败，回退到内存:', e);
    return false;
  }
}

/**
 * 从 IndexedDB 读取媒体
 */
async function getMedia(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

/**
 * 异步图片压缩（Promise 版）
 * @param {string} base64Data - base64 编码的图片数据
 * @returns {Promise<string>} 压缩后的 base64 数据
 */
function compressImageAsync(base64Data) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      const MAX = 1200;
      if (w > MAX || h > MAX) {
        if (w > h) { h = h * MAX / w; w = MAX; }
        else { w = w * MAX / h; h = MAX; }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.7);
      resolve(compressed);
    };
    img.onerror = () => reject(new Error('Image compression failed'));
    img.src = base64Data;
  });
}

// ==================== 设置管理 ====================

function getSettings() {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_DATA.settings));
  const saved = load('settings', {});
  return { ...defaults, ...saved };
}

function saveSettings(settings) {
  const current = getSettings();
  save('settings', { ...current, ...settings });
}

// ==================== 数据导出/导入 ====================

/**
 * 导出所有数据为 JSON 文件
 */
function exportAllData() {
  const data = {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: load('transactions', []),
    checkins: load('checkins', {}),
    rewards: load('rewards', []),
    reviews: load('reviews', []),
    portfolio: load('portfolio', []),
    settings: load('settings', {}),
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `积分银行备份_${getDateKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导入数据（覆盖当前数据）
 */
function importAllData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data.transactions) save('transactions', data.transactions);
    if (data.checkins) save('checkins', data.checkins);
    if (data.rewards) save('rewards', data.rewards);
    if (data.reviews) save('reviews', data.reviews);
    if (data.portfolio) save('portfolio', data.portfolio);
    if (data.settings) save('settings', data.settings);
    return true;
  } catch (e) {
    console.error('[Storage] 导入失败:', e);
    return false;
  }
}

// ==================== 工具函数 ====================

function getDateKey(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 周一
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: getDateKey(monday),
    end: getDateKey(sunday)
  };
}

// ==================== 初始化 ====================

function initIfFirstOpen() {
  const firstOpen = localStorage.getItem(STORAGE_KEYS.firstOpen);
  if (!firstOpen) {
    localStorage.setItem(STORAGE_KEYS.firstOpen, new Date().toISOString());
    // 设置开始日期
    const settings = getSettings();
    settings.startDate = getDateKey(new Date());
    saveSettings(settings);
    return true; // 首次打开
  }
  return false;
}

// 暴露给全局
window.PointsBankStorage = {
  save, load,
  addTransaction, queryTransactions, getBalance,
  hasCheckedIn, getDayCheckins, calculateStreak,
  addRewardClaim, confirmRewardClaim, getPendingClaims,
  addReview, getReviews,
  addPortfolioItem, getPortfolio,
  saveMedia, getMedia,
  getSettings, saveSettings,
  exportAllData, importAllData,
  getDateKey, getWeekRange,
  initIfFirstOpen,
  STORAGE_KEYS
};
