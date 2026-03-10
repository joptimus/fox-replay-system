import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Gauge, BarChart3, Home } from "lucide-react";
import { useReplayStore } from "../store/replayStore";

export const VerticalNavMenu: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useReplayStore((state) => state.session);

  const navItems = [
    { icon: Home, path: "/", tooltip: "Home" },
    { icon: Gauge, path: "/replay", tooltip: "Race Replay" },
    { icon: BarChart3, path: "/comparison", tooltip: "Telemetry Analysis" },
  ];

  const sessionButtons = [
    { label: "FP1", sessionType: "FP1", tooltip: "Free Practice 1" },
    { label: "FP2", sessionType: "FP2", tooltip: "Free Practice 2" },
    { label: "FP3", sessionType: "FP3", tooltip: "Free Practice 3" },
    { label: "QUALI", sessionType: "Q", tooltip: "Qualifying" },
    { label: "SPRINT", sessionType: "S", tooltip: "Sprint Race" },
    { label: "RACE", sessionType: "R", tooltip: "Grand Prix" },
  ];

  const isActivePath = (path: string) => location.pathname === path;
  const currentSessionType = session.metadata?.session_type;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 5px',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-color)',
        width: '48px',
        minWidth: '48px',
        height: '100%',
        alignItems: 'center',
        overflowY: 'auto',
      }}
    >
      {/* Navigation Items */}
      {navItems.map(({ icon: Icon, path, tooltip }) => {
        const active = isActivePath(path);
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            title={tooltip}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              border: 'none',
              background: active ? 'rgba(39, 244, 210, 0.08)' : 'transparent',
              color: active ? 'var(--cyan)' : 'var(--text-faint)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              padding: 0,
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as any).style.color = 'var(--text-dimmed)';
                (e.currentTarget as any).style.background = 'rgba(255,255,255,0.03)';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                (e.currentTarget as any).style.color = 'var(--text-faint)';
                (e.currentTarget as any).style.background = 'transparent';
              }
            }}
          >
            <Icon size={20} />
          </button>
        );
      })}

      {/* Separator */}
      <div
        style={{
          width: '24px',
          height: '1px',
          background: 'var(--border-color)',
          margin: '8px 0',
          flexShrink: 0,
        }}
      />

      {/* Session Type Buttons */}
      {sessionButtons.map(({ label, sessionType, tooltip }) => {
        const isActive = currentSessionType === sessionType;
        return (
          <button
            key={sessionType}
            onClick={() => {
              if (session.metadata?.year && session.metadata?.round) {
                window.dispatchEvent(new CustomEvent('sessionTypeChange', {
                  detail: { sessionType, year: session.metadata.year, round: session.metadata.round }
                }));
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '32px',
              borderRadius: '6px',
              border: 'none',
              borderLeft: isActive ? '2px solid var(--accent-red)' : '2px solid transparent',
              background: isActive ? 'rgba(230, 57, 70, 0.07)' : 'transparent',
              color: isActive ? 'var(--accent-red)' : 'var(--text-faint)',
              fontSize: '10px',
              fontWeight: 400,
              cursor: isActive ? 'default' : 'pointer',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.03em',
              padding: 0,
              transition: 'all 0.15s',
              opacity: session.metadata ? 1 : 0.4,
              pointerEvents: session.metadata ? 'auto' : 'none',
            }}
            title={tooltip}
            disabled={!session.metadata}
            onMouseEnter={(e) => {
              if (!isActive && session.metadata) {
                (e.currentTarget as any).style.color = 'var(--accent-red)';
                (e.currentTarget as any).style.background = 'rgba(230, 57, 70, 0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as any).style.color = 'var(--text-faint)';
                (e.currentTarget as any).style.background = 'transparent';
              }
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
