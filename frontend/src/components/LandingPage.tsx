import React, { useState, useEffect } from "react";
import { dataService } from "../services/dataService";
import { motion } from "framer-motion";

interface LandingPageProps {
  onSessionSelect: (year: number, round: number) => void;
  isLoading: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSessionSelect,
  isLoading,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [availableRounds, setAvailableRounds] = useState<any[]>([]);
  const years = dataService.getAvailableYears();

  useEffect(() => {
    const rounds = dataService.getRoundsForYear(selectedYear);
    setAvailableRounds(rounds);
    if (rounds.length > 0) {
      setSelectedRound(rounds[0].round);
    }
  }, [selectedYear]);

  const currentRoundData = availableRounds.find(
    (r) => r.round === selectedRound
  );

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
  };

  const handleLoad = () => {
    onSessionSelect(selectedYear, selectedRound);
  };

  return (
    <div className="landing-page-container">
      <div className="landing-page-content">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="landing-header"
        >
          <h1 className="landing-title">F1 RACE REPLAY</h1>
          <p className="landing-subtitle">Select a race to replay</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="landing-selector"
        >
          <div className="selector-group">
            <label className="selector-label">Season</label>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              disabled={isLoading}
              className="selector-input"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="selector-group">
            <label className="selector-label">Grand Prix</label>
            <select
              value={selectedRound}
              onChange={(e) => setSelectedRound(Number(e.target.value))}
              disabled={isLoading}
              className="selector-input"
            >
              {availableRounds.map((roundData) => (
                <option key={roundData.round} value={roundData.round}>
                  R{roundData.round} - {roundData.raceName}
                </option>
              ))}
            </select>
          </div>
        </motion.div>

        {currentRoundData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="landing-details"
          >
            <div className="details-card">
              <div className="details-header">
                <h2 className="details-title">{currentRoundData.raceName}</h2>
              </div>
              <div className="details-info">
                <div className="info-row">
                  <span className="info-label">Round:</span>
                  <span className="info-value">R{currentRoundData.round}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Season:</span>
                  <span className="info-value">{selectedYear}</span>
                </div>
                {currentRoundData.trackName && (
                  <div className="info-row">
                    <span className="info-label">Track:</span>
                    <span className="info-value">{currentRoundData.trackName}</span>
                  </div>
                )}
                {currentRoundData.location && (
                  <div className="info-row">
                    <span className="info-label">Location:</span>
                    <span className="info-value">{currentRoundData.location}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          onClick={handleLoad}
          disabled={isLoading}
          className="landing-button"
        >
          {isLoading ? (
            <>
              <span className="loading-spinner"></span>
              LOADING...
            </>
          ) : (
            "START REPLAY"
          )}
        </motion.button>
      </div>

      <div className="landing-footer">
        <p className="footer-text">
          Use the latest telemetry data to analyze every corner
        </p>
      </div>
    </div>
  );
};

export default LandingPage;
