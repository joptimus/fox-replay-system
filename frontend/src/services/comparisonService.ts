import { DriverLapTelemetry, SectorTime } from "../types";

export const comparisonService = {
  async fetchLapTelemetry(
    year: number,
    round: number,
    sessionType: string,
    driverCodes: string[],
    lapNumbers: number[]
  ): Promise<DriverLapTelemetry[]> {
    const response = await fetch("/api/telemetry/laps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        round_num: round,
        session_type: sessionType,
        driver_codes: driverCodes,
        lap_numbers: lapNumbers,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Failed to fetch lap telemetry (HTTP ${response.status})${errorBody ? `: ${errorBody}` : ""}`
      );
    }

    const data = await response.json();
    return data.laps;
  },

  async fetchSectorTimes(
    year: number,
    round: number,
    sessionType: string,
    driverCodes: string[],
    lapNumbers: number[]
  ): Promise<SectorTime[]> {
    const response = await fetch("/api/telemetry/sectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        round_num: round,
        session_type: sessionType,
        driver_codes: driverCodes,
        lap_numbers: lapNumbers,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Failed to fetch sector times (HTTP ${response.status})${errorBody ? `: ${errorBody}` : ""}`
      );
    }

    const data = await response.json();
    return data.sectors;
  },
};
