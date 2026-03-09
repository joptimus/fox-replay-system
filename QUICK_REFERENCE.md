# Performance Testing - Quick Reference

## Run Tests

```bash
# Direct API (fast, no backend needed)
python scripts/performance_tests_v2.py --rounds 1,5,10,15,23 --session-types R,Q

# HTTP API (realistic, requires: npm start)
python scripts/performance_tests.py --rounds 1,5,10,15,23 --session-types R,Q

# Custom scope
python scripts/performance_tests_v2.py --rounds 1,24 --session-types R
```

## View Results

```bash
# Executive summary (read this first!)
cat PERFORMANCE_BASELINE.md

# Technical details
cat PERFORMANCE_BASELINE_V2.md

# Raw data
python -m json.tool tests/performance_results_v2.json | less
```

## Key Numbers (2025 R1 Race)

| Metric | Value |
|--------|-------|
| Cold Cache | 95 seconds |
| Warm Cache | 85 seconds |
| Speedup | 1.1x (11%) |
| Load Session | 16-17 seconds |
| Telemetry Processing | 74-79 seconds |
| Drivers | 20 |
| Frames | 154,173 |

## Bottleneck

**80% of time: Telemetry resampling** (not I/O, not API)
- Located in: `shared/telemetry/f1_data.py`
- Cause: Multiprocessing extraction + interpolation
- Solution: Vectorize, parallelize, or pre-cache

## Common Issues

| Problem | Solution |
|---------|----------|
| "Readonly database" | FastF1 API issue; retry or use serial loads |
| "Integer division by zero" | Round has malformed data; skip that round |
| Tests hang | `pkill -f performance_tests` then `rm -rf .fastf1-cache computed_data` |
| Backend not found | Start with: `npm start` |

## Next Steps

1. Read `PERFORMANCE_BASELINE.md` for findings
2. Check why rounds 5, 10, 15, 23 fail
3. Implement loading UI (expect 90-120 seconds)
4. Consider pre-caching popular races

## Files

- `scripts/performance_tests_v2.py` - V2 test script
- `PERFORMANCE_BASELINE.md` - Executive summary
- `PERFORMANCE_BASELINE_V2.md` - Technical details
- `docs/PERFORMANCE/testing-guide.md` - Full guide
- `tests/performance_results_v2.json` - Raw test data

## See Also

- `PERFORMANCE_TESTING_SUMMARY.md` - Implementation overview
- `CLAUDE.md` - Architecture overview
- `.claude/rules/F1_DATA_REVIEW_RULE.md` - Code review requirements for f1_data.py
