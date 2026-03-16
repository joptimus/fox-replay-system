# ============================================================
# Stage 1: Build Go backend
# ============================================================
FROM golang:1.22-bookworm AS go-builder

WORKDIR /build/go-backend
COPY go-backend/go.mod go-backend/go.sum ./
RUN go mod download

COPY go-backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /build/f1-replay-go .

# ============================================================
# Stage 2: Build React frontend
# ============================================================
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 3: Production image
# ============================================================
FROM python:3.11-slim-bookworm

# Install nginx
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Copy Go binary
COPY --from=go-builder /build/f1-replay-go /app/go-backend/f1-replay-go

# Copy Python scripts (needed by Go backend at runtime)
COPY scripts/ /app/scripts/
COPY shared/ /app/shared/

# Copy static files (FastF1 tester page)
COPY backend/static/ /app/backend/static/

# Copy built frontend
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

# Nginx config - serve frontend and proxy API/WS to Go backend
RUN cat > /etc/nginx/sites-available/default <<'NGINX'
server {
    listen 80;

    # Serve frontend static files
    location / {
        root /app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Go backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }

    # Proxy WebSocket connections
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }
}
NGINX

# Create entrypoint script
RUN cat > /app/entrypoint.sh <<'ENTRY'
#!/bin/bash
set -e

# Create cache directory
mkdir -p /app/computed_data

# Start Go backend in background
cd /app
./go-backend/f1-replay-go \
    --port 8000 \
    --cache-dir /app/computed_data \
    --python-bridge "http://127.0.0.1:8001" &

# Start nginx in foreground
nginx -g "daemon off;"
ENTRY

RUN chmod +x /app/entrypoint.sh

WORKDIR /app

# Persistent volume for telemetry cache
VOLUME ["/app/computed_data"]

EXPOSE 80

CMD ["/app/entrypoint.sh"]
