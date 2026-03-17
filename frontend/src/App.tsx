/**
 * Main App component for FOX Replay System
 */
import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useReplayStore, useSelectedDriver, useSectorColors } from "./store/replayStore";
import { useReplayWebSocket } from "./hooks/useReplayWebSocket";
import { usePlaybackAnimation } from "./hooks/usePlaybackAnimation";
import { LightsBoard, LightsBoardHandle } from "./components/LightsBoard";
import { PlaybackControls } from "./components/PlaybackControls";
import { Leaderboard } from "./components/Leaderboard";
import { SidebarMenu } from "./components/SidebarMenu";
import { LoadingModal } from "./components/LoadingModal";
import { LandingPage } from "./components/LandingPage";
import { VerticalNavMenu } from "./components/VerticalNavMenu";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { motion } from "framer-motion";
import { dataService } from "./services/dataService";
import { preloadDriverImages, preloadTeamLogos, preloadTyreIcons, preloadCommonImages } from "./utils/imagePreloader";
import { getDriverCountryFlagEmoji } from "./utils/countryFlags";

// Lazy-load heavy components
const TrackVisualization3D = lazy(() => import("./components/TrackVisualization3D").then(m => ({ default: m.TrackVisualization3D })));
const TelemetryChart = lazy(() => import("./components/TelemetryChart").then(m => ({ default: m.TelemetryChart })));
const ComparisonPage = lazy(() => import("./components/ComparisonPage").then(m => ({ default: m.ComparisonPage })));
const QualiDashboard = lazy(() => import("./components/QualiDashboard").then(m => ({ default: m.QualiDashboard })));
const FP1Dashboard = lazy(() => import("./components/FP1Dashboard").then(m => ({ default: m.FP1Dashboard })));


const getImageExtension = (year: number): string => {
  if (year >= 2025) return "avif";
  if (year >= 2022) return "png";
  return "jpg";
};

const DriverImage = ({ year, code, ext }: { year: number; code: string; ext: string }) => {
  const [imageError, setImageError] = useState(false);
  const [tryingFallback, setTryingFallback] = useState(false);

  const handleError = () => {
    if (!tryingFallback && ext !== 'png') {
      setTryingFallback(true);
    } else {
      setImageError(true);
    }
  };

  const imageSrc = imageError
    ? '/images/drivers/PLACEHOLDER.png'
    : `/images/drivers/${year}/${code.toUpperCase()}.${tryingFallback ? 'png' : ext}`;

  return (
    <img
      src={imageSrc}
      alt={code}
      onError={handleError}
      className="w-full h-full"
    />
  );
};



const NUMBER_EXTENSIONS = ['avif', 'png', 'webp', 'jpg'];

const DriverNumberImage = ({ year, number }: { year: number; number: string }) => {
  const [extIndex, setExtIndex] = useState(0);

  const handleError = () => {
    setExtIndex((prev) => prev + 1);
  };

  const imageSrc = extIndex < NUMBER_EXTENSIONS.length
    ? `/images/numbers/${year}/${number}.${NUMBER_EXTENSIONS[extIndex]}`
    : '/images/numbers/PLACEHOLDER.png';

  return (
    <img
      src={imageSrc}
      alt={`Driver ${number}`}
      onError={handleError}
      style={{ height: '32px', width: 'auto', maxWidth: '100px', display: 'block', objectFit: 'contain', objectPosition: 'left', marginTop: 'auto' }}
    />
  );
};

const DriverHero = ({ year }: { year?: number }) => {
  const selected = useSelectedDriver();
  const metadata = useReplayStore((state) => state.session?.metadata);

  if (!selected) return (
    <div style={{
      height: '200px',
      minHeight: '200px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border-color)',
      flexShrink: 0,
    }}>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        color: 'var(--text-faint)',
        letterSpacing: '0.08em',
      }}>NO DRIVER SELECTED</p>
    </div>
  );

  const { code, color } = selected;
  const teamColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  const displayYear = year || 2025;
  const driver = year ? dataService.getDriverByCode(year, code) : null;
  const driverNum = driver?.CarNumber || metadata?.driver_numbers?.[code] || "0";
  const fullName = year ? dataService.getDriverFullName(year, code) : code;
  const nameParts = fullName.split(' ');
  const lastName = nameParts[nameParts.length - 1] || code;
  const firstName = nameParts.slice(0, -1).join(' ') || code;
  const countryFlag = driver?.Country ? getDriverCountryFlagEmoji(driver.Country) : '';
  const driverImgExt = getImageExtension(displayYear);

  // Calculate accessible color (darker version) — same as original
  const accessibleColor = `rgb(${Math.max(0, color[0] - 80)}, ${Math.max(0, color[1] - 80)}, ${Math.max(0, color[2] - 80)})`;

  return (
    <motion.div
      key={code}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="f1-driver-card"
      style={{
        '--f1-team-colour': teamColor,
        '--f1-accessible-colour': accessibleColor,
      } as any}
    >
      {/* Team color accent strip at top */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: `linear-gradient(to right, ${teamColor}, transparent)`,
        zIndex: 15,
      }} />

      {/* 1. BACKGROUND LAYERS — unchanged from original */}
      <div className="f1-card-pattern-container">
        <div className="f1-card-pattern" />
      </div>
      <div className="f1-card-gradient" />

      {/* 2. TEXT CONTENT */}
      <div className="f1-card-info">
        <p className="f1-first-name">{firstName}</p>
        <p className="f1-last-name">{lastName}</p>

        {/* Code + flag badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          fontWeight: 700,
          color: teamColor,
          background: `${teamColor}15`,
          padding: '3px 8px',
          borderRadius: '4px',
          width: 'fit-content',
        }}>
          {code} {countryFlag}
        </div>

        {/* Driver number image at bottom-left */}
        <DriverNumberImage year={displayYear} number={driverNum} />
      </div>

      {/* 3. PHOTO CONTENT — unchanged from original */}
      <div className="f1-card-photo-wrapper">
        <div className="f1-card-photo-inner">
          <DriverImage year={displayYear} code={code} ext={driverImgExt} />
        </div>
      </div>
    </motion.div>
  );
};

