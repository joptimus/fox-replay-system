# F1 Race Replay - Performance Testing Guide

This guide explains how to run comprehensive performance tests on the F1 Race Replay backend.

## Overview

Two performance testing scripts are available:

1. **`scripts/performance_tests.py`** - HTTP API Testing
   - Measures full HTTP request/response cycle
   - Includes backend serialization overhead
   - Realistic end-to-end performance

2. **`scripts/performance_tests_v2.py`** - Direct Python API Testing
   - Measures pure Python performance
   - No HTTP/serialization overhead
   - Identifies bottlenecks in data processing

## Quick Start

### Run Performance Tests

**Option 1: HTTP API Performance (Realistic)**
```bash
# Requires backend running: npm start
python scripts/performance_tests.py --rounds 1,5,10,15,23 --session-types R,Q
```

**Option 2: Direct API Performance (Detailed Breakdown)**
```bash
# No backend required
python scripts/performance_tests_v2.py --rounds 1,5,10,15,23 --session-types R,Q
```

### View Results

**Summary report:**
```bash
cat PERFORMANCE_BASELINE.md          # HTTP API results
cat PERFORMANCE_BASELINE_V2.md       # Direct API results
```

**Raw JSON data:**
```bash
cat tests/performance_results.json        # HTTP API
cat tests/performance_results_v2.json     # Direct API
```

## Test Configuration

### Test Scope
- **Year:** 2025 (hardcoded, modify in script if needed)
- **Rounds:** Configurable (default: 1, 5, 10, 15, 23)
- **Session Types:** Configurable (default: R=Race, Q=Qualifying)
- **Phases:** Cache Miss (cold) and Cache Hit (warm)

### Cache Management
- **Phase 1 (Cache Miss):** Clears all caches before each test
  - Measures cold-start performance
  - Simulates first-time user
  - Tests FastF1 API + full processing

- **Phase 2 (Cache Hit):** Uses warm cache
  - Measures cached performance
  - Simulates returning user
  - Tests cache I/O efficiency

## Performance Metrics

### Key Metrics Captured

| Metric | Unit | Meaning |
|--------|------|---------|
| Total Time | seconds | End-to-end load time (FastF1 + processing) |
| Load Session Time | seconds | FastF1 API fetch time |
| Telemetry Time | seconds | Data processing + resampling time |
| Drivers | count | Number of drivers with valid data |
| Frames | count | Total animation frames generated |
| Cache Hit | boolean | Was cached data used? |

### Timing Breakdown

```
Total Time = Load Session Time + Telemetry Processing Time

[=== Cold Cache ===]
  Load Session (16-17s) → FastF1 API fetching
       ↓
  Telemetry Processing (74-79s) → Resampling, interpolation
       ↓
  READY (95s total)

[=== Warm Cache ===]
  Load Session (11-12s) → FastF1 API faster
       ↓
  Telemetry Processing (74-75s) → Cached I/O instead of resampling
       ↓
  READY (85s total)
```

## Understanding Results

### Typical Performance

**Expected Times (2025 season, 20 drivers):**
- Race cold cache: 90-120 seconds
- Race warm cache: 80-100 seconds
- Qualifying cold cache: 10-30 seconds
- Qualifying warm cache: 5-15 seconds

### Performance Anomalies

**If tests report failures:**

1. **"Integer division or modulo by zero"**
   - Cause: Malformed telemetry data from FastF1
   - Impact: That round cannot be loaded
   - Action: Check FastF1 API status for that round

2. **"No valid telemetry data found"**
   - Cause: All drivers returned empty telemetry
   - Impact: Session cannot be processed
   - Action: Verify season/round/session_type combination exists

3. **"Readonly database"**
   - Cause: SQLite cache locked (concurrent writes)
   - Impact: Session load fails
   - Action: Retry, or serialize parallel loads

4. **"Connection refused"** (HTTP tests only)
   - Cause: Backend not running
   - Action: Start backend: `npm start`

### Performance Regression

**If times are significantly slower than baseline:**

1. Check system load (background processes)
2. Verify FastF1 API is responsive (can be slow at peak times)
3. Check if code changes affected multiprocessing
4. Profile with `python -m cProfile` to identify bottleneck

## Advanced Usage

### Custom Test Configuration

```bash
# Test specific rounds
python scripts/performance_tests_v2.py --rounds 12,24 --session-types R

# Test all session types
python scripts/performance_tests_v2.py --session-types R,Q,S,SQ

# Test championship race
python scripts/performance_tests_v2.py --rounds 24 --session-types R,Q
```

### Profiling Performance Bottlenecks

