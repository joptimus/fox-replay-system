#!/usr/bin/env node
/**
 * F1 Race Replay - Development Server Launcher
 *
 * Starts all services for local development:
 * 1. Go backend (port 8000) - Main HTTP/WebSocket server
 * 2. Python FastF1 bridge (port 8001) - Internal-only telemetry extraction
 * 3. React frontend (port 5173) - Vite dev server
 *
 * Usage:
 *   node dev.js                 # Start all services
 *   node dev.js --go-only       # Start only Go backend
 *   node dev.js --no-go         # Start Python + frontend (legacy)
 *
 * Environment:
 *   GO_BINARY: Path to compiled Go binary (default: go-backend/f1-replay-go)
 *   PYTHON_BRIDGE: Path to Python bridge script (default: scripts/fastf1_api.py)
 *   CACHE_DIR: Cache directory (default: computed_data/)
 *   GO_PORT: Go backend port (default: 8000)
 *   PYTHON_PORT: Python bridge port (default: 8001)
 */

const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Configuration
const config = {
  goBinary: process.env.GO_BINARY || path.join(__dirname, "go-backend/f1-replay-go"),
  pythonBridge: process.env.PYTHON_BRIDGE || path.join(__dirname, "scripts/fastf1_api.py"),
  cacheDir: process.env.CACHE_DIR || path.join(__dirname, "computed_data"),
  goPort: process.env.GO_PORT || 8000,
  pythonPort: process.env.PYTHON_PORT || 8001,
  frontendPort: 5173,
};

// Parse command line arguments
const args = process.argv.slice(2);
const goOnly = args.includes("--go-only");
const noGo = args.includes("--no-go");
const verbose = args.includes("--verbose");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function log(service, message, color = colors.reset) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${color}[${timestamp}] ${service}${colors.reset} ${message}`);
}

function buildGoBackend() {
  if (noGo) return true;

  log("Go Backend", "Building...", colors.blue);

  const result = spawnSync("go", ["build", "-o", "f1-replay-go", "."], {
    cwd: path.join(__dirname, "go-backend"),
    stdio: "inherit",
  });

  if (result.error || result.status !== 0) {
    log("✗ Go Backend", "Build failed", colors.red);
    return false;
  }

  log("✓ Go Backend", "Build successful", colors.green);
  return true;
}

function validateSetup() {
  if (!noGo && !fs.existsSync(config.goBinary)) {
    log("✗ Setup", `Go binary not found: ${config.goBinary}`, colors.red);
    log(
      "  Help",
      "Build the Go backend first: cd go-backend && go build -o f1-replay-go .",
      colors.yellow
    );
    return false;
  }

  if (!fs.existsSync(config.pythonBridge)) {
    log(
      "  Setup",
      `Python bridge not found: ${config.pythonBridge} (optional for cached data)`,
      colors.yellow
    );
  }

  if (!fs.existsSync(config.cacheDir)) {
    log("  Setup", `Creating cache directory: ${config.cacheDir}`);
    try {
      fs.mkdirSync(config.cacheDir, { recursive: true });
    } catch (e) {
      log("✗ Setup", `Failed to create cache directory: ${e.message}`, colors.red);
      return false;
    }
  }

  return true;
}

function startGoBackend() {
  log("Go Backend", `Starting on port ${config.goPort}...`, colors.blue);

  const args = [
    "--port",
    config.goPort,
    "--cache-dir",
    config.cacheDir,
    "--python-bridge",
    `http://127.0.0.1:${config.pythonPort}`,
  ];

  if (verbose) {
    args.push("--log");
    args.push("debug");
  }

  const proc = spawn(config.goBinary, args, {
    stdio: "inherit",
  });

  proc.on("error", (err) => {
    log("Go Backend", `Failed to start: ${err.message}`, colors.red);
    process.exit(1);
  });

  return proc;
}

function startPythonBridge() {
  log("Python Bridge", `Starting on port ${config.pythonPort}...`, colors.blue);

  const proc = spawn("python3", [config.pythonBridge], {
    env: { ...process.env, PORT: config.pythonPort },
    stdio: "inherit",
  });

  proc.on("error", (err) => {
    log("Python Bridge", `Failed to start: ${err.message}`, colors.red);
  });

  return proc;
}

function startFrontend() {
  log("Frontend", `Starting on port ${config.frontendPort}...`, colors.blue);

  const frontendDir = path.join(__dirname, "frontend");
  const proc = spawn("npm", ["run", "dev"], {
    cwd: frontendDir,
    stdio: "inherit",
  });

  proc.on("error", (err) => {
    log("Frontend", `Failed to start: ${err.message}`, colors.red);
  });

  return proc;
}

function gracefulShutdown(processes) {
  log("Main", "Shutting down services...", colors.yellow);

  processes.forEach((proc) => {
    if (proc && !proc.killed) {
      proc.kill("SIGTERM");
    }
  });

  setTimeout(() => {
    processes.forEach((proc) => {
      if (proc && !proc.killed) {
        log("Main", "Force killing service...", colors.red);
        proc.kill("SIGKILL");
      }
    });
    process.exit(0);
  }, 3000);
}

async function main() {
  console.log(`${colors.bright}=== F1 Race Replay Development Server ===${colors.reset}\n`);

  // Validate setup
  if (!validateSetup()) {
    process.exit(1);
  }

  const processes = [];

  try {
    // Build Go backend if needed
    if (!noGo && !buildGoBackend()) {
      process.exit(1);
    }

    // Start services based on configuration
    if (!noGo) {
      log("Main", "Starting Go backend...", colors.green);
      processes.push(startGoBackend());

      // Wait for Go backend to start
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (!goOnly && fs.existsSync(config.pythonBridge)) {
      log("Main", "Starting Python FastF1 bridge...", colors.green);
      processes.push(startPythonBridge());

      // Wait for Python bridge to start
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    log("Main", "Starting React frontend...", colors.green);
    processes.push(startFrontend());

    // Print access information
    console.log(`
${colors.bright}Services Ready:${colors.reset}
  Frontend:      http://localhost:${config.frontendPort}
  Backend API:   http://localhost:${config.goPort}/api/health
  WebSocket:     ws://localhost:${config.goPort}/ws/replay/{session_id}
  ${!goOnly ? `FastF1 Bridge:  http://127.0.0.1:${config.pythonPort} (internal)` : ""}

${colors.yellow}Press Ctrl+C to stop all services${colors.reset}\n`);

    // Handle shutdown signals
    process.on("SIGINT", () => gracefulShutdown(processes));
    process.on("SIGTERM", () => gracefulShutdown(processes));
  } catch (err) {
    log("Main", `Error during startup: ${err.message}`, colors.red);
    gracefulShutdown(processes);
    process.exit(1);
  }
}

main();
