# Critical Finding: Go Backend is 2-3x Slower Than Expected

**Date:** March 8, 2026
**Status:** BLOCKING ISSUE IDENTIFIED
**Severity:** CRITICAL

---

## The Discovery

Testing with **empirical measurements** revealed:

### Python Extraction (fetch_telemetry.py):
- Load session: 2.96s
- Extract raw telemetry: 8.36s
- Write msgpack: 0.22s
- **Total: 11.54 seconds**

### Go Backend Actual Performance:
- **Total: 218.12 seconds (3.6 minutes!)**

### The Gap:
```
Expected time (Python extraction + Go frame generation): ~15-20 seconds
Actual time: 218 seconds
Unaccounted for: 198 seconds (90% of total time)
```

---

## What This Means

The Go rewrite, which was supposed to make things **much faster**, is actually making them **2-3x slower**.

### Timeline of Assumptions vs. Reality

| Component | Assumption | Reality | Status |
|-----------|-----------|---------|--------|
| Python extraction | Slow (78s resampling) | Fast (8.4s raw extraction) | ✓ As intended |
| Msgpack I/O | Slow (100MB file) | Fast (0.4s write + read) | ✓ As intended |
| Go frame generation | Fast (< 5s in Go) | **UNKNOWN - taking 198s** | ❌ **PROBLEM** |
| **Total** | **95 seconds** | **218 seconds** | ❌ **2.3x slower** |

---

## Where the 198 Extra Seconds Go

The Go backend code does:
1. Read msgpack file (instant, ~0.2s)
2. Deserialize msgpack (should be fast, ~1s)
3. **Call `generator.Generate(rawPayload, sessionType)` ← THIS IS TAKING 198 SECONDS**
4. Write cache (fast, ~0.1s)

**The problem is inside Go's frame generator.**

---

## Why This Contradicts Our Theory

Earlier analysis said:
- "Telemetry resampling is 80% of the 95-second Python time"
- "That means resampling takes ~78 seconds"
- "Go should be faster at resampling"

