# FastF1 API Tester

Quick tool to test FastF1 functionality directly without running the full application.

## Usage

### Web Interface (Recommended)

1. **Start the backend:**
   ```bash
   python backend/main.py
   ```

2. **Open the tester:**
   Navigate to: `http://localhost:8000/debug/fastf1-tester`

3. **Select test parameters:**
   - Year (e.g., 2026)
   - Round (1-24)
   - Session Type (Race, Qualifying, Sprint, etc.)
   - Driver Code (optional, for telemetry testing)

4. **Choose a test method:**
   - **Load Session** - Verify session exists on FastF1
   - **Get Laps** - Check lap data availability
   - **Get Drivers** - View driver information
   - **Get Telemetry** - Extract driver telemetry (requires driver code)
   - **Get Weather** - Check weather data

5. **Run Test** - Results show in both summary and full JSON format

### Command Line (via cURL)

**Test if 2026 R1 Qualifying exists:**
```bash
curl "http://localhost:8000/api/debug/fastf1-test?year=2026&round_num=1&session_type=Q&method=load_session"
```

**Get laps for 2026 R1 Race:**
```bash
curl "http://localhost:8000/api/debug/fastf1-test?year=2026&round_num=1&session_type=R&method=laps"
```

**Get telemetry for VER at 2026 R1 Race:**
```bash
curl "http://localhost:8000/api/debug/fastf1-test?year=2026&round_num=1&session_type=R&method=telemetry&driver_code=VER"
```

## Test Methods

### `load_session`
Loads a FastF1 session to verify it exists.

**Returns:**
- Session name
- Session type
- Event date
- Event name

**Use for:** Checking if data is available before full processing

### `laps`
Gets laps information from the session.

**Returns:**
- Number of laps
- Lap data columns
- Sample of first 3 laps
- Number of drivers

**Use for:** Verifying telemetry data structure

### `drivers`
Gets driver information from the session.

**Returns:**
- Total driver count
- List of driver numbers
- Sample driver details (name, team, number, etc.)

**Use for:** Verifying driver data availability

### `telemetry`
Extracts detailed telemetry for a specific driver.

**Parameters:**
- `driver_code` (optional) - Driver code (e.g., "VER", "HAM")
- If not provided, uses first driver in session

**Returns:**
- Driver code
- Lap number tested
- Number of telemetry points
- Telemetry columns (Speed, Throttle, Brake, etc.)
- Sample telemetry data
- Lap time

**Use for:** Debugging telemetry extraction issues

### `weather`
Gets weather data from the session.

**Returns:**
- Weather data as time-indexed DataFrame
- Available weather columns

**Use for:** Checking weather data availability

## Troubleshooting 2026 R1 Qualifying

If qualifying fails to load:

1. **Test load_session first:**
   - If this fails, FastF1 doesn't have the data yet
   - Session may not have happened yet, or FastF1 cache is stale

2. **Check for data structure issues:**
   - Run `laps` method to see if laps exist
   - Run `drivers` to verify driver data

3. **Look at error messages:**
   - JSON response includes full traceback
   - Check if it's a FastF1 API error or data structure issue

4. **Check FastF1 cache:**
   ```bash
   rm -rf .fastf1-cache/
   # Then re-run tests - will re-download from API
   ```

## API Response Format

All responses follow this format:

```json
{
  "year": 2026,
  "round": 1,
  "session_type": "Q",
  "method": "load_session",
  "result": {
    "success": true,
    "message": "...",
    "data": {}
  }
}
```

If `success` is `false`:
```json
{
  "result": {
    "success": false,
    "error": "Error message",
    "traceback": "Full Python traceback"
  }
}
```

## Performance Notes

- First run for a year may take time (FastF1 API calls)
- Subsequent runs use cached data
- Telemetry extraction is the slowest operation
- Weather data is usually very fast
