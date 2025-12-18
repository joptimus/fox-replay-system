Step 0 – Files and context

Relevant files (from your doc): 

Backend:

src/f1_data.py – position sorting & frame generation (bug here).

backend/main.py – just serializes frames.

Frontend:

frontend/src/components/Leaderboard.tsx – displays positions.

frontend/src/components/TrackVisualization3D.tsx – uses (x, y) and looks correct.

Step 1 – Confirm the current behavior

Pick a problem race and one or two problem timestamps (frames) where you see obvious mismatches between 3D view and leaderboard.

Run the app and pause at that frame.

Note:

Leaderboard order (what the user sees).

Visual track order in 3D (which car is really ahead).

This gives you concrete frames to log and debug.

Step 2 – Instrument the backend sort

In src/f1_data.py inside get_race_telemetry(), near the current sort: 

# Current logic (simplified)
if is_race_start and grid_positions:
    snapshot.sort(key=lambda r: (grid_positions.get(r["code"], 999), -r["rel_dist"]))
elif race_finished and final_positions:
    snapshot.sort(key=lambda r: final_positions.get(r["code"], 999))
else:
    snapshot.sort(key=lambda r: (-r["lap"], -r["rel_dist"]))


Add debug prints around that:

if debug_start_time <= time_seconds <= debug_end_time:
    before = [
        (r["code"], r["lap"], r["rel_dist"], r["dist"])
        for r in snapshot
    ]
    print(f"[DEBUG] t={time_seconds:.2f} BEFORE_SORT: {before}", flush=True)

# existing sort here

if debug_start_time <= time_seconds <= debug_end_time:
    after = [
        (r["code"], r["lap"], r["rel_dist"], r["dist"])
        for r in snapshot
    ]
    print(f"[DEBUG] t={time_seconds:.2f} AFTER_SORT: {after}", flush=True)


Set debug_start_time / debug_end_time to cover your problematic frames.

Goal: see exactly how lap, rel_dist, and dist look before and after the sort for those frames.

Step 3 – Check distance monotonicity per driver

Still in get_race_telemetry() (or a small helper script that iterates frames), add a per-driver check:

from collections import defaultdict

last_progress = defaultdict(lambda: -1.0)

# inside the frame loop:
for r in snapshot:
    code = r["code"]
    progress = float(r.get("dist", 0.0))  # or race_progress later
    if progress + 1e-3 < last_progress[code]:
        print(
            f"[WARN] non-monotonic dist for {code} at t={time_seconds:.2f}: "
            f"{progress:.3f} < {last_progress[code]:.3f}",
            flush=True,
        )
    last_progress[code] = progress


If you see a lot of warnings, dist isn’t usable as-is and you should fall back to synthesizing it from lap + rel_dist.

Step 4 – Frontend sanity check: ignore position

In Leaderboard.tsx, temporarily replace the sort that uses data.position (from your doc): 

// OLD approach
const drivers = Object.entries(currentFrame.drivers)
  .map(([code, data]) => ({
    code,
    data,
    position: data.position,
  }))
  .sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    // tiebreakers...
  });


with:

const circuitLength = metadata.circuit_length; // pass this in from backend once

const drivers = Object.entries(currentFrame.drivers)
  .map(([code, data]) => {
    const lap = Math.max(data.lap ?? 1, 1);
    const rel = data.rel_dist ?? 0;
    const raceProgress = (lap - 1) * circuitLength + rel * circuitLength;

    return { code, data, raceProgress };
  })
  .sort((a, b) => b.raceProgress - a.raceProgress)
  .map((d, idx) => ({
    ...d,
    uiPosition: idx + 1,
  }));


Then render uiPosition instead of data.position in the UI:

<td>{driver.uiPosition}</td>


If the leaderboard now matches the 3D track order, you’ve confirmed the backend position is wrong.

Step 5 – Implement a proper race_progress in Python

In src/f1_data.py, after you build snapshot for a frame, compute a single race-progress metric:

circuit_length = track_meta["length_m"]  # however you store this

for r in snapshot:
    lap = max(r.get("lap", 1), 1)
    rel = float(r.get("rel_dist", 0.0))
    r["race_progress"] = (lap - 1) * circuit_length + rel * circuit_length


Then replace the race-phase sort with:

if is_race_start and grid_positions:
    snapshot.sort(key=lambda r: grid_positions.get(r["code"], 999))
elif race_finished and final_positions:
    snapshot.sort(key=lambda r: final_positions.get(r["code"], 999))
else:
    snapshot.sort(key=lambda r: -r["race_progress"])


Finally, reassign positions:

for pos, r in enumerate(snapshot, start=1):
    r["position"] = pos


Optional: send race_progress down to the frontend for debug.

Step 6 – Compare against FastF1 official position (optional but recommended)

In a small separate script (or inside get_race_telemetry() while debugging):

Use FastF1 to load the same session.

From session.laps, build a mapping: (driver, lap) → official_position.

For frames at the start/finish line (or near lap transitions), compare:

delta = abs(computed_position - official_position)
if delta > 2:
    print(f"[WARN] Position mismatch {code} at t={t}: "
          f"computed={computed_position}, official={official_position}")


This will tell you if your race_progress logic is wildly off at any point.

Step 7 – Clean up and optional UX polish

Once the order is correct:

Revert the frontend to trust data.position again (or keep the distance-based sort if you prefer).

Make sure React list items are keyed by driver code (e.g. 'VER') not array index.

Optionally add a dev overlay that shows lap, rel_dist, dist, position, race_progress next to each driver in dev builds for future debugging.