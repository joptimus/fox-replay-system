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
