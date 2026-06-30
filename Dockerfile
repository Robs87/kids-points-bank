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

# 复制前端静态文件
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

RUN mkdir -p /etc/supervisor/conf.d

# Supervisor 配置
RUN printf '[supervisord]\nnodaemon=true\nlogfile=/dev/null\nlogfile_maxbytes=50MB\n\n[program:gunicorn]\ncommand=/usr/local/bin/gunicorn -b 0.0.0.0:5000 -w 2 --timeout 120 app:create_app\ndirectory=/app\nautostart=true\nautorestart=true\nstderr_logfile=/var/log/gunicorn.err.log\nstdout_logfile=/var/log/gunicorn.out.log\n\n[program:nginx]\ncommand=nginx -g "daemon off;"\nautostart=true\nautorestart=true\nstderr_logfile=/var/log/nginx.err.log\nstdout_logfile=/var/log/nginx.out.log\n' > /etc/supervisor/conf.d/kids-points-bank.conf

# Nginx 配置
RUN printf 'server {\n    listen 80;\n    server_name _;\n\n    # 静态文件\n    location / {\n        root /usr/share/nginx/html;\n        index index.html;\n        try_files $uri $uri/ /index.html;\n    }\n\n    # API 反向代理到 Flask\n    location /api/ {\n        proxy_pass http://127.0.0.1:5000;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n\n        # CORS headers\n        add_header Access-Control-Allow-Origin $http_origin always;\n        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;\n        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;\n\n        if ($request_method = OPTIONS) {\n            return 204;\n        }\n    }\n}\n' > /etc/nginx/sites-available/default

ENV PORT=80
EXPOSE 80

CMD ["/usr/local/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