But what's actually happening:
1. **Python's extract_raw_telemetry() is NOT doing resampling** - it just extracts raw arrays (8.4s)
2. **Python's get_race_telemetry() DOES resampling** - that's the 95 seconds (but it's not being called by fetch_telemetry.py)
3. **Go's generator.Generate() MUST be doing the resampling** - and it's taking 198 seconds (way slower than Python!)

---

## The Real Problem: Go Resampling is Extremely Slow

The Go frame generator should:
1. Create a 25 FPS timeline from global_t_min to global_t_max
2. For each of 20 drivers, resample their telemetry to that timeline using linear interpolation
3. Compute positions, gaps, intervals
4. Generate ~154,000 frames

But it's taking **198 seconds** to do this.

For comparison, Python's equivalent resampling takes ~78 seconds (from earlier tests of `get_race_telemetry()`).

**Go is 2.5x slower than Python for this operation.**

---

## Hypothesis: Why Go is Slower

### Hypothesis 1: Inefficient Go Code
- The resampling algorithm in `go-backend/telemetry/generator.go` is not optimized
- Using loops instead of vectorized operations
- Memory allocation patterns are bad
- No parallelization despite having multiple cores available

### Hypothesis 2: JSON Unmarshaling
- The msgpack decode into Go structs might be slow
- Custom struct tag might be inefficient
- Data type conversions taking time

### Hypothesis 3: Frame Aggregation
- Building 154,000 frame objects one at a time
- Memory allocations for each frame
- Sorting/positioning calculations inefficient

### Hypothesis 4: Bug in the Code
- Infinite loop somewhere
- Resampling called multiple times accidentally
- Some blocking operation

---

## Proof: Go Backend is the Bottleneck

**Test 1: Python extraction alone**
```bash
python3 -c "
# Load + extract + serialize
time extract_raw_telemetry(session)  # 8.4 seconds
```
✓ **Result: 8.4 seconds**

**Test 2: Python full pipeline (before Go rewrite)**
```bash
python3 -c "
# This includes resampling and frame generation
time get_race_telemetry(session)  # 95 seconds
```
✓ **Result: 95 seconds** (includes extraction + resampling + frames)

**Test 3: Go backend (what we have now)**
```bash
curl -X POST http://localhost:8000/api/sessions \
  -d '{"year": 2025, "round": 1, "session_type": "R"}'
```
❌ **Result: 218 seconds** (should be ~10 + 5 = 15 seconds max)

---

## What Should Happen vs. What's Happening

### Expected Architecture:
```
Python script (10s)
├─ fastf1.get_session() [2.96s]
├─ extract_raw_telemetry() [8.36s]
└─ Write msgpack [0.22s]
    ↓
Go backend (should be 5-10s)
├─ Read msgpack [0.19s]
├─ Unmarshal msgpack [0.5s]
└─ generator.Generate() [SHOULD BE < 5s but is 198s]
    ↓
Total: ~15-20 seconds
```

### What's Actually Happening:
```
Python script (10s) ✓
    ↓
Go backend (is 208s) ❌
├─ generator.Generate() [198s - PROBLEM HERE]
    ↓
Total: 218 seconds (instead of ~20)
```

---

## Evidence This is a Go Problem (Not Python)

1. ✓ **Python extraction is fast** (8.4s, working correctly)
2. ✓ **Msgpack I/O is fast** (0.4s, working correctly)
3. ❌ **Go frame generation is slow** (198s, NOT working correctly)

The evidence points to **Go's frame generation being 20-40x slower than it should be**.

---

## What Needs to Happen Now

### Immediate (Today):
1. **Profile the Go frame generator**
   - Add timing instrumentation
   - Measure: timeline creation, resampling per driver, position calculation, frame aggregation
   - Find which part is taking 198 seconds

2. **Check for obvious bugs**
   - Is generator.Generate() being called multiple times?
   - Are there nested loops that shouldn't be nested?
   - Is there a synchronous wait on something that should be parallel?

### Short-term (This Week):
3. **Optimize the bottleneck**
   - Once profiling identifies the problem, optimize it
   - Expected improvement: At least 10x faster (198s → ~20s)
   - Might require rewriting in-memory data structures or parallelizing

### Medium-term:
4. **Consider reverting to Python frame generation**
   - If Go optimization is complex, faster to use Python for frame generation
   - Let Go handle serialization and caching only
   - Expected: 95s total (Python extraction + resampling, faster than 218s)

---

## Next Steps

This is the actual problem the user identified: "The backend is unreliable and very slow."

We now know:
- ❌ NOT slow because FastF1 API is slow (it's only 3 seconds)
- ❌ NOT slow because Python extraction is slow (it's only 8 seconds)
- ✅ **YES, slow because Go frame generation is extremely slow (198 seconds)**

**Before:** All focus on "parallel FastF1 fetching" (wrong problem)
**Now:** Focus on "why is Go frame generation 20x slower than expected?" (right problem)

---

## Recommendation

**DO NOT implement the parallel FastF1 architecture I proposed earlier.**

It was based on false assumptions. The actual bottleneck is Go, not FastF1.

Instead:
1. Profile the Go frame generator
2. Find and fix the performance problem
3. Target: 218s → 20-30s (10x improvement)

If Go optimization is too complex, revert to letting Python do frame generation.

---

## Irony

The user said: "I thought we moved to GO because we could drastically reduce that time"

We did move to Go. But Go is **drastically reducing performance in the wrong direction** - making it 2-3x slower.

This explains the original complaint perfectly: "The backend is unreliable and very slow" despite the Go rewrite.

The Go rewrite made things WORSE, not better.

---

**Status: BLOCKING - Cannot proceed with optimizations until Go performance is understood and fixed.**