const ReplayView = ({ onSessionSelect, onRefreshData }: { onSessionSelect: (year: number, round: number, sessionType: string, refresh?: boolean) => void; onRefreshData: () => void }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasPlayedLights, setHasPlayedLights] = useState(false);
  const lightsBoardRef = useRef<LightsBoardHandle>(null);
  const { session, setTotalFrames, play } = useReplayStore();
  const { isConnected } = useReplayWebSocket(session.sessionId);
  const { isEnabled: showSectorColors, toggle: toggleSectorColors } = useSectorColors();

  // Animate playback - advances frameIndex during playback
  usePlaybackAnimation();

  const handlePlayWithLights = useCallback(() => {
    console.log('handlePlayWithLights called, hasPlayedLights:', hasPlayedLights, 'ref:', lightsBoardRef.current);
    if (!hasPlayedLights) {
      console.log('Showing lights board');
      setHasPlayedLights(true);
      lightsBoardRef.current?.startSequence();
    } else {
      console.log('Skipping lights board, already played');
      play();
    }
  }, [hasPlayedLights, play]);

  const handleLightsSequenceComplete = useCallback(() => {
    play();
  }, [play]);

  useEffect(() => {
    if (session.metadata?.total_frames) {
      setTotalFrames(session.metadata.total_frames);
    }
    setHasPlayedLights(false);
  }, [session.metadata?.total_frames, session.sessionId, setTotalFrames]);

  const year = session.metadata?.year;
  const round = session.metadata?.round;
  const sessionType = session.metadata?.session_type;
  const raceName = year && round
    ? `${year} ${dataService.getRaceName(year, round).toUpperCase()}`
    : 'FOX REPLAY';
  const trackName = year && round ? dataService.getTrackName(year, round) : '';
  const location = year && round ? dataService.getLocation(year, round) : '';

  const isQualifying = sessionType === 'Q' || sessionType === 'SQ';
  const isPractice = sessionType === 'FP1' || sessionType === 'FP2' || sessionType === 'FP3';

  if (isQualifying) {
    return (
      <>
        <ErrorBoundary>
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-page)', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)' }}>LOADING QUALIFYING...</div>}>
            <QualiDashboard onMenuOpen={() => setMenuOpen(true)} />
          </Suspense>
        </ErrorBoundary>
        <SidebarMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          currentYear={year}
          currentRound={round}
          currentSessionType={sessionType}
          onSessionSelect={onSessionSelect}
          onRefreshData={onRefreshData}
          showSectorColors={showSectorColors}
          onToggleSectorColors={toggleSectorColors}
        />
      </>
    );
  }

  if (isPractice) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <VerticalNavMenu />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ErrorBoundary>
            <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)' }}>LOADING PRACTICE...</div>}>
              <FP1Dashboard />
            </Suspense>
          </ErrorBoundary>
        </div>
        <SidebarMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          currentYear={year}
          currentRound={round}
          currentSessionType={sessionType}
          onSessionSelect={onSessionSelect}
          onRefreshData={onRefreshData}
          showSectorColors={showSectorColors}
          onToggleSectorColors={toggleSectorColors}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-page)' }}>
      <LightsBoard ref={lightsBoardRef} onSequenceComplete={handleLightsSequenceComplete} />
      <VerticalNavMenu />

      {/* Main 3-column content area (standings | track | telemetry) with top bar */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '280px 1fr 320px',
        gridTemplateRows: '48px 1fr',
        overflow: 'hidden',
      }}>
        {/* Top Bar */}
        <header style={{
          gridColumn: '1 / -1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 16px',
          height: '48px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setMenuOpen(true)}
              style={{
                width: '48px',
                height: '48px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dimmed)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                transition: 'color 0.15s',
              }}
              title="Menu"
              onMouseEnter={(e) => { (e.currentTarget as any).style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as any).style.color = 'var(--text-dimmed)'; }}
            >
              &#9776;
            </button>
            <span className="replay-badge">REPLAY</span>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '0.02em',
                margin: 0,
              }}>{raceName}</h1>
              {trackName && (
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-dimmed)',
                  margin: 0,
                  marginTop: '1px',
                }}>{trackName}</p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            {location && (
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-dimmed)',
              }}>{location}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-faint)',
              }}>STATUS:</span>
              {isConnected ? (
                <span className="status-badge-live">LIVE</span>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--accent-red)',
                }}>OFFLINE</span>
              )}
            </div>
          </div>
        </header>

        {/* Standings Panel */}
        <aside style={{
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border-color)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <div className="sidebar-scroll">
            {isPractice ? (
              <FP1Dashboard />
            ) : (
              <Leaderboard />
            )}
          </div>
        </aside>

        {/* Center Track Area */}
        <main style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#0a0a10',
          minHeight: 0,
        }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <ErrorBoundary>
              <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)' }}>LOADING TRACK...</div>}>
                <TrackVisualization3D />
              </Suspense>
            </ErrorBoundary>
          </div>
          <PlaybackControls onPlayWithLights={handlePlayWithLights} />
        </main>

        {/* Driver Telemetry Panel */}
        <aside style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border-color)',
          minHeight: 0,
        }}>
          <DriverHero year={year} />
          <div style={{
            flex: 1,
            overflow: 'auto',
            minHeight: 0,
          }}>
            <ErrorBoundary>
              <Suspense fallback={<div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)', padding: '18px' }}>LOADING TELEMETRY...</div>}>
                <TelemetryChart />
              </Suspense>
            </ErrorBoundary>
          </div>
        </aside>

        <SidebarMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          currentYear={year}
          currentRound={round}
          currentSessionType={sessionType}
          onSessionSelect={onSessionSelect}
          onRefreshData={onRefreshData}
          showSectorColors={showSectorColors}
          onToggleSectorColors={toggleSectorColors}
        />
      </div>
    </div>
  );
};

