import React from "react";
import { useComparisonStore } from "../../store/comparisonStore";

interface SectorStatus {
  isFastest: boolean;
  isPersonalBest: boolean;
  isSlower: boolean;
}

export const SectorTimesTable: React.FC = () => {
  const { sectorTimes, selectedDrivers } = useComparisonStore();

  if (sectorTimes.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p className="f1-monospace" style={{ color: '#6b7280' }}>No sector data loaded</p>
      </div>
    );
  }

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "-";
    return seconds.toFixed(3) + "s";
  };

  const fastestS1 = Math.min(...sectorTimes.filter(s => s.sector_1 !== null).map(s => s.sector_1!));
  const fastestS2 = Math.min(...sectorTimes.filter(s => s.sector_2 !== null).map(s => s.sector_2!));
  const fastestS3 = Math.min(...sectorTimes.filter(s => s.sector_3 !== null).map(s => s.sector_3!));
  const fastestLap = Math.min(...sectorTimes.filter(s => s.lap_time !== null).map(s => s.lap_time!));

  // Get each driver's best times for their personal best comparison
  const getDriverBestTimes = (driverCode: string) => {
    const driverSectors = sectorTimes.filter(s => s.driver_code === driverCode);
    return {
      s1: Math.min(...driverSectors.filter(s => s.sector_1 !== null).map(s => s.sector_1!)) || Infinity,
      s2: Math.min(...driverSectors.filter(s => s.sector_2 !== null).map(s => s.sector_2!)) || Infinity,
      s3: Math.min(...driverSectors.filter(s => s.sector_3 !== null).map(s => s.sector_3!)) || Infinity,
    };
  };

  const getSectorStatus = (value: number | null, fastest: number, driverBest: number): SectorStatus => {
    if (value === null) return { isFastest: false, isPersonalBest: false, isSlower: false };
    const epsilon = 0.0001;
    return {
      isFastest: Math.abs(value - fastest) < epsilon,
      isPersonalBest: !Math.abs(value - fastest) < epsilon && Math.abs(value - driverBest) < epsilon,
      isSlower: value > driverBest + epsilon,
    };
  };

  const SectorCell = ({ value, fastest, driverBest }: { value: number | null; fastest: number; driverBest: number }) => {
    const status = getSectorStatus(value, fastest, driverBest);

    let barColor = '#6b7280'; // default gray
    let borderColor = '#374151';

    if (status.isFastest) {
      barColor = '#a855f7'; // purple
      borderColor = '#a855f7';
    } else if (status.isPersonalBest) {
      barColor = '#22c55e'; // green
      borderColor = '#22c55e';
    } else if (status.isSlower) {
      barColor = '#eab308'; // yellow
      borderColor = '#eab308';
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <div
          className="f1-monospace"
          style={{
            padding: '8px 12px',
            border: `2px solid ${borderColor}`,
            borderRadius: '4px',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            fontWeight: status.isFastest || status.isPersonalBest ? 700 : 400,
            color: status.isFastest || status.isPersonalBest ? borderColor : 'inherit',
            minWidth: '70px',
            textAlign: 'right',
          }}
        >
          {formatTime(value)}
        </div>
        <div
          style={{
            height: '4px',
            width: '70px',
            backgroundColor: barColor,
            borderRadius: '2px',
            opacity: 0.8,
          }}
        />
      </div>
    );
  };

  return (
    <div>
      <h4 className="f1-monospace" style={{ color: '#e10600', fontWeight: 700, marginBottom: '16px' }}>
        SECTOR TIMES
      </h4>

      {/* Legend */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#a855f7', borderRadius: '2px' }} />
          <span className="f1-monospace" style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>Fastest</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#22c55e', borderRadius: '2px' }} />
          <span className="f1-monospace" style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>Personal Best</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#eab308', borderRadius: '2px' }} />
          <span className="f1-monospace" style={{ fontSize: '0.85rem', color: '#9CA3AF' }}>Below PB</span>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #374151' }}>
            <th className="f1-monospace" style={{ padding: '12px', textAlign: 'left', color: '#9CA3AF' }}>DRIVER</th>
            <th className="f1-monospace" style={{ padding: '12px', textAlign: 'center', color: '#9CA3AF' }}>LAP</th>
            <th className="f1-monospace" style={{ padding: '12px', textAlign: 'right', color: '#9CA3AF' }}>S1</th>
            <th className="f1-monospace" style={{ padding: '12px', textAlign: 'right', color: '#9CA3AF' }}>S2</th>
            <th className="f1-monospace" style={{ padding: '12px', textAlign: 'right', color: '#9CA3AF' }}>S3</th>
            <th className="f1-monospace" style={{ padding: '12px', textAlign: 'right', color: '#9CA3AF' }}>LAP TIME</th>
          </tr>
        </thead>
        <tbody>
          {sectorTimes.map((sector, idx) => {
            const driver = selectedDrivers.find(d => d.code === sector.driver_code);
            const color = driver ? `rgb(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]})` : '#fff';
            const driverBests = getDriverBestTimes(sector.driver_code);

            return (
              <tr key={idx} style={{ borderBottom: '1px solid #374151', verticalAlign: 'top' }}>
                <td style={{ padding: '12px', borderLeft: `4px solid ${color}` }}>
                  <span className="f1-monospace" style={{ fontWeight: 700 }}>{sector.driver_code}</span>
                </td>
                <td className="f1-monospace" style={{ padding: '12px', textAlign: 'center' }}>
                  {sector.lap_number}
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  <SectorCell value={sector.sector_1} fastest={fastestS1} driverBest={driverBests.s1} />
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  <SectorCell value={sector.sector_2} fastest={fastestS2} driverBest={driverBests.s2} />
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  <SectorCell value={sector.sector_3} fastest={fastestS3} driverBest={driverBests.s3} />
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div
                      className="f1-monospace"
                      style={{
                        padding: '8px 12px',
                        border: sector.lap_time === fastestLap ? '2px solid #22c55e' : '2px solid #374151',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        fontWeight: sector.lap_time === fastestLap ? 700 : 400,
                        color: sector.lap_time === fastestLap ? '#22c55e' : 'inherit',
                        minWidth: '70px',
                        textAlign: 'right',
                      }}
                    >
                      {formatTime(sector.lap_time)}
                    </div>
                    <div
                      style={{
                        height: '4px',
                        width: '70px',
                        backgroundColor: sector.lap_time === fastestLap ? '#22c55e' : '#6b7280',
                        borderRadius: '2px',
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
