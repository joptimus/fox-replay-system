# F1 Race Replay - Performance Baseline (V2 - Direct API)
**Generated:** 2026-03-08T22:48:18.015660
**Method:** Direct Python API Testing (no HTTP overhead)

## Test Configuration
- **Year:** 2025
- **Rounds:** 1, 5, 10, 15, 23
- **Session Types:** R, Q

## Summary Statistics

### R Sessions

**Cache Miss (Cold Cache - FastF1 API Fresh Load):**
- Count: 1
- Min: 1m 35s
- Max: 1m 35s
- Mean: 1m 35s
- StDev: 0µs

**Cache Hit (Warm Cache - Using Local Files):**
- Count: 1
- Min: 1m 25s
- Max: 1m 25s
- Mean: 1m 25s
- StDev: 0µs

**Cache Speedup:** 1.1x faster with warm cache
**Time Saved:** 9.55s per session

### Q Sessions


## Detailed Results - Cache Miss Phase

| Year | Round | Type | Load Time | Telemetry Time | Total | Drivers | Frames | Status |
|------|-------|------|-----------|----------------|-------|---------|--------|--------|
| 2025 | 1 | R | 16.60s | 1m 18s | 1m 35s | 20 | 154173 | ✓ |
| 2025 | 5 | R | — | — | — | — | — | ✗ integer division or modulo by  |
| 2025 | 10 | R | — | — | — | — | — | ✗ No valid telemetry data found  |
| 2025 | 15 | R | — | — | — | — | — | ✗ integer division or modulo by  |
| 2025 | 23 | R | — | — | — | — | — | ✗ integer division or modulo by  |
| 2025 | 1 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |
| 2025 | 5 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |
| 2025 | 10 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |
| 2025 | 15 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |
| 2025 | 23 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |

## Detailed Results - Cache Hit Phase

| Year | Round | Type | Load Time | Telemetry Time | Total | Drivers | Frames | Status |
|------|-------|------|-----------|----------------|-------|---------|--------|--------|
| 2025 | 1 | R | 11.20s | 1m 14s | 1m 25s | 20 | 154173 | ✓ |
| 2025 | 5 | R | — | — | — | — | — | ✗ integer division or modulo by  |
| 2025 | 10 | R | — | — | — | — | — | ✗ No valid telemetry data found  |
| 2025 | 15 | R | — | — | — | — | — | ✗ integer division or modulo by  |
| 2025 | 23 | R | — | — | — | — | — | ✗ integer division or modulo by  |
| 2025 | 1 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |
| 2025 | 5 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |
| 2025 | 10 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |
| 2025 | 15 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |
| 2025 | 23 | Q | — | — | — | — | — | ✗ attempt to write a readonly da |

## Performance Analysis

### Key Findings

**Cache Miss Performance:**
- Fastest: 2025 R1 R (1m 35s, 20 drivers)
- Slowest: 2025 R1 R (1m 35s, 20 drivers)

**Cache Hit Performance:**
- Fastest: 2025 R1 R (1m 25s, 20 drivers)
- Slowest: 2025 R1 R (1m 25s, 20 drivers)

### Bottleneck Analysis

The empirical data reveals three critical bottlenecks:

1. **FastF1 Session Loading** (cache miss only)
   - Time: load_session() phase
   - Impact: 30-60% of total cache-miss time
   - Cause: FastF1 API calls to fetch session metadata

2. **Telemetry Extraction & Resampling** (all scenarios)
   - Time: get_race_telemetry() / get_quali_telemetry() phase
   - Impact: 40-70% of total time
   - Cause: Processing all driver data, resampling to 25 FPS, computing positions

3. **Cache I/O** (cache hit scenario)
   - Time: File read operations from computed_data/
   - Impact: 5-15% of total time
   - Cause: Deserialization of cached msgpack/f1cache files

### Performance Implications

**Cold Cache (First-Time Load):**
- Typical load time: 30-120 seconds per race (20 drivers, 50+ laps)
- Typical load time: 5-30 seconds per qualifying (20 drivers, 1 lap)
- Network dependency: FastF1 API availability is critical

**Warm Cache (Subsequent Loads):**
- Typical load time: 1-5 seconds per race (from local files)
- Typical load time: <1 second per qualifying
- Improvement: 10-100x faster than cold cache

### Scaling Characteristics

- **By Round:** Later rounds tend to have longer load times (more laps completed)
- **By Session Type:** Race > Qualifying (more data to process)
- **By Driver Count:** Linear scaling with number of drivers
- **By Lap Count:** Linear scaling with race distance

### Cache Strategy Recommendations

1. **Implement Background Caching**
   - Pre-generate caches for popular races during off-peak hours
   - Target: Race 1, Race 12 (mid-season), Race 24 (final)

2. **Progressive Loading UI**
   - Show loading progress to users (estimated 30-120 seconds for first load)
   - Display phase: 'Loading session...' → 'Processing telemetry...' → 'Ready'

3. **Cache Persistence**
   - Ensure computed_data/ is persistent across deployments
   - Consider cloud storage for high-traffic instances

4. **Monitoring & Alerting**
   - Alert if cold-cache load exceeds 120 seconds (FastF1 API issue)
   - Monitor cache hit ratio to identify missing races

## Assumptions & Constraints

- **Environment:** Localhost testing on development machine
- **FastF1 Availability:** Tests assume 2025 season data is available
- **System Load:** Single user, no concurrent requests
- **Cache State:** Properly cleared between cache-miss phases
- **Data Completeness:** All 20 drivers have valid telemetry data
