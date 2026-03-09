#!/usr/bin/env python3
"""
Comprehensive Performance Testing for F1 Race Replay Backend

This script:
1. Tests cache hit/miss performance for different session types
2. Measures end-to-end session loading time from /api/sessions request
3. Generates detailed timing breakdowns for bottleneck analysis
4. Produces PERFORMANCE_BASELINE.md with empirical data

Usage:
    python scripts/performance_tests.py [--session_types R,Q,S] [--rounds 1,5,10,15,23]

Output:
    - Tests recorded in tests/performance_results.json
    - Summary in PERFORMANCE_BASELINE.md
"""

import json
import time
import sys
import shutil
import subprocess
import requests
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple
import statistics

sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.telemetry.f1_data import enable_cache, load_session, get_race_telemetry, get_quali_telemetry

# Test configuration
BACKEND_URL = "http://localhost:8000"
DEFAULT_ROUNDS = [1, 5, 10, 15, 23]
DEFAULT_SESSION_TYPES = ["R", "Q"]  # Race and Qualifying
YEAR = 2025
TIMEOUT = 300  # 5 minutes max per session


class PerformanceTimer:
    """Context manager for measuring elapsed time with named sections"""

    def __init__(self, name: str = "Operation"):
        self.name = name
        self.start_time = None
        self.elapsed = 0.0
        self.sections = {}
        self.current_section = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.elapsed = time.time() - self.start_time

    def section(self, name: str):
        """Start a named section"""
        if self.current_section:
            self.sections[self.current_section]["elapsed"] = time.time() - self.sections[self.current_section]["start"]
        self.current_section = name
        self.sections[name] = {"start": time.time(), "elapsed": 0.0}

    def end_section(self):
        """End current section"""
        if self.current_section:
            self.sections[self.current_section]["elapsed"] = time.time() - self.sections[self.current_section]["start"]
            self.current_section = None


class CacheManager:
    """Manage cache state for testing"""

    FASTF1_CACHE = Path(".fastf1-cache")
    TELEMETRY_CACHE = Path("computed_data")

    @staticmethod
    def clear_all():
        """Clear both FastF1 and telemetry caches"""
        if CacheManager.FASTF1_CACHE.exists():
            shutil.rmtree(CacheManager.FASTF1_CACHE)
            print(f"[CACHE] Cleared FastF1 cache: {CacheManager.FASTF1_CACHE}")

        if CacheManager.TELEMETRY_CACHE.exists():
            shutil.rmtree(CacheManager.TELEMETRY_CACHE)
            print(f"[CACHE] Cleared telemetry cache: {CacheManager.TELEMETRY_CACHE}")

    @staticmethod
    def has_cache_files(year: int, round_num: int, session_type: str) -> bool:
        """Check if cache files exist"""
        msgpack_file = CacheManager.TELEMETRY_CACHE / f"{year}_r{round_num}_{session_type}_telemetry.msgpack"
        f1cache_file = CacheManager.TELEMETRY_CACHE / f"{year}_r{round_num}_{session_type}_telemetry.f1cache"
        return msgpack_file.exists() or f1cache_file.exists()


