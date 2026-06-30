#!/usr/bin/env bash
# 启动后端服务
set -e

echo "🏦 积分银行后端启动中..."

# 确保数据目录存在
mkdir -p /data

# 开发模式用 flask，生产用 gunicorn
if [ "${FLASK_DEBUG}" = "1" ]; then
    echo "开发模式"
    exec python app.py
else
    echo "生产模式 (gunicorn)"
    exec gunicorn -b 0.0.0.0:5000 -w 2 --timeout 120 app:create_app
fi