```bash
# Profile the telemetry loading
python -m cProfile -s cumtime scripts/performance_tests_v2.py --rounds 1

# Get detailed call graph
py-spy record -o profile.svg -- python scripts/performance_tests_v2.py --rounds 1
```

### Comparing Changes

```bash
# Baseline (before changes)
python scripts/performance_tests_v2.py --rounds 1,5,10 > baseline.txt

# After code changes
python scripts/performance_tests_v2.py --rounds 1,5,10 > modified.txt

# Compare results
diff baseline.txt modified.txt
```

## Performance Optimization Checklist

### Before Optimizing
- [ ] Run tests to establish baseline
- [ ] Identify slowest round(s)
- [ ] Verify reproducibility (run 2-3 times)
- [ ] Check system load (top, Activity Monitor, etc.)

### Optimization Areas (Priority Order)

1. **Telemetry Resampling** (80% of time)
   - Profile `get_race_telemetry()` multiprocessing loop
   - Test with `-m cProfile` to identify hotspots
   - Consider vectorization with NumPy/Numba

2. **FastF1 API Calls** (17% of time)
   - Cache at FastF1 layer, not just our layer
   - Parallel fetch instead of sequential

3. **Frame Aggregation** (3% of time)
   - Minimize data copies during frame generation
   - Use pre-allocated arrays if possible

### After Optimization
- [ ] Run tests again
- [ ] Compare new times to baseline
- [ ] Verify accuracy (frames match original)
- [ ] Check for memory leaks (long-running tests)

## Troubleshooting

### Tests Hang or Timeout

**Problem:** Tests never complete, or timeout after 5 minutes

**Solution:**
1. Kill hung process: `pkill -f performance_tests`
2. Clear partial cache: `rm -rf .fastf1-cache computed_data`
3. Restart and retry

**Prevention:**
- Run with timeout: `timeout 600 python scripts/performance_tests_v2.py`
- Start with single round: `--rounds 1`

### Memory Exhaustion

**Problem:** Python process uses excessive memory, system becomes slow

**Solution:**
1. Reduce test scope: `--rounds 1` instead of 5 rounds
2. Use HTTP tests instead (process separation)
3. Monitor with: `watch ps aux | grep python`

**Root Cause:** Likely multiprocessing pool not releasing memory; check f1_data.py

### FastF1 API Failures

**Problem:** "No cached data found" repeated many times, tests slow

**Solution:**
1. FastF1 API might be slow or rate-limited
2. Wait a few minutes and retry
3. Check https://www.formula1.com/ for official F1 website (FastF1 depends on it)

### Cache Directory Issues

**Problem:** "Permission denied" when accessing cache

**Solution:**
```bash
# Fix permissions
chmod -R 755 .fastf1-cache
chmod -R 755 computed_data

# Or clear and regenerate
rm -rf .fastf1-cache computed_data
python scripts/performance_tests_v2.py --rounds 1
```

## Continuous Performance Monitoring

### Setup Git Hook

```bash
# .git/hooks/pre-commit (make executable: chmod +x)
#!/bin/bash
echo "Running performance regression check..."
python scripts/performance_tests_v2.py --rounds 1 > /tmp/perf.txt 2>&1
if [ $? -ne 0 ]; then
  echo "WARNING: Performance tests failed!"
  cat /tmp/perf.txt
  exit 1
fi
```

### GitHub Actions Workflow

```yaml
# .github/workflows/performance.yml
name: Performance Tests
on: [push]
jobs:
  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: pip install -r requirements.txt
      - run: python scripts/performance_tests_v2.py --rounds 1,12,24
```

## Performance Baseline History

Track performance over time:

```bash
# Create timestamped record
cp PERFORMANCE_BASELINE.md docs/performance/baseline_$(date +%Y%m%d_%H%M%S).md

# Compare versions
diff docs/performance/baseline_20260301.md docs/performance/baseline_20260308.md
```

## Related Documentation

- [PERFORMANCE_BASELINE.md](../../PERFORMANCE_BASELINE.md) - Current performance test results
- [PERFORMANCE_BASELINE_V2.md](../../PERFORMANCE_BASELINE_V2.md) - Detailed API test results
- [shared/telemetry/f1_data.py](../../shared/telemetry/f1_data.py) - Bottleneck code
- [F1_DATA_REVIEW_RULE.md](../../.claude/rules/F1_DATA_REVIEW_RULE.md) - Code review requirements

## Questions?

For detailed questions about performance or optimization strategies, see:
- Bottleneck analysis in PERFORMANCE_BASELINE.md
- Code flow documentation in shared/telemetry/f1_data.py
- Architecture overview in CLAUDE.md