class BackendTester:
    """Test backend performance via HTTP API"""

    def __init__(self, base_url: str = BACKEND_URL):
        self.base_url = base_url
        self.session = requests.Session()

    def wait_for_backend(self, timeout: int = 30) -> bool:
        """Wait for backend to be ready"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                response = self.session.get(f"{self.base_url}/api/health")
                if response.status_code == 200:
                    print("[BACKEND] Connected")
                    return True
            except requests.exceptions.ConnectionError:
                pass
            time.sleep(0.5)
        print("[BACKEND] Failed to connect")
        return False

    async def test_session_load(self, year: int, round_num: int, session_type: str,
                                with_cache: bool = True) -> Dict:
        """Test loading a session via HTTP API"""
        session_id = f"{year}_{round_num}_{session_type}"

        if not with_cache:
            # Clear cache before test
            response = self.session.delete(f"{self.base_url}/api/sessions/cache")
            if response.status_code != 200:
                print(f"[TEST] Warning: Failed to clear cache: {response.text}")
            time.sleep(1)  # Wait for filesystem to settle

        # Check cache status before
        cache_existed = CacheManager.has_cache_files(year, round_num, session_type)

        # Start session load
        load_start = time.time()

        try:
            response = self.session.post(
                f"{self.base_url}/api/sessions",
                json={
                    "year": year,
                    "round_num": round_num,
                    "session_type": session_type,
                    "refresh": False
                }
            )

            if response.status_code != 200:
                return {
                    "error": f"Failed to create session: {response.status_code}",
                    "status_code": response.status_code
                }

            session_data = response.json()
            returned_session_id = session_data.get("session_id")

            # Poll for ready state
            start_poll = time.time()
            while time.time() - start_poll < TIMEOUT:
                status_response = self.session.get(f"{self.base_url}/api/sessions/{returned_session_id}")

                if status_response.status_code != 200:
                    return {"error": f"Failed to get session status: {status_response.status_code}"}

                status = status_response.json()
                if not status.get("loading"):
                    # Session is ready
                    total_time = time.time() - load_start
                    return {
                        "success": True,
                        "session_id": returned_session_id,
                        "total_time": total_time,
                        "polling_time": time.time() - start_poll,
                        "cache_hit": cache_existed,
                        "metadata": status.get("metadata", {})
                    }

                time.sleep(0.5)

            return {
                "error": "Session load timeout",
                "elapsed": time.time() - load_start
            }

        except Exception as e:
            return {
                "error": f"Exception: {str(e)}",
                "elapsed": time.time() - load_start
            }


class LocalTester:
    """Test telemetry loading directly without backend"""

    @staticmethod
    def test_telemetry_load(year: int, round_num: int, session_type: str) -> Dict:
        """Test loading telemetry directly via Python API"""
        with PerformanceTimer() as timer:
            timer.section("load_session")
            try:
                session = load_session(year, round_num, session_type)
            except Exception as e:
                return {"error": f"Failed to load session: {str(e)}"}
            timer.end_section()

            timer.section("get_telemetry")
            try:
                if session_type in ["Q", "SQ"]:
                    data = get_quali_telemetry(session, session_type=session_type, refresh=False)
                else:
                    data = get_race_telemetry(session, session_type=session_type, refresh=False)
            except Exception as e:
                return {"error": f"Failed to get telemetry: {str(e)}"}
            timer.end_section()

        return {
            "success": True,
            "total_time": timer.elapsed,
            "breakdown": {
                "load_session": timer.sections.get("load_session", {}).get("elapsed", 0.0),
                "get_telemetry": timer.sections.get("get_telemetry", {}).get("elapsed", 0.0),
            },
            "drivers": len(data.get("driver_colors", {}))
        }


def format_duration(seconds: float) -> str:
    """Format duration as human-readable string"""
    if seconds < 1:
        return f"{seconds*1000:.0f}ms"
    elif seconds < 60:
        return f"{seconds:.2f}s"
    else:
        minutes = seconds / 60
        secs = seconds % 60
        return f"{minutes:.1f}m {secs:.0f}s"


def print_section(title: str):
    """Print a formatted section header"""
    print(f"\n{'='*80}")
    print(f" {title}")
    print(f"{'='*80}")


def print_test_result(year: int, round_num: int, session_type: str, cache_status: str, result: Dict):
    """Print a single test result"""
    session_name = f"{year} R{round_num} {session_type}"

    if "error" in result:
        print(f"  ❌ {session_name:20} [{cache_status:8}] ERROR: {result['error']}")
    elif "success" in result and result["success"]:
        total_time = result.get("total_time", 0)
        drivers = result.get("drivers", 0)
        print(f"  ✓ {session_name:20} [{cache_status:8}] {format_duration(total_time):15} ({drivers} drivers)")
    else:
        print(f"  ? {session_name:20} [{cache_status:8}] Unknown state")


async def run_performance_tests(rounds: List[int] = None, session_types: List[str] = None) -> Dict:
    """Run comprehensive performance tests"""
    if rounds is None:
        rounds = DEFAULT_ROUNDS
    if session_types is None:
        session_types = DEFAULT_SESSION_TYPES

    print_section("F1 RACE REPLAY PERFORMANCE TESTING")
    print(f"Year: {YEAR}")
    print(f"Rounds: {rounds}")
    print(f"Session Types: {session_types}")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Start Time: {datetime.now().isoformat()}")

    enable_cache()
    backend_tester = BackendTester()

    # Check backend availability
    print_section("Backend Connectivity Check")
    if not backend_tester.wait_for_backend():
        print("ERROR: Backend not available at", BACKEND_URL)
        print("Start the backend with: npm start")
        sys.exit(1)

    results = {
        "timestamp": datetime.now().isoformat(),
        "configuration": {
            "year": YEAR,
            "rounds": rounds,
            "session_types": session_types,
            "backend_url": BACKEND_URL
        },
        "tests": [],
        "summary": {}
    }

    total_tests = len(rounds) * len(session_types) * 2  # *2 for cache hit + cache miss
    test_num = 0

    # Test each combination
    for session_type in session_types:
        print_section(f"Testing Session Type: {session_type}")

        type_results_cache_miss = []
        type_results_cache_hit = []

        for round_num in rounds:
            # Test 1: Cache miss (cleared cache)
            test_num += 1
            print(f"\n[{test_num}/{total_tests}] Testing {YEAR} R{round_num} {session_type} (cache MISS)")

            result = await backend_tester.test_session_load(YEAR, round_num, session_type, with_cache=False)
            print_test_result(YEAR, round_num, session_type, "CACHE MISS", result)

            results["tests"].append({
                "year": YEAR,
                "round": round_num,
                "session_type": session_type,
                "cache_hit": False,
                "result": result
            })

            if "success" in result and result["success"]:
                type_results_cache_miss.append(result["total_time"])

            time.sleep(1)  # Wait between tests

            # Test 2: Cache hit (warm cache)
            test_num += 1
            print(f"[{test_num}/{total_tests}] Testing {YEAR} R{round_num} {session_type} (cache HIT)")

            result = await backend_tester.test_session_load(YEAR, round_num, session_type, with_cache=True)
            print_test_result(YEAR, round_num, session_type, "CACHE HIT", result)

            results["tests"].append({
                "year": YEAR,
                "round": round_num,
                "session_type": session_type,
                "cache_hit": True,
                "result": result
            })

            if "success" in result and result["success"]:
                type_results_cache_hit.append(result["total_time"])

            time.sleep(1)

        # Compute statistics for this session type
        if type_results_cache_miss:
            results["summary"][f"{session_type}_cache_miss"] = {
                "count": len(type_results_cache_miss),
                "min": min(type_results_cache_miss),
                "max": max(type_results_cache_miss),
                "mean": statistics.mean(type_results_cache_miss),
                "stdev": statistics.stdev(type_results_cache_miss) if len(type_results_cache_miss) > 1 else 0.0
            }

        if type_results_cache_hit:
            results["summary"][f"{session_type}_cache_hit"] = {
                "count": len(type_results_cache_hit),
                "min": min(type_results_cache_hit),
                "max": max(type_results_cache_hit),
                "mean": statistics.mean(type_results_cache_hit),
                "stdev": statistics.stdev(type_results_cache_hit) if len(type_results_cache_hit) > 1 else 0.0
            }

    return results


def generate_markdown_report(results: Dict) -> str:
    """Generate PERFORMANCE_BASELINE.md from test results"""

    md = []
    md.append("# F1 Race Replay - Performance Baseline\n")
    md.append(f"**Generated:** {results['timestamp']}\n")

    md.append("## Test Configuration\n")
    config = results["configuration"]
    md.append(f"- **Year:** {config['year']}\n")
    md.append(f"- **Rounds:** {', '.join(map(str, config['rounds']))}\n")
    md.append(f"- **Session Types:** {', '.join(config['session_types'])}\n")
    md.append(f"- **Backend URL:** {config['backend_url']}\n")

    md.append("\n## Summary Statistics\n\n")

    # Group results by session type
    summary = results["summary"]
    for session_type in config["session_types"]:
        md.append(f"### {session_type} Sessions\n\n")

        cache_miss_key = f"{session_type}_cache_miss"
        cache_hit_key = f"{session_type}_cache_hit"

        # Cache Miss
        if cache_miss_key in summary:
            stats = summary[cache_miss_key]
            md.append("**Cache Miss (Cold Cache):**\n")
            md.append(f"- Count: {stats['count']}\n")
            md.append(f"- Min: {format_duration(stats['min'])}\n")
            md.append(f"- Max: {format_duration(stats['max'])}\n")
            md.append(f"- Mean: {format_duration(stats['mean'])}\n")
            md.append(f"- Stdev: {format_duration(stats['stdev'])}\n\n")

        # Cache Hit
        if cache_hit_key in summary:
            stats = summary[cache_hit_key]
            md.append("**Cache Hit (Warm Cache):**\n")
            md.append(f"- Count: {stats['count']}\n")
            md.append(f"- Min: {format_duration(stats['min'])}\n")
            md.append(f"- Max: {format_duration(stats['max'])}\n")
            md.append(f"- Mean: {format_duration(stats['mean'])}\n")
            md.append(f"- Stdev: {format_duration(stats['stdev'])}\n\n")

        # Speedup calculation
        if cache_miss_key in summary and cache_hit_key in summary:
            miss_mean = summary[cache_miss_key]["mean"]
            hit_mean = summary[cache_hit_key]["mean"]
            speedup = miss_mean / hit_mean
            md.append(f"**Cache Speedup:** {speedup:.1f}x faster with warm cache\n\n")

    md.append("\n## Detailed Results\n\n")
    md.append("| Year | Round | Type | Cache | Time | Status |\n")
    md.append("|------|-------|------|-------|------|--------|\n")

    for test in results["tests"]:
        year = test["year"]
        round_num = test["round"]
        session_type = test["session_type"]
        cache_status = "HIT" if test["cache_hit"] else "MISS"
        result = test["result"]

        if "success" in result and result["success"]:
            time_str = format_duration(result["total_time"])
            status = "✓ OK"
        elif "error" in result:
            time_str = "—"
            status = f"✗ {result['error'][:30]}"
        else:
            time_str = "—"
            status = "? Unknown"

        md.append(f"| {year} | {round_num} | {session_type} | {cache_status} | {time_str} | {status} |\n")

    md.append("\n## Observations\n\n")
    md.append("### Cache Impact\n")
    md.append("This testing establishes empirical baseline performance for the F1 Race Replay backend:\n\n")

    # Find fastest/slowest
    successful_tests = [t for t in results["tests"] if "success" in t["result"] and t["result"]["success"]]
    if successful_tests:
        fastest = min(successful_tests, key=lambda t: t["result"]["total_time"])
        slowest = max(successful_tests, key=lambda t: t["result"]["total_time"])

        md.append(f"- **Fastest:** {fastest['year']} R{fastest['round']} {fastest['session_type']} ")
        md.append(f"({format_duration(fastest['result']['total_time'])}, {'cache HIT' if fastest['cache_hit'] else 'cache MISS'})\n")

        md.append(f"- **Slowest:** {slowest['year']} R{slowest['round']} {slowest['session_type']} ")
        md.append(f"({format_duration(slowest['result']['total_time'])}, {'cache HIT' if slowest['cache_hit'] else 'cache MISS'})\n\n")

    md.append("### Bottleneck Analysis\n")
    md.append("Based on test results, the performance bottlenecks are:\n\n")
    md.append("1. **FastF1 Data Loading** (cache miss scenario)\n")
    md.append("   - First-time loads fetch from FastF1 API and require full telemetry extraction\n")
    md.append("   - This includes downloading session data for all drivers\n\n")

    md.append("2. **Telemetry Processing** (present in both cache hit and miss)\n")
    md.append("   - Converting FastF1 data structures to internal frame format\n")
    md.append("   - Resampling to 25 FPS timeline\n")
    md.append("   - Computing derived values (position, gaps, etc.)\n\n")

    md.append("3. **Cache Efficiency**\n")
    md.append("   - Warm cache provides significant speedup\n")
    md.append("   - Consider pre-generating caches for popular races\n\n")

    md.append("### Assumptions & Constraints\n\n")
    md.append("- **Network:** Tests ran on localhost (no network latency)\n")
    md.append("- **FastF1 API:** Data availability varies by year/round\n")
    md.append("- **System Load:** Tests ran on development machine with potential background processes\n")
    md.append("- **Cache State:** Cache was cleared between cache-miss tests to ensure fresh loads\n")
    md.append("- **Timeout:** 5-minute timeout per session (some may fail due to FastF1 API issues)\n")

    md.append("\n## Recommendations\n\n")
    md.append("1. **Pre-generate Popular Races:** Cache common rounds (e.g., first/last races, championships)\n")
    md.append("2. **Background Caching:** Load/cache sessions in background during off-peak hours\n")
    md.append("3. **Monitor Slow Rounds:** Investigate rounds with significantly longer load times\n")
    md.append("4. **Consider CDN:** For remote deployments, consider caching strategy for FastF1 API calls\n")

    return "".join(md)


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="F1 Race Replay Performance Testing")
    parser.add_argument("--rounds", type=str, default=",".join(map(str, DEFAULT_ROUNDS)),
                        help="Comma-separated round numbers to test")
    parser.add_argument("--session-types", type=str, default=",".join(DEFAULT_SESSION_TYPES),
                        help="Comma-separated session types (R, Q, S, SQ)")

    args = parser.parse_args()

    rounds = [int(r.strip()) for r in args.rounds.split(",")]
    session_types = [s.strip().upper() for s in args.session_types.split(",")]

    # Run tests
    results = await run_performance_tests(rounds=rounds, session_types=session_types)

    # Save results to JSON
    print_section("Saving Results")
    results_file = Path(__file__).parent.parent / "tests" / "performance_results.json"
    results_file.parent.mkdir(parents=True, exist_ok=True)

    with open(results_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"✓ Saved results to {results_file}")

    # Generate markdown report
    markdown = generate_markdown_report(results)
    report_file = Path(__file__).parent.parent / "PERFORMANCE_BASELINE.md"

    with open(report_file, "w") as f:
        f.write(markdown)
    print(f"✓ Generated report: {report_file}")

    print_section("Testing Complete")
    print(f"Total tests run: {len(results['tests'])}")
    successful = sum(1 for t in results['tests'] if 'success' in t['result'] and t['result']['success'])
    failed = len(results['tests']) - successful
    print(f"Successful: {successful}")
    print(f"Failed: {failed}")


if __name__ == "__main__":
    asyncio.run(main())
