FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DMS_ENVIRONMENT=production \
    DMS_DATA_DIR=/app/data \
    DMS_DATABASE_URL=sqlite:////app/data/donde_me_siento.db

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/supervisord.conf /etc/supervisor/conf.d/donde-me-siento.conf
COPY --from=frontend-builder /build/frontend/dist /app/frontend-dist

RUN mkdir -p /app/data /var/log/supervisor /run/nginx \
    && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf.default

EXPOSE 80

VOLUME ["/app/data"]

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/donde-me-siento.conf"]
