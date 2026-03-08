# Go Backend Rewrite Plan: Review Advisory

**Purpose:** Structured guidance for reviewing the implementation plan before execution.
**Created:** March 8, 2026
**Plan Document:** `go-backend-implementation-plan.md`

---

## Pre-Review Checklist

Before diving deep, verify these preconditions:

### Prerequisites
- [ ] Go 1.22+ installed locally
- [ ] Comfortable with Go goroutines, channels, sync.RWMutex
- [ ] Python experience (for bridge script modifications)
- [ ] Familiarity with the current Python backend (at least 30 min reading)
- [ ] Access to test F1 data (2025 rounds cached or fetchable)

### Project Health
- [ ] Current Python backend stable and working
- [ ] Test suite passing (especially f1_data.py tests)
- [ ] No active critical bugs in data pipeline
- [ ] Frontend stable (no major pending changes)

---

## Plan Review Framework

### 1. Architecture Soundness

**Questions to ask:**

1. **Hybrid Strategy Viability**
   - Can Python bridge truly be stateless? (Yes — it's subprocess-based)
   - Will stdout JSON lines work reliably? (Yes — proven pattern, used in many tools)
   - Is :8001 → :8000 reverse proxy overhead acceptable? (<1ms per request, yes)
   - **Risk level:** LOW

2. **Cache Format Decision**
   - Is LZ4 the right compression? (Yes — 4GB/s decompression, common in Go)
   - Why not just use Protocol Buffers? (Simpler, less schema coupling, msgpack used already)
   - Will cache versioning header prevent breaking changes? (Yes, version field included)
   - Is 200MB compressed size realistic? (Yes, text arrays compress well, 970MB → 200MB typical)
   - **Risk level:** LOW

3. **Concurrency Model**
   - Is one goroutine per WebSocket connection safe? (Yes — immutable frame data after generation)
   - Will session manager RWMutex scale? (Yes — sessions are created/deleted rarely, reads common)
   - Can multiple clients safely read same frame cache? (Yes — os.Mmap or just read-only file access)
   - **Risk level:** LOW

### 2. Technical Feasibility

**Spike/Risk Areas to Validate:**

| Risk | Validation Method | Status |
|------|-------------------|--------|
| Python subprocess stdout parsing | Test `fetch_telemetry.py` outputs valid JSON lines | Must do before Phase 2 |
| msgpack marshaling struct tags | Create test Frame, marshal/unmarshal round-trip | Must do Phase 1 end |
| LZ4 compression ratio | Test on actual 154k frame session | Must do Phase 3 start |
| 60 Hz WebSocket loop latency | Benchmark frame serialization time | Must do Phase 2 end |
| Golden file parity | Generate from Python, test in Go | Must do Phase 4 start |

**Questions:**

1. **Frame Struct Design**
   - Are pointer fields (`*float64` for optional values) the right choice? (Yes, safer than NaN)
   - Will msgpack marshal omit nil pointers? (Yes, with `omitempty` tag)
   - Is the struct compatible with frontend msgpackr decoder? (Verify on day 2)
   - **Risk level:** MEDIUM (must validate early)

2. **Interpolation Algorithm**
   - Will single-pass linear interpolation match NumPy exactly? (Yes — same math, watch floating point precision)
   - What about edge cases (short arrays, out-of-bounds times)? (Handle in Phase 2.4, test thoroughly)
   - Is step interpolation (gear, tyre, lap) a simple floor lookup? (Yes, exactly that)
   - **Risk level:** MEDIUM (must golden-file test)

3. **Position Sorting**
   - Can you replicate Python's `sort_key_hybrid()` exactly? (Yes — three-tuple sort, deterministic)
   - Will PositionSmoothing class behavior match including timing thresholds? (Yes — 1.0s green, 0.3s SC/VSC)
   - What about lap anchor — is it a simple position snap at lap boundaries? (Needs clarification from Python code)
   - **Risk level:** HIGH (core algorithm, affects leaderboard accuracy)

### 3. Implementation Realism

**Does the timeline fit?**

| Phase | Days | Estimated LoC | Realistic? |
|-------|------|----------------|-----------|
| 1 | 2 | ~800 | ✅ Yes (straightforward setup) |
| 2 | 2 | ~1500 | ⚠️ Tight (subprocess + frame loop) |
| 3 | 2 | ~600 | ✅ Yes (format design clear) |
| 4 | 3 | ~1200 | ⚠️ Tight (many algorithms) |
| 5 | 1 | ~400 | ⚠️ Very tight (cutover, testing) |
| **Total** | **10** | **~4500** | ⚠️ **Ambitious** |

**Questions:**

1. **Is 10 days realistic for one person?**
   - Best case: Yes (all spikes work, no integration bugs)
   - Likely case: 12–14 days (debugging, refinement, fixes)
   - Worst case: 21+ days (subprocess issues, algorithm debugging)
   - **Recommendation:** Plan for 2 weeks, not 10 days

2. **Are phases sequential or parallelizable?**
   - Phase 1–2 are sequential (need server first)
   - Phase 3–4 could start on day 4 in parallel (different developer ideal)
   - Phase 5 must be last
   - **Single developer:** Phases 1,2,3,4,5 sequential (realistic)

3. **What happens if Phase 2 subprocess debugging takes 3 extra days?**
   - Fallback: Skip Phase 3 LZ4 optimization initially, use simpler format
   - Risk: Cache files larger, but still works
   - Still hit perf targets? Yes (Go is faster than Python regardless)

### 4. Data Integrity Risks

**Critical Question: Will frame data always be correct?**

1. **Race Progress Normalization**
   - Python: Uses `global_t_min` from telemetry, shifts to zero, then normalizes distance at race start
   - Go equivalent: Must replicate exactly
   - **Validation:** Compare 10 frames from Python vs Go output frame-by-frame
   - **Risk level:** HIGH (if wrong, leaderboard broken)

2. **Position Sorting Determinism**
   - Python uses explicit 3-tier sort key, always same order for same input
   - Go must use identical sorting logic
   - **Validation:** Golden file for frame 1000, 50000, 150000 (different race states)
   - **Risk level:** HIGH

3. **NaN/Infinity Handling**
   - Python: `np.isnan()`, `np.isinf()` checks throughout
   - Go: Must handle explicitly (no built-in NaN like Python floats)
   - **Validation:** Test with edge case session (early career mode, incomplete sectors)
   - **Risk level:** MEDIUM

4. **Floating Point Precision**
   - Python uses 64-bit floats, Go same
   - But interpolation accumulation errors could diverge
   - **Validation:** Check max error across all 154k frames (target: < 0.001%)
   - **Risk level:** LOW (usually < 1e-6 difference)

### 5. Integration Points Risk Assessment

**Where can the Go backend break the frontend?**

| Integration | Risk | Mitigation |
|-------------|------|-----------|
| WebSocket msgpack format | HIGH | Validate frame struct matches frontend expectations |
| JSON control messages | MEDIUM | Use same schema as Python (documented) |
| Session metadata format | MEDIUM | Verify all fields present before sending |
| Loading progress messages | LOW | Same format as Python |
| Error responses | MEDIUM | Match Python HTTP status codes |
| CORS headers | LOW | Copy from Python FastAPI config |

**Questions:**

1. **Will frontend decoder (msgpackr) handle Go msgpack output?**
   - Yes — msgpack is standard format, compatible
   - BUT: Must verify struct field types match expectations
   - **Action:** Day 2, send test frame to real frontend browser, check console

2. **If WebSocket frame format has a bug, how fast can you fix?**
   - Identify: < 5 min (console logs)
   - Fix: < 30 min (struct field, re-deploy)
   - Test: < 15 min
   - Total: < 1 hour
   - **Acceptable risk**

3. **Can you test frontend integration before full cutover?**
   - Yes! Phase 1 should build msgpack frames even in stub
   - Phase 2 test with real frontend (parallel browser connection)
   - Phase 5 is just confirming, not discovering
   - **Reduces risk: HIGH → MEDIUM**

### 6. Dependency & Tooling Risks

**Questions:**

1. **Go package compatibility**
   - `github.com/go-chi/chi/v5` — Stable, widely used ✅
   - `github.com/gorilla/websocket` — Industry standard ✅
   - `github.com/vmihailenco/msgpack/v5` — Widely tested ✅
   - `github.com/pierrec/lz4/v4` — Only package without heavy go.mod footprint ✅
   - **Risk level:** LOW

2. **Are there version conflicts in go.mod?**
   - Not yet — modules haven't been created
   - **Action:** Start Phase 1.1 with `go mod init`, run `go mod tidy`, watch for conflicts
   - **Expected:** None (these packages are compatible)

3. **Python bridge: Is `scripts/fetch_telemetry.py` a new file or refactor of existing code?**
   - Refactor of `f1_data.py` (extract data loading)
   - Risk: Introducing bugs when refactoring
   - **Mitigation:** Don't touch algorithm code, just data extraction
   - **Action:** Write `fetch_telemetry.py` first, test independently before integrating

### 7. Performance Risk

**Assumption: Go will be 10x faster. Is that realistic?**

Breaking down the 10x claim:

```
Python cache hit path:
  1. Load pickle       ~3–5s
  2. Deserialize       ~2s
  3. Load metadata     ~0.1s
  Total:               ~5–7s

Go cache hit path:
  1. Open .f1cache     ~1ms
  2. Read header JSON  ~5ms
  3. Decompress LZ4    ~50–150ms (980MB compressed → memory)
  4. Unmarshal msgpack ~50–100ms
  5. Load metadata     ~1ms
  Total:               ~100–250ms

Ratio:                 ~20–70x improvement on cache hit!
```

**Is this realistic?**
- Yes! But depends on:
  - ✅ LZ4 decompression speed (Go standard: 4GB/s)
  - ✅ File I/O efficiency
  - ⚠️ Memory availability (need 1GB+ free)
  - ⚠️ SSD speed (HDD would be much slower)

**Questions:**

1. **What's your disk speed?**
   - If SSD (> 500 MB/s): ✅ Safe bet
   - If HDD (< 100 MB/s): ⚠️ May be slower
   - **Action:** Benchmark Phase 1 on your machine

2. **Will memory pressure be an issue?**
   - Each decompressed session: ~980MB
   - Max concurrent sessions: probably 1–2 (users)
   - Total RAM needed: ~2GB headroom
   - **Risk:** LOW (modern machines have this)

3. **What about frame generation speed (10–40s → 0.5–2s)?**
   - Python: Pure Python loop, 154k iterations
   - Go: Compiled, same algorithm, ~30x faster typical
   - **Is 0.5–2s realistic?**
     - Low estimate (0.5s): Yes, possible with hot cache
     - High estimate (2s): Yes, conservative
     - **Most likely: 1–1.5s**

### 8. Testing & Validation Gaps

**What's NOT covered in the plan?**

1. **Multi-driver complex scenarios**
   - Pit stops (how does position change?)
   - DNFs mid-session (retired driver sorting)
   - Rain/tyre changes
   - **Action:** Add test for 2023 Suzuka (rainy, tyre strategies)

2. **Edge cases in frame generation**
   - Very short races (< 5 laps)
   - Long races (> 70 laps, 300k+ frames)
   - Incomplete sessions (red flags, abandoned)
   - **Action:** Add edge case sessions to golden file tests

3. **WebSocket stress testing**
   - What if frontend sends commands at 1000Hz?
   - What if it's very slow (on mobile)?
   - **Action:** Add WebSocket load test (phase 2 or 5)

4. **Concurrency edge cases**
   - Two users request same session_id simultaneously
   - One finishes loading before other connects
   - One disconnects mid-frame send
   - **Action:** Add concurrent session test

5. **Python bridge edge cases**
   - Python process crashes mid-execution
   - Stdout buffering fills up
   - Network timeout (if bridge goes remote)
   - **Action:** Test subprocess error handling (phase 2 spike)

### 9. Scope Creep Warning Signs

**What could expand this plan?**

1. **"Let's also rewrite the frontend in Go/Rust/etc."**
   - ❌ OUT OF SCOPE — Not on plan
   - Frontend is stable and React is standard
   - **Decision: Keep frontend as-is**

2. **"Let's add caching on the client side too."**
   - ❌ OUT OF SCOPE — Not on plan
   - Frontend can cache IndexedDB if desired, separate effort
   - **Decision: Don't change frontend for this project**

3. **"We should use gRPC instead of JSON for the bridge."**
   - ❌ OUT OF SCOPE — Adds complexity
   - JSON-lines is proven, debuggable, works
   - **Decision: Stick with JSON-lines**

4. **"Let's switch to PostgreSQL for persistent session storage."**
   - ❌ OUT OF SCOPE — In-memory sessions work today
   - Can add persistence later if needed
   - **Decision: Keep in-memory session manager**

**Recommendation:** If scope creep tempts you, note it in a "Phase 6: Future Ideas" document and move on.

---

## Approval Gate Questions

Before you start Day 1, you must be able to answer YES to these:

### Go Readiness
- [ ] I've written at least 500 lines of Go code before
- [ ] I'm comfortable with goroutines and channels
- [ ] I understand sync.RWMutex use cases
- [ ] I can debug Go runtime errors

### Python/Data Pipeline Knowledge
- [ ] I've read `shared/telemetry/f1_data.py` (at least main functions)
- [ ] I understand the 4-tier position sorting logic
- [ ] I know what race_progress normalization does and why
- [ ] I've traced one full frame generation in my head

### Architecture Understanding
- [ ] I understand why FastF1 stays in Python
- [ ] I understand the subprocess bridge pattern
- [ ] I know why WebSocket frames must be binary msgpack
- [ ] I can explain the cache hit vs cache miss path

### Risk Tolerance
- [ ] I'm OK with potentially losing 2 weeks of work if something fundamentally breaks
- [ ] I have a rollback plan (keep Python backend, git-revert)
- [ ] I can accept "cache hit is 0.5s instead of 0.1s" as still a win
- [ ] I can work on edge cases for extra days without discouragement

### Integration Confidence
- [ ] I've tested websocket connections in Go/Rust/etc. before
- [ ] I can debug frontend/backend protocol issues
- [ ] I have a way to run frontend locally during development
- [ ] I can capture WebSocket traffic (DevTools, Wireshark, etc.)

**If you answered NO to more than 2 questions above, consider:**
- Spending 2–3 days on Go crash course + prototyping
- Pairing with someone experienced in Go
- Reducing scope (cache optimization only, no frame gen rewrite)

---

## Red Flags During Execution

**If you see these patterns, stop and reassess:**

### Phase 1–2
- 🚩 Subprocess doesn't produce valid JSON output
  - **Stop, debug.** This is fundamental. Can't proceed without it.
- 🚩 Frame struct marshaling produces wrong msgpack
  - **Stop, test against frontend.** This is blocking.
- 🚩 WebSocket connection keeps dropping
  - **Stop, investigate goroutine leaks.** Use pprof.

### Phase 3–4
- 🚩 Decompression produces corrupt data
  - **Revert LZ4, use plain msgpack.** Still fast.
- 🚩 Position sorting doesn't match Python
  - **Golden file debugging.** Find exact mismatched frame.
- 🚩 Golden file tests failing on more than 5% of frames
  - **Investigate algorithm ports.** One has a bug.

### Phase 5
- 🚩 Frontend won't connect to Go backend
  - **Check CORS headers, WebSocket path.** Should be quick fix.
- 🚩 Playback is choppy / frames drop
  - **Profile WebSocket loop.** Check for blocking operations.
- 🚩 Memory usage blows up after 2 hours
  - **Memory leak.** Check session cleanup, goroutine leaks.

---

## Decision Tree: Proceed or Pivot?

```
START: Review Complete

├─ Are prerequisites met? (Go 1.22+, Python experience, data access)
│  └─ NO → Delay start 3–5 days, complete prerequisites
│  └─ YES → Continue
│
├─ Do you understand the hybrid architecture?
│  └─ NO → Spend 1 day reading/prototyping Python bridge
│  └─ YES → Continue
│
├─ Have you spiked the subprocess JSON parsing?
│  └─ NO → Spike Phase 2.1 first (1 day)
│  └─ YES → Continue
│
├─ Are you confident in Go + WebSocket abilities?
│  └─ NO → Do Go WebSocket hello-world (1 day)
│  └─ YES → Continue
│
├─ Do you have 2 weeks of uninterrupted time?
│  └─ NO → Negotiate schedule, reschedule start date
│  └─ YES → Continue
│
└─ ✅ APPROVED: Start Phase 1 on Day 1
   └─ If blocker found during Phase 1/2 → Fallback to Python backend
   └─ If successful through Phase 4 → Full cutover in Phase 5
```

---

## Resource Checklist

**Before Day 1, gather:**

- [ ] Test F1 data (2025 R1 race session cached, or FastF1 access)
- [ ] Python source code open (`f1_data.py` for reference)
- [ ] Go IDE setup (VSCode + Go extension, Goland, etc.)
- [ ] Benchmark tools ready (`go test -bench`, pprof)
- [ ] Frontend running locally (`npm run dev` in frontend/)
- [ ] Browser DevTools open for WebSocket inspection
- [ ] Rollback plan documented (git branch, Python backend backup)
- [ ] 2–3 historical sessions selected for golden file testing
- [ ] Team communication channel (for questions mid-execution)

---

## Success Looks Like

**At end of Day 10:**

✅ Go binary runs, listens on :8000
✅ `/api/health` responds
✅ WebSocket connects (stub)
✅ Msgpack frame encoding works
✅ Python bridge subprocess produces JSON
✅ Frame generation produces 154k frames
✅ WebSocket 60 Hz loop sends frames
✅ Playback controls work (play, pause, seek)
✅ `.f1cache` format serializes/deserializes
✅ LZ4 compression achieves 5x ratio
✅ Golden file tests pass (> 95% frame parity)
✅ Position sorting matches Python
✅ Cache hit loads in < 500ms
✅ Frontend loads and plays correctly
✅ Python backend still works (rollback option)

**If all above achieved: 🎉 Successful rewrite, proceed to Phase 5 cleanup.**

---

## Document Locations

Keep these handy during execution:

| Document | Purpose | Location |
|----------|---------|----------|
| Implementation Plan | Step-by-step guidance | `docs/ARCHITECTURE/go-backend-implementation-plan.md` |
| Current System Doc | Python architecture reference | `docs/ARCHITECTURE/current-system.md` |
| Original Proposal | High-level strategy | `docs/ARCHITECTURE/go-rewrite-plan.md` |
| Python Source | Algorithm reference | `shared/telemetry/f1_data.py` |
| WebSocket Protocol | Format spec | `backend/app/websocket.py` |
| This Advisory | Review framework | `docs/ARCHITECTURE/PLAN_REVIEW_ADVISORY.md` |

---

## Final Recommendation

**This plan is READY FOR EXECUTION if:**
1. You answer YES to all approval gate questions
2. You've spiked the subprocess pattern (Phase 2.1)
3. You have 2 weeks available (plan for 10 days, expect 12–14)
4. You can accept rollback if needed

**This plan should be REVISED if:**
1. You don't have Go experience (do crash course first)
2. Your machine is underpowered (< 4GB RAM, HDD instead of SSD)
3. You have concurrent project obligations (this needs focus)
4. You want to include other rewrites (limit scope)

**Suggested Start Approach:**
- Day 0: Complete this review, answer all questions
- Days 1–2: Phase 1 (highest confidence, lowest risk)
- Days 3–4: Phase 2 with real data (confidence increases)
- Days 5–9: Phases 3–4 (refinement and validation)
- Day 10+: Phase 5 cutover (only if preceding phases successful)

---

**Last Updated:** March 8, 2026
**Plan Status:** Ready for review
**Next Step:** Answer approval gate questions, schedule kickoff
