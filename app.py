"""
积分银行 - 后端 API
Flask + SQLite，支持多账号、多小孩
"""

import sqlite3
import os
import json
from datetime import datetime, date
from flask import Flask, request, jsonify, g
from functools import wraps

app = Flask(__name__, static_folder='static', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'kids-points-bank-dev-key-change-in-prod')
app.config['DATABASE'] = os.environ.get('DATABASE_PATH', '/data/points_bank.db')

# Ensure data directory exists
os.makedirs(os.path.dirname(app.config['DATABASE']), exist_ok=True)


# ==================== Database ====================

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(app.config['DATABASE'])
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """初始化数据库表结构"""
    db = get_db()
    db.executescript('''
        -- 家长账户表
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            pin_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            is_active INTEGER DEFAULT 1
        );

        -- 小孩表（属于某个家长）
        CREATE TABLE IF NOT EXISTS children (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            name TEXT NOT NULL,
            age INTEGER DEFAULT 6,
            avatar TEXT DEFAULT '',
            color TEXT DEFAULT '#4ECDC4',
            created_at TEXT DEFAULT (datetime('now')),
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        -- 交易/积分记录表
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            child_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('earn', 'spend', 'bonus', 'adjust')),
            amount INTEGER NOT NULL,
            task_id TEXT DEFAULT '',
            reward_id TEXT DEFAULT '',
            note TEXT DEFAULT '',
            date TEXT NOT NULL,  -- YYYY-MM-DD
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
        );

        -- 打卡记录（快速查询某天完成了哪些任务）
        CREATE TABLE IF NOT EXISTS checkins (
            id TEXT PRIMARY KEY,
            child_id TEXT NOT NULL,
            date TEXT NOT NULL,
            task_id TEXT NOT NULL,
            points_earned INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
            UNIQUE(child_id, date, task_id)
        );

        -- 奖励兑换申请
        CREATE TABLE IF NOT EXISTS reward_claims (
            id TEXT PRIMARY KEY,
            child_id TEXT NOT NULL,
            reward_id TEXT NOT NULL,
            reward_name TEXT NOT NULL,
            cost INTEGER NOT NULL,
            note TEXT DEFAULT '',
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            claimed_at TEXT DEFAULT (datetime('now')),
            confirmed_at TEXT,
            confirmed_by TEXT,
            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
        );

        -- 每周复盘
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            child_id TEXT NOT NULL,
            week_start TEXT NOT NULL,
            best_thing TEXT DEFAULT '',
            difficulty TEXT DEFAULT '',
            parent_observation TEXT DEFAULT '',
            child_request TEXT DEFAULT '',
            tasks_completed INTEGER DEFAULT 0,
            points_earned INTEGER DEFAULT 0,
            dimensions_lit INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
        );

        -- 成长作品
        CREATE TABLE IF NOT EXISTS portfolio_items (
            id TEXT PRIMARY KEY,
            child_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            dimension TEXT DEFAULT '',
            media_ref TEXT DEFAULT '',
            media_type TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
        );

        -- 媒体文件（base64 存 BLOB）
        CREATE TABLE IF NOT EXISTS media_files (
            id TEXT PRIMARY KEY,
            child_id TEXT NOT NULL,
            data BLOB NOT NULL,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            saved_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
        );

        -- 应用设置（每个家长一份）
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            account_id TEXT NOT NULL,
            data TEXT DEFAULT '{}',
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        -- 插入默认家长（如果表为空）
        INSERT OR IGNORE INTO settings (id, account_id, data)
        SELECT 1, 'acc_default', '{"parentPin":"","currencyName":"积分","appTitle":"我的积分银行","maxDailyTasks":10}'
        WHERE NOT EXISTS (SELECT 1 FROM settings);
    ''')
    db.commit()


# ==================== Helpers ====================

def generate_id(prefix=''):
    import random
    return prefix + datetime.utcnow().strftime('%Y%m%d%H%M%S') + str(random.randint(100000, 999999))


