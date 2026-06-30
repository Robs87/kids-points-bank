# ============================
# 阶段 1: 后端 (Python/Flask)
# ============================
FROM python:3.12-slim AS backend

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY run.sh .
RUN chmod +x run.sh
RUN mkdir -p /data

ENV PORT=5000
ENV DATABASE_PATH=/data/points_bank.db
ENV FLASK_DEBUG=0

EXPOSE 5000
CMD ["./run.sh"]

# ============================
# 阶段 2: 前端 (Nginx)
# ============================
FROM nginx:alpine AS frontend

COPY . /usr/share/nginx/html

RUN rm -f /etc/nginx/conf.d/default.conf

# ============================
# 最终镜像
# ============================
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc nginx \
    && rm -rf /var/lib/apt/lists/*

# 后端依赖
COPY --from=backend /usr/local/lib/python3.12/site-packages/ /usr/local/lib/python3.12/site-packages/
COPY --from=backend /usr/local/bin/gunicorn /usr/local/bin/gunicorn
COPY --from=backend /app/app.py /app/app.py
COPY --from=backend /app/run.sh /app/run.sh
RUN chmod +x /app/run.sh
RUN mkdir -p /data

# 前端文件
COPY --from=frontend /usr/share/nginx/html /usr/share/nginx/html

# Nginx 配置
RUN rm -f /etc/nginx/conf.d/default.conf

# 安装 supervisor
RUN pip install --no-cache-dir supervisor

RUN mkdir -p /etc/supervisor

# Supervisor 配置
COPY supervisord.conf /etc/supervisor/supervisord.conf

# Nginx 配置
RUN cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 80;
    server_name _;

    # 静态文件
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理到 Flask
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers
        add_header Access-Control-Allow-Origin $http_origin always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;

        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}
NGINX

ENV PORT=80
EXPOSE 80

CMD ["/usr/local/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
