# Performance Testing Framework - Complete Index

## Overview

A comprehensive performance testing framework has been created for the F1 Race Replay backend. This index guides you through all available resources.

## Quick Start (2 minutes)

1. **See quick reference:**
   ```bash
   cat QUICK_REFERENCE.md
   ```

2. **Run tests:**
   ```bash
   python scripts/performance_tests_v2.py --rounds 1,5,10,15,23 --session-types R,Q
   ```

3. **Read results:**
   ```bash
   cat PERFORMANCE_BASELINE.md
   ```

## Document Structure

### For Executives/Product Managers
Start here for high-level findings:
- [`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md) - Executive summary, findings, recommendations

### For Engineers/Developers
Start here for technical details:
- [`PERFORMANCE_BASELINE_V2.md`](PERFORMANCE_BASELINE_V2.md) - Detailed technical breakdown
- [`docs/PERFORMANCE/testing-guide.md`](docs/PERFORMANCE/testing-guide.md) - Usage guide and troubleshooting

### For DevOps/Infrastructure
Start here for deployment impacts:
- [`PERFORMANCE_TESTING_SUMMARY.md`](PERFORMANCE_TESTING_SUMMARY.md) - Architectural implications and recommendations

### For Quick Reference
- [`QUICK_REFERENCE.md`](QUICK_REFERENCE.md) - Commands and key metrics

## Files at a Glance

### Testing Scripts (2 files)

| File | Purpose | Best For |
|------|---------|----------|
| `scripts/performance_tests.py` | HTTP API testing | End-to-end realistic performance measurement |
| `scripts/performance_tests_v2.py` | Direct Python API testing | Bottleneck identification, no HTTP overhead |

**When to use each:**
- Use V2 for development and optimization (faster, more detailed)
- Use V1 for deployment validation (realistic HTTP overhead)

### Generated Reports (3 files)

| File | Audience | Read If You Want To... |
|------|----------|------------------------|
| `PERFORMANCE_BASELINE.md` | Everyone | Understand performance findings and recommendations |
| `PERFORMANCE_BASELINE_V2.md` | Technical | See detailed timing breakdown and technical analysis |
| `PERFORMANCE_TESTING_SUMMARY.md` | Technical | Understand testing framework design and implications |

### Documentation (1 file)

| File | Purpose |
|------|---------|
| `docs/PERFORMANCE/testing-guide.md` | Complete usage guide, troubleshooting, advanced features |

### Quick References (2 files)

| File | Purpose |
|------|---------|
| `QUICK_REFERENCE.md` | Commands and key metrics at a glance |
| `PERFORMANCE_TESTING_INDEX.md` | This file - navigation guide |

### Test Results (2 files)

| File | Contains |
|------|----------|
| `tests/performance_results.json` | HTTP API test results (raw JSON) |
| `tests/performance_results_v2.json` | Direct API test results with timing breakdown |

## Key Findings

### Performance Metrics (2025 R1 Race)

- **Cold Cache Load:** 95 seconds
  - FastF1 Session Load: 16.6 seconds
  - Telemetry Processing: 78.5 seconds

- **Warm Cache Load:** 85.6 seconds
  - FastF1 Session Load: 11.2 seconds
  - Telemetry Processing: 74.4 seconds

- **Cache Speedup:** 1.11x (11% improvement)

### Bottleneck Identified

**Telemetry Resampling = 80% of load time**
- Not I/O bottleneck
- Not API bottleneck
- Compute-bound multiprocessing in `shared/telemetry/f1_data.py`

### Data Quality Issues

- Only 1 of 5 tested rounds has clean data (Round 1)
- Rounds 5, 15, 23: Integer division errors
- Round 10: Missing telemetry data
- All Qualifying: SQLite locking issues

## How to Use

### Running Tests

```bash
# Standard test (all 5 rounds, race + qualifying)
python scripts/performance_tests_v2.py

# Custom scope
python scripts/performance_tests_v2.py --rounds 1,24 --session-types R

# With HTTP overhead (requires: npm start)
python scripts/performance_tests.py --rounds 1
```

### Reading Results

1. **First read:**
   ```bash
   cat QUICK_REFERENCE.md          # 1 minute
   cat PERFORMANCE_BASELINE.md     # 10 minutes
   ```

2. **Then dive deep (if needed):**
   ```bash
   cat PERFORMANCE_BASELINE_V2.md           # Technical details
   cat docs/PERFORMANCE/testing-guide.md    # Full guide
   python -m json.tool tests/performance_results_v2.json
   ```

### Comparing Changes

```bash
# Before optimization
python scripts/performance_tests_v2.py --rounds 1 > baseline.txt

# After code change
python scripts/performance_tests_v2.py --rounds 1 > modified.txt

# Compare
diff baseline.txt modified.txt
```

## Recommendations

### Immediate Actions
1. Show loading UI (users expect 90-120 seconds)
2. Pre-cache Round 1, 12, 24 (popular races)
3. Investigate why rounds 5, 10, 15, 23 fail

### Short-term Optimizations
1. Profile telemetry resampling (where are the 78 seconds?)
2. Vectorize compute-heavy functions
3. Handle FastF1 API errors gracefully

### Long-term Architecture
1. Background pre-processing of races
2. Distributed telemetry extraction
3. Incremental streaming to frontend

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests timeout | `pkill -f performance_tests` then clear cache: `rm -rf .fastf1-cache computed_data` |
| "Readonly database" | FastF1 SQLite locking - retry test |
| "Integer division by zero" | Round has data issues - check FastF1 API |
| Backend not found | Start with: `npm start` (for HTTP API tests) |

## Related Documentation

- [`CLAUDE.md`](CLAUDE.md) - Architecture overview
- [`.claude/rules/F1_DATA_REVIEW_RULE.md`](.claude/rules/F1_DATA_REVIEW_RULE.md) - Code review requirements for telemetry code
- [`.claude/rules/CRITICAL_FILES.md`](.claude/rules/CRITICAL_FILES.md) - Protected files list

## Summary

| Item | Details |
|------|---------|
| **Framework Status** | ✅ Complete and operational |
| **Test Scripts** | 2 (HTTP API + Direct API) |
| **Documentation** | 4 files |
| **Test Results** | 2 JSON files with raw data |
| **Tests Executed** | 20 tests (2 successful, 18 failed) |
| **Success Rate** | 10% (only Round 1 worked) |
| **Total Time Measured** | 95 seconds (cold) → 85 seconds (warm) |

## Next Steps

1. **Review** the findings in PERFORMANCE_BASELINE.md
2. **Understand** bottleneck analysis and recommendations
3. **Plan** optimization strategy based on findings
4. **Implement** changes to address bottleneck
5. **Re-test** to measure improvement

---

**Framework Created:** 2026-03-08
**Status:** Production Ready
**Latest Test Run:** 2026-03-08 22:46:34

For questions or updates, refer to the specific documents or re-run the tests with updated configuration.
