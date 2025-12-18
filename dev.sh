#!/bin/bash
# F1 Race Replay - Development Server Launcher (macOS/Linux)
# Usage: ./dev.sh [--no-open]

node "$(dirname "$0")/dev.js" "$@"
