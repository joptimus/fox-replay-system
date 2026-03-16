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
COPY nginx.conf /etc/nginx/sites-available/default

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app

# Persistent volume for telemetry cache
VOLUME ["/app/computed_data"]

EXPOSE 80

CMD ["/app/entrypoint.sh"]