def hash_pin(pin):
    """简单 PIN 哈希（生产环境建议用 bcrypt）"""
    return 'sha256:' + __import__('hashlib').sha256(pin.encode()).hexdigest()


def verify_pin(pin, pin_hash):
    if not pin or not pin_hash:
        return True
    return hash_pin(pin) == pin_hash


def require_auth(f):
    """需要登录的装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': '未登录'}), 401
        token = auth_header[7:]
        session = _session_store.get(token)
        if not session or not session.get('account_id'):
            return jsonify({'error': '登录已过期，请重新登录'}), 401
        g.current_session = session
        return f(*args, **kwargs)
    return decorated


def require_child_access(f):
    """需要小孩访问权限的装饰器（校验 child_id 属于当前家长）"""
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        child_id = kwargs.get('child_id') or request.form.get('child_id') or request.args.get('child_id')
        if not child_id:
            return jsonify({'error': '缺少 child_id'}), 400
        db = get_db()
        child = db.execute('SELECT id, account_id FROM children WHERE id = ?', (child_id,)).fetchone()
        if not child:
            return jsonify({'error': '小孩不存在'}), 404
        if child['account_id'] != g.current_session['account_id']:
            return jsonify({'error': '无权访问'}), 403
        return f(*args, **kwargs)
    return decorated


# ==================== Session Store ====================
# In-memory session store (for Docker single-instance; use Redis for scale)
# NOTE: Do NOT use `_session_store` — `request` is a proxy requiring request context.
# Use a plain module variable instead.
_session_store = {}


# ==================== Auth Routes ====================

@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    """注册家长账户"""
    data = request.get_json()
    username = (data.get('username') or '').strip()
    pin = data.get('pin', '')
    
    if not username or len(username) < 2:
        return jsonify({'error': '用户名至少2个字符'}), 400
    if len(pin) < 4 or len(pin) > 6 or not pin.isdigit():
        return jsonify({'error': 'PIN码需4-6位数字'}), 400
    
    db = get_db()
    existing = db.execute('SELECT id FROM accounts WHERE username = ?', (username,)).fetchone()
    if existing:
        return jsonify({'error': '用户名已存在'}), 409
    
    account_id = generate_id('acc_')
    db.execute(
        'INSERT INTO accounts (id, username, pin_hash) VALUES (?, ?, ?)',
        (account_id, username, hash_pin(pin))
    )
    # 为该家长创建默认设置
    db.execute(
        'INSERT OR REPLACE INTO settings (id, account_id, data) VALUES (1, ?, ?)',
        (account_id, json.dumps({
            'parentPin': pin,
            'currencyName': '积分',
            'appTitle': '我的积分银行',
            'maxDailyTasks': 10
        }))
    )
    db.commit()
    
    # 自动登录
    token = generate_id('sess_')
    _session_store[token] = {'account_id': account_id, 'username': username, 'created_at': datetime.utcnow().isoformat()}
    
    return jsonify({
        'token': token,
        'account_id': account_id,
        'username': username
    }), 201


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """登录"""
    data = request.get_json()
    username = (data.get('username') or '').strip()
    pin = data.get('pin', '')
    
    db = get_db()
    account = db.execute('SELECT id, pin_hash FROM accounts WHERE username = ?', (username,)).fetchone()
    if not account or not verify_pin(pin, account['pin_hash']):
        return jsonify({'error': '用户名或PIN码错误'}), 401
    
    token = generate_id('sess_')
    _session_store[token] = {
        'account_id': account['id'],
        'username': username,
        'created_at': datetime.utcnow().isoformat()
    }
    
    return jsonify({
        'token': token,
        'account_id': account['id'],
        'username': username
    })


@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def auth_logout():
    """登出"""
    token = request.headers.get('Authorization', '')[7:]
    _session_store.pop(token, None)
    return jsonify({'ok': True})


@app.route('/api/auth/me', methods=['GET'])
@require_auth
def auth_me():
    """获取当前账户信息"""
    session = g.current_session
    db = get_db()
    children = db.execute(
        'SELECT id, name, age, avatar, color FROM children WHERE account_id = ? AND is_active = 1 ORDER BY created_at',
        (session['account_id'],)
    ).fetchall()
    
    settings_row = db.execute('SELECT data FROM settings WHERE account_id = ?', (session['account_id'],)).fetchone()
    settings = json.loads(settings_row['data']) if settings_row else {}
    
    return jsonify({
        'account_id': session['account_id'],
        'username': session['username'],
        'children': [{'id': c['id'], 'name': c['name'], 'age': c['age'], 'avatar': c['avatar'], 'color': c['color']} for c in children],
        'settings': settings
    })


# ==================== Child Routes ====================

@app.route('/api/children', methods=['GET'])
@require_auth
def list_children():
    """列出当前家长的所有小孩"""
    db = get_db()
    children = db.execute(
        'SELECT id, name, age, avatar, color, created_at FROM children WHERE account_id = ? AND is_active = 1 ORDER BY created_at',
        (g.current_session['account_id'],)
    ).fetchall()
    return jsonify([dict(c) for c in children])


@app.route('/api/children', methods=['POST'])
@require_auth
def create_child():
    """添加小孩"""
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '小孩姓名不能为空'}), 400
    
    db = get_db()
    child_id = generate_id('child_')
    db.execute(
        '''INSERT INTO children (id, account_id, name, age, avatar, color)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (child_id, g.current_session['account_id'], name,
         data.get('age', 6), data.get('avatar', ''),
         data.get('color', '#4ECDC4'))
    )
    db.commit()
    
    return jsonify({'id': child_id, 'name': name, 'age': data.get('age', 6)}), 201


@app.route('/api/children/<child_id>', methods=['PUT'])
@require_auth
@require_child_access
def update_child(child_id):
    """更新小孩信息"""
    data = request.get_json()
    db = get_db()
    updates = []
    params = []
    for field in ['name', 'age', 'avatar', 'color']:
        if field in data:
            updates.append(f'{field} = ?')
            params.append(data[field])
    if updates:
        params.append(child_id)
        db.execute(f'UPDATE children SET {", ".join(updates)} WHERE id = ?', params)
        db.commit()
    
    child = db.execute('SELECT id, name, age, avatar, color FROM children WHERE id = ?', (child_id,)).fetchone()
    return jsonify(dict(child))


@app.route('/api/children/<child_id>', methods=['DELETE'])
@require_auth
@require_child_access
def delete_child(child_id):
    """软删除小孩"""
    db = get_db()
    db.execute('UPDATE children SET is_active = 0 WHERE id = ?', (child_id,))
    db.commit()
    return jsonify({'ok': True})


# ==================== Transaction Routes ====================

@app.route('/api/children/<child_id>/transactions', methods=['GET'])
@require_auth
@require_child_access
def list_transactions(child_id):
    """查询交易记录"""
    db = get_db()
    date_from = request.args.get('dateFrom')
    date_to = request.args.get('dateTo')
    tx_type = request.args.get('type')
    limit = request.args.get('limit', 100, type=int)
    
    query = 'SELECT * FROM transactions WHERE child_id = ?'
    params = [child_id]
    
    if date_from:
        query += ' AND date >= ?'
        params.append(date_from)
    if date_to:
        query += ' AND date <= ?'
        params.append(date_to)
    if tx_type:
        query += ' AND type = ?'
        params.append(tx_type)
    
    query += ' ORDER BY created_at DESC LIMIT ?'
    params.append(limit)
    
    txs = db.execute(query, params).fetchall()
    return jsonify([dict(t) for t in txs])


@app.route('/api/children/<child_id>/transactions', methods=['POST'])
@require_auth
@require_child_access
def add_transaction(child_id):
    """添加交易（赚/花/调整/奖励）"""
    data = request.get_json()
    tx_type = data.get('type', '')
    amount = data.get('amount', 0)
    
    if tx_type not in ('earn', 'spend', 'bonus', 'adjust'):
        return jsonify({'error': '无效的交易类型'}), 400
    if not isinstance(amount, int) or amount == 0:
        return jsonify({'error': '积分金额必须是非零整数'}), 400
    
    db = get_db()
    tx_id = generate_id('tx_')
    today = data.get('date', datetime.utcnow().strftime('%Y-%m-%d'))
    
    db.execute(
        '''INSERT INTO transactions (id, child_id, type, amount, task_id, reward_id, note, date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
        (tx_id, child_id, tx_type, amount,
         data.get('task_id', ''), data.get('reward_id', ''),
         data.get('note', ''), today)
    )
    
    # 如果是赚积分，记录打卡
    if tx_type == 'earn' and data.get('task_id'):
        db.execute(
            '''INSERT OR IGNORE INTO checkins (id, child_id, date, task_id, points_earned)
               VALUES (?, ?, ?, ?, ?)''',
            (generate_id('chk_'), child_id, today, data['task_id'], amount)
        )
    
    db.commit()
    
    return jsonify({'id': tx_id}), 201


@app.route('/api/children/<child_id>/balance', methods=['GET'])
@require_auth
@require_child_access
def get_balance(child_id):
    """获取余额"""
    db = get_db()
    date_from = request.args.get('dateFrom')
    date_to = request.args.get('dateTo')
    
    query = 'SELECT COALESCE(SUM(CASE WHEN type IN ("earn","bonus","adjust") THEN amount WHEN type = "spend" THEN -amount ELSE 0 END), 0) as balance FROM transactions WHERE child_id = ?'
    params = [child_id]
    
    if date_from:
        query += ' AND date >= ?'
        params.append(date_from)
    if date_to:
        query += ' AND date <= ?'
        params.append(date_to)
    
    row = db.execute(query, params).fetchone()
    return jsonify({'balance': row['balance']})


# ==================== Checkin Routes ====================

@app.route('/api/children/<child_id>/checkins/today', methods=['GET'])
@require_auth
@require_child_access
def get_today_checkins(child_id):
    """获取今日打卡"""
    db = get_db()
    today = datetime.utcnow().strftime('%Y-%m-%d')
    checkins = db.execute(
        'SELECT task_id, points_earned FROM checkins WHERE child_id = ? AND date = ?',
        (child_id, today)
    ).fetchall()
    return jsonify([dict(c) for c in checkins])


@app.route('/api/children/<child_id>/checkins/streak', methods=['GET'])
@require_auth
@require_child_access
def get_streak(child_id):
    """获取连续打卡天数"""
    db = get_db()
    checkins_rows = db.execute(
        'SELECT DISTINCT date FROM checkins WHERE child_id = ? ORDER BY date DESC',
        (child_id,)
    ).fetchall()
    
    dates = [r['date'] for r in checkins_rows]
    if not dates:
        return jsonify({'streak': 0})
    
    streak = 0
    today = date.today()
    for i in range(365):
        try:
            d = (today.replace(day=max(1, today.day - i))).isoformat()
        except ValueError:
            d = (today.replace(day=1)).isoformat()
        if d in dates:
            streak += 1
        elif i > 0:
            break
    
    return jsonify({'streak': streak})


# ==================== Reward Claim Routes ====================

@app.route('/api/children/<child_id>/rewards', methods=['GET'])
@require_auth
@require_child_access
def list_reward_claims(child_id):
    """查询奖励兑换申请"""
    db = get_db()
    claims = db.execute(
        'SELECT * FROM reward_claims WHERE child_id = ? ORDER BY claimed_at DESC',
        (child_id,)
    ).fetchall()
    return jsonify([dict(c) for c in claims])


@app.route('/api/children/<child_id>/rewards', methods=['POST'])
@require_auth
@require_child_access
def create_reward_claim(child_id):
    """创建奖励兑换申请"""
    data = request.get_json()
    reward_id = data.get('reward_id', '')
    reward_name = data.get('reward_name', '')
    cost = data.get('cost', 0)
    note = data.get('note', '')
    
    if not reward_name or cost <= 0:
        return jsonify({'error': '奖励名称和积分消耗必填'}), 400
    
    db = get_db()
    claim_id = generate_id('claim_')
    db.execute(
        '''INSERT INTO reward_claims (id, child_id, reward_id, reward_name, cost, note, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')''',
        (claim_id, child_id, reward_id, reward_name, cost, note)
    )
    db.commit()
    
    return jsonify({'id': claim_id}), 201


@app.route('/api/children/<child_id>/rewards/<claim_id>', methods=['PUT'])
@require_auth
@require_child_access
def confirm_reward_claim(child_id, claim_id):
    """确认/拒绝奖励兑换"""
    data = request.get_json()
    approved = data.get('approved', True)
    
    db = get_db()
    claim = db.execute('SELECT * FROM reward_claims WHERE id = ? AND child_id = ?', (claim_id, child_id)).fetchone()
    if not claim:
        return jsonify({'error': '兑换申请不存在'}), 404
    
    status = 'approved' if approved else 'rejected'
    db.execute(
        'UPDATE reward_claims SET status = ?, confirmed_at = datetime("now"), confirmed_by = ? WHERE id = ?',
        (status, g.current_session['username'], claim_id)
    )
    
    if approved:
        # 扣除积分
        tx_id = generate_id('tx_')
        db.execute(
            '''INSERT INTO transactions (id, child_id, type, amount, reward_id, note, date)
               VALUES (?, ?, 'spend', ?, ?, ?, datetime("now"))''',
            (tx_id, child_id, claim['cost'], claim_id, f'兑换奖励: {claim["reward_name"]}')
        )
    
    db.commit()
    
    return jsonify({'ok': True, 'status': status})


# ==================== Review Routes ====================

@app.route('/api/children/<child_id>/reviews', methods=['GET'])
@require_auth
@require_child_access
def list_reviews(child_id):
    """查询复盘记录"""
    db = get_db()
    reviews = db.execute(
        'SELECT * FROM reviews WHERE child_id = ? ORDER BY week_start DESC',
        (child_id,)
    ).fetchall()
    return jsonify([dict(r) for r in reviews])


@app.route('/api/children/<child_id>/reviews', methods=['POST'])
@require_auth
@require_child_access
def add_review(child_id):
    """添加复盘"""
    data = request.get_json()
    week_start = data.get('week_start', '')
    
    if not week_start:
        return jsonify({'error': '周起始日期必填'}), 400
    
    db = get_db()
    review_id = generate_id('rev_')
    db.execute(
        '''INSERT INTO reviews (id, child_id, week_start, best_thing, difficulty,
           parent_observation, child_request, tasks_completed, points_earned, dimensions_lit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (review_id, child_id, week_start,
         data.get('best_thing', ''), data.get('difficulty', ''),
         data.get('parent_observation', ''), data.get('child_request', ''),
         data.get('tasks_completed', 0), data.get('points_earned', 0),
         data.get('dimensions_lit', 0))
    )
    db.commit()
    
    return jsonify({'id': review_id}), 201


# ==================== Portfolio Routes ====================

@app.route('/api/children/<child_id>/portfolio', methods=['GET'])
@require_auth
@require_child_access
def list_portfolio(child_id):
    """查询成长作品"""
    db = get_db()
    items = db.execute(
        'SELECT * FROM portfolio_items WHERE child_id = ? ORDER BY created_at DESC',
        (child_id,)
    ).fetchall()
    return jsonify([dict(i) for i in items])


@app.route('/api/children/<child_id>/portfolio', methods=['POST'])
@require_auth
@require_child_access
def add_portfolio(child_id):
    """添加成长作品"""
    data = request.get_json()
    title = data.get('title', '新作品')
    
    db = get_db()
    item_id = generate_id('pf_')
    db.execute(
        '''INSERT INTO portfolio_items (id, child_id, title, description, dimension, media_ref, media_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (item_id, child_id, title,
         data.get('description', ''), data.get('dimension', ''),
         data.get('media_ref', ''), data.get('media_type', ''))
    )
    db.commit()
    
    return jsonify({'id': item_id}), 201


# ==================== Media Routes ====================

@app.route('/api/media/<media_id>', methods=['GET'])
@require_auth
@require_child_access
def get_media(media_id):
    """获取媒体文件（返回 base64 JSON）"""
    db = get_db()
    row = db.execute('SELECT data, type FROM media_files WHERE id = ?', (media_id,)).fetchone()
    if not row:
        return jsonify({'error': '媒体不存在'}), 404
    # data 存的是 base64 字符串，直接返回
    return jsonify({'data': row['data'], 'type': row['type']})


@app.route('/api/media/<media_id>', methods=['POST'])
@require_auth
@require_child_access
def save_media(media_id):
    """保存媒体文件"""
    data = request.get_json()
    child_id = data.get('child_id', '')
    media_data = data.get('data', '')
    media_type = data.get('type', 'photo')
    
    if not child_id or not media_data:
        return jsonify({'error': '缺少必要参数'}), 400
    
    db = get_db()
    today = datetime.utcnow().strftime('%Y-%m-%d')
    db.execute(
        '''INSERT OR REPLACE INTO media_files (id, child_id, data, type, date)
           VALUES (?, ?, ?, ?, ?)''',
        (media_id, child_id, media_data, media_type, today)
    )
    db.commit()
    
    return jsonify({'ok': True})


# ==================== Settings Routes ====================

@app.route('/api/settings', methods=['GET'])
@require_auth
def get_settings():
    """获取家长设置"""
    db = get_db()
    row = db.execute(
        'SELECT data FROM settings WHERE account_id = ?',
        (g.current_session['account_id'],)
    ).fetchone()
    settings = json.loads(row['data']) if row else {}
    return jsonify(settings)


@app.route('/api/settings', methods=['PUT'])
@require_auth
def update_settings():
    """更新家长设置"""
    data = request.get_json()
    db = get_db()
    row = db.execute(
        'SELECT data FROM settings WHERE account_id = ?',
        (g.current_session['account_id'],)
    ).fetchone()
    
    current = json.loads(row['data']) if row else {}
    current.update(data)
    
    if row:
        db.execute('UPDATE settings SET data = ? WHERE account_id = ?', (json.dumps(current), g.current_session['account_id']))
    else:
        db.execute('INSERT INTO settings (id, account_id, data) VALUES (1, ?, ?)',
                   (g.current_session['account_id'], json.dumps(current)))
    db.commit()
    
    return jsonify(current)


# ==================== Data Export/Import ====================

@app.route('/api/export', methods=['POST'])
@require_auth
def export_data():
    """导出当前家长的全部数据"""
    db = get_db()
    account_id = g.current_session['account_id']
    
    children = db.execute('SELECT id, name FROM children WHERE account_id = ? AND is_active = 1', (account_id,)).fetchall()
    result = {'exportedAt': datetime.utcnow().isoformat(), 'account': g.current_session['username'], 'children': []}
    
    for child in children:
        cid = child['id']
        txs = db.execute('SELECT * FROM transactions WHERE child_id = ?', (cid,)).fetchall()
        checkins = db.execute('SELECT * FROM checkins WHERE child_id = ?', (cid,)).fetchall()
        claims = db.execute('SELECT * FROM reward_claims WHERE child_id = ?', (cid,)).fetchall()
        reviews = db.execute('SELECT * FROM reviews WHERE child_id = ?', (cid,)).fetchall()
        portfolio = db.execute('SELECT * FROM portfolio_items WHERE child_id = ?', (cid,)).fetchall()
        
        result['children'].append({
            'id': cid, 'name': child['name'],
            'transactions': [dict(t) for t in txs],
            'checkins': [dict(c) for c in checkins],
            'reward_claims': [dict(c) for c in claims],
            'reviews': [dict(r) for r in reviews],
            'portfolio': [dict(p) for p in portfolio],
        })
    
    return jsonify(result)


# ==================== Health Check ====================

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'version': '2.0'})


# ==================== Main ====================

def create_app():
    """工厂函数，便于测试和部署"""
    with app.app_context():
        init_db()
    return app


# Initialize on import
create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=port, debug=debug)
