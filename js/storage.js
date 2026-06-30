/**
 * 积分银行 - 存储层（API 版本）
 * 
 * 所有数据通过 REST API 存取到后端数据库
 * 本地仅保存 token 和当前选中的小孩 ID
 */

const API_BASE = (function() {
  // 开发时同域部署，生产时通过 Nginx 反向代理到 /api
  const origin = window.location.origin;
  return origin;
})();

const API = {
  _getToken() {
    return localStorage.getItem('pb_token');
  },
  
  _getAccountId() {
    return localStorage.getItem('pb_account_id');
  },
  
  _getChildId() {
    return localStorage.getItem('pb_child_id');
  },
  
  _setChildId(id) {
    localStorage.setItem('pb_child_id', id);
  },
  
  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const token = this._getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },
  
  _parse(resp) {
    return resp.json().then(data => {
      if (!resp.ok) {
        return Promise.reject(new Error(data.error || `HTTP ${resp.status}`));
      }
      return data;
    });
  },
  
  // ==================== Auth ====================
  
  login(username, pin) {
    return fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ username, pin })
    }).then(this._parse);
  },
  
  register(username, pin) {
    return fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ username, pin })
    }).then(this._parse);
  },
  
  logout() {
    const token = this._getToken();
    return fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(this._parse).catch(() => {}).finally(() => {
      localStorage.removeItem('pb_token');
      localStorage.removeItem('pb_account_id');
      localStorage.removeItem('pb_child_id');
    });
  },
  
  me() {
    return fetch(`${API_BASE}/api/auth/me`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  isLoggedIn() {
    return !!this._getToken();
  },
  
  // ==================== Children ====================
  
  listChildren() {
    return fetch(`${API_BASE}/api/children`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  addChild(name, age, avatar, color) {
    return fetch(`${API_BASE}/api/children`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ name, age: age || 6, avatar: avatar || '', color: color || '#4ECDC4' })
    }).then(this._parse);
  },
  
  updateChild(childId, data) {
    return fetch(`${API_BASE}/api/children/${childId}`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(data)
    }).then(this._parse);
  },
  
  deleteChild(childId) {
    return fetch(`${API_BASE}/api/children/${childId}`, {
      method: 'DELETE',
      headers: this._headers()
    }).then(this._parse);
  },
  
  getChildId() {
    return this._getChildId();
  },
  
  setChildId(id) {
    this._setChildId(id);
  },
  
  // ==================== Transactions ====================
  
  addTransaction(childId, tx) {
    return fetch(`${API_BASE}/api/children/${childId}/transactions`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(tx)
    }).then(this._parse);
  },
  
  queryTransactions(childId, opts = {}) {
    const params = new URLSearchParams();
    if (opts.type) params.set('type', opts.type);
    if (opts.dateFrom) params.set('dateFrom', opts.dateFrom);
    if (opts.dateTo) params.set('dateTo', opts.dateTo);
    params.set('limit', opts.limit || 200);
    return fetch(`${API_BASE}/api/children/${childId}/transactions?${params}`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  getBalance(childId, opts = {}) {
    const params = new URLSearchParams();
    if (opts.dateFrom) params.set('dateFrom', opts.dateFrom);
    if (opts.dateTo) params.set('dateTo', opts.dateTo);
    return fetch(`${API_BASE}/api/children/${childId}/balance?${params}`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  // ==================== Checkins ====================
  
  getTodayCheckins(childId) {
    return fetch(`${API_BASE}/api/children/${childId}/checkins/today`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  getStreak(childId) {
    return fetch(`${API_BASE}/api/children/${childId}/checkins/streak`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  // ==================== Rewards ====================
  
  listRewardClaims(childId) {
    return fetch(`${API_BASE}/api/children/${childId}/rewards`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  addRewardClaim(childId, rewardId, cost, note) {
    return fetch(`${API_BASE}/api/children/${childId}/rewards`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ reward_id: rewardId, reward_name: note || '', cost, note })
    }).then(this._parse);
  },
  
  confirmRewardClaim(childId, claimId, approved) {
    return fetch(`${API_BASE}/api/children/${childId}/rewards/${claimId}`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify({ approved })
    }).then(this._parse);
  },
  
  // ==================== Reviews ====================
  
  listReviews(childId) {
    return fetch(`${API_BASE}/api/children/${childId}/reviews`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  addReview(childId, data) {
    return fetch(`${API_BASE}/api/children/${childId}/reviews`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(data)
    }).then(this._parse);
  },
  
  // ==================== Portfolio ====================
  
  listPortfolio(childId) {
    return fetch(`${API_BASE}/api/children/${childId}/portfolio`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  addPortfolio(childId, data) {
    return fetch(`${API_BASE}/api/children/${childId}/portfolio`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(data)
    }).then(this._parse);
  },
  
  // ==================== Media ====================
  
  saveMedia(mediaId, childId, base64Data, type) {
    return fetch(`${API_BASE}/api/media/${mediaId}`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ child_id: childId, data: base64Data, type })
    }).then(this._parse);
  },
  
  async getMedia(mediaId) {
    const resp = await fetch(`${API_BASE}/api/media/${mediaId}`, {
      headers: this._headers()
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.data || null;
  },
  
  // ==================== Settings ====================
  
  getSettings() {
    return fetch(`${API_BASE}/api/settings`, {
      headers: this._headers()
    }).then(this._parse);
  },
  
  saveSettings(data) {
    return fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(data)
    }).then(this._parse);
  },
  
  // ==================== Export/Import ====================
  
  exportData() {
    return fetch(`${API_BASE}/api/export`, {
      method: 'POST',
      headers: this._headers()
    }).then(this._parse).then(data => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `积分银行备份_${getDateKey(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  },
  
  // ==================== Utility ====================
  
  health() {
    return fetch(`${API_BASE}/api/health`, {
      headers: this._headers()
    }).then(r => r.json());
  }
};

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
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: getDateKey(monday),
    end: getDateKey(sunday)
  };
}

// 暴露给全局
window.PointsBankStorage = API;
window.PBUtils = { getDateKey, getWeekRange };
