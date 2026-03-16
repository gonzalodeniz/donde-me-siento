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
    DMS_DATABASE_URL=sqlite:////app/data/donde_me_siento.db \
    DMS_FRONTEND_DIST_DIR=/app/frontend-dist

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY --from=frontend-builder /build/frontend/dist /app/frontend-dist

RUN mkdir -p /app/data

EXPOSE 80

VOLUME ["/app/data"]

CMD ["/usr/local/bin/uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "80"]