function AppRoutes() {
  const navigate = useNavigate();
  const { session, setSession, setSessionLoading, pause } = useReplayStore();

  useEffect(() => {
    const handleSessionTypeChangeEvent = (event: any) => {
      const { sessionType, year, round } = event.detail;
      handleSessionTypeChange(year, round, sessionType);
    };

    window.addEventListener('sessionTypeChange', handleSessionTypeChangeEvent);
    return () => window.removeEventListener('sessionTypeChange', handleSessionTypeChangeEvent);
  }, []);

  const loadSession = async (year: number, round: number, sessionType: string, refresh: boolean, shouldNavigate: boolean) => {
    try {
      if (session.sessionId) {
        pause();
      }

      setSessionLoading(true);

      const store = useReplayStore.getState();
      store.setLoadingProgress(0);
      store.setLoadingError(null);
      store.setLoadingComplete(false);

      const drivers = dataService.getAllDriversForYear(year);
      const driverCodes = drivers.map(d => d.Code);

      Promise.all([
        preloadDriverImages(driverCodes, year),
        preloadTeamLogos(),
        preloadTyreIcons(),
        preloadCommonImages(),
      ]).catch(err => console.warn("Image preloading failed:", err));

      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, round, session_type: sessionType, refresh })
      });
      const data = await response.json();

      setSession(data.session_id, {
        year,
        round,
        session_type: sessionType,
      } as any);
      setSessionLoading(true);
      if (shouldNavigate) navigate("/replay");
    } catch (err) {
      console.error("Failed to load session:", err);
      setSessionLoading(false);
    }
  };

  const handleSessionSelect = (year: number, round: number, sessionType: string = "R", refresh: boolean = false) => {
    loadSession(year, round, sessionType, refresh, true);
  };

  const handleRefreshData = async () => {
    try {
      await fetch("/api/sessions/cache", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to clear cache:", err);
    }

    if (session.metadata?.year && session.metadata?.round) {
      handleSessionSelect(session.metadata.year, session.metadata.round, session.metadata.session_type || "R", true);
    }
  };

  const handleSessionTypeChange = (year: number, round: number, sessionType: string) => {
    loadSession(year, round, sessionType, false, false);
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage onSessionSelect={handleSessionSelect} isLoading={session.isLoading} />} />
      <Route
        path="/replay"
        element={session.sessionId ? <ReplayView onSessionSelect={handleSessionSelect} onRefreshData={handleRefreshData} /> : <Navigate to="/" replace />}
      />
      <Route path="/comparison" element={<ErrorBoundary><Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-faint)' }}>LOADING COMPARISON...</div>}><ComparisonPage /></Suspense></ErrorBoundary>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const { session } = useReplayStore();

  return (
    <BrowserRouter>
      <AppRoutes />
      <LoadingModal
        isOpen={session.isLoading}
        sessionId={session.sessionId}
        year={session.metadata?.year}
        round={session.metadata?.round}
      />
    </BrowserRouter>
  );
}

export default App;
