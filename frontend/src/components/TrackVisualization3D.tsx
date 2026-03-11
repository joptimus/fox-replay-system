import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  useCurrentFrame,
  useSelectedDriver,
  useSessionMetadata,
  useSectorColors,
  useReplayStore,
  useSelectedSectorId,
  useCameraMode,
} from "../store/replayStore";
import type { SectorId } from "../types";
import { SceneSetup } from "./three/SceneSetup";
import { CameraController } from "./three/CameraController";
import { TrackGeometry, findSectorBoundaryIndices } from "./three/TrackGeometry";
import { SectorInteraction } from "./three/SectorInteraction";
import { DriverMarkers } from "./three/DriverMarkers";
import { WeatherEffects } from "./three/WeatherEffects";
import { LabelManager } from "./three/LabelManager";
import { MapSettingsPanel } from "./MapSettingsPanel";
import { Settings } from "lucide-react";

interface Systems {
  sceneSetup: SceneSetup;
  cameraController: CameraController;
  trackGeometry: TrackGeometry;
  sectorInteraction: SectorInteraction;
  driverMarkers: DriverMarkers;
  weatherEffects: WeatherEffects;
  labelManager: LabelManager;
}

export const TrackVisualization3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const systemsRef = useRef<Systems | null>(null);
  const initRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const hoveredSectorIdRef = useRef<SectorId | null>(null);
  const prevDriverRef = useRef<string | null>(null);

  const currentFrame = useCurrentFrame();
  const selectedDriver = useSelectedDriver();
  const sessionMetadata = useSessionMetadata();
  const { isEnabled: showSectorColors, toggle: toggleSectorColors } = useSectorColors();
  const selectedSectorId = useSelectedSectorId();
  const cameraMode = useCameraMode();
  const { resetCameraView } = useReplayStore();

  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showWeatherPanel, setShowWeatherPanel] = useState(true);
  const [temperatureUnit, setTemperatureUnit] = useState<"C" | "F">("C");
  const [enableWeatherFx, setEnableWeatherFx] = useState(true);

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;

    const container = containerRef.current;
    initRef.current = true;

    const sceneSetup = new SceneSetup(container);
    const cameraController = new CameraController(
      sceneSetup.scene,
      sceneSetup.renderer,
      container
    );
    const trackGeometry = new TrackGeometry(sceneSetup.scene);
    const sectorInteraction = new SectorInteraction(
      sceneSetup.scene,
      cameraController.camera,
      container
    );
    const driverMarkers = new DriverMarkers(sceneSetup.scene);
    const weatherEffects = new WeatherEffects(sceneSetup.scene, sceneSetup.renderer);
    const labelManager = new LabelManager(
      sceneSetup.renderer,
      sceneSetup.scene,
      cameraController.camera,
      container
    );

    systemsRef.current = {
      sceneSetup,
      cameraController,
      trackGeometry,
      sectorInteraction,
      driverMarkers,
      weatherEffects,
      labelManager,
    };

    const handleResize = () => {
      sceneSetup.onResize(container);
      cameraController.onResize();
      labelManager.onResize(container);
    };
    window.addEventListener("resize", handleResize);

    const handlePointerDown = (event: PointerEvent) => {
      const driverCode = driverMarkers.pick(
        event,
        cameraController.camera,
        sceneSetup.renderer.domElement
      );

      if (driverCode) {
        const store = useReplayStore.getState();
        const frame = store.currentFrame;
        const metadata = store.session.metadata;
        if (frame?.drivers?.[driverCode]) {
          const driver = frame.drivers[driverCode];
          const teamColor = metadata?.driver_colors?.[driverCode] || [220, 38, 38];
          store.setSelectedDriver({
            code: driverCode,
            data: driver,
            color: teamColor as [number, number, number],
          });
        }
        return;
      }

      const sectorId = sectorInteraction.onPointerDown(event);
      if (sectorId) {
        useReplayStore.getState().selectSector(sectorId);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const sectorId = sectorInteraction.onPointerMove(event);

      if (sectorId !== hoveredSectorIdRef.current) {
        hoveredSectorIdRef.current = sectorId;
        sectorInteraction.setHighlight(sectorId);

        if (sectorId) {
          const centroid = trackGeometry.getSectorCentroid(sectorId);
          labelManager.showSectorLabel(sectorId, centroid);
        } else {
          labelManager.showSectorLabel(null, new THREE.Vector3());
        }
      }
    };

    sceneSetup.renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    sceneSetup.renderer.domElement.addEventListener("pointermove", handlePointerMove);

    const animate = () => {
      rafIdRef.current = requestAnimationFrame(animate);
      cameraController.update();
      weatherEffects.update();
      sceneSetup.renderer.render(sceneSetup.scene, cameraController.camera);
      labelManager.render();
    };
    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
      sceneSetup.renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      sceneSetup.renderer.domElement.removeEventListener("pointermove", handlePointerMove);

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      initRef.current = false;
      labelManager.dispose();
      weatherEffects.dispose();
      driverMarkers.dispose();
      sectorInteraction.dispose();
      trackGeometry.dispose();
      cameraController.dispose();
      sceneSetup.dispose();
      systemsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const systems = systemsRef.current;
    if (!systems || !sessionMetadata?.track_geometry) return;

    systems.trackGeometry.build(sessionMetadata.track_geometry, showSectorColors);

    const trackCenter = systems.trackGeometry.getTrackCenter();
    const trackBounds = systems.trackGeometry.getTrackBounds();
    systems.cameraController.setInitialView(trackCenter, trackBounds);

    const geo = sessionMetadata.track_geometry;
    if (geo.sector) {
      const boundaries = findSectorBoundaryIndices(geo.sector);
      if (boundaries) {
        systems.sectorInteraction.build(geo, boundaries);
      }
    }
  }, [sessionMetadata?.track_geometry]);

  useEffect(() => {
    const systems = systemsRef.current;
    if (!systems || !currentFrame?.drivers) return;

    systems.driverMarkers.update(
      currentFrame,
      selectedDriver,
      sessionMetadata?.driver_colors
    );

    if (selectedDriver) {
      if (selectedDriver.code !== prevDriverRef.current) {
        const anchor = systems.driverMarkers.getDriverObject(selectedDriver.code);
        systems.labelManager.attachDriverLabel(
          selectedDriver,
          anchor,
          (sessionMetadata as any)?.driver_teams
        );
        prevDriverRef.current = selectedDriver.code;
      } else {
        systems.labelManager.updateDriverLabelContent(selectedDriver);
      }
    } else {
      if (prevDriverRef.current !== null) {
        systems.labelManager.attachDriverLabel(null, null);
        prevDriverRef.current = null;
      }
    }

    systems.weatherEffects.setRainState(currentFrame.weather?.rain_state ?? null);
  }, [currentFrame, selectedDriver, sessionMetadata?.driver_colors]);

  useEffect(() => {
    systemsRef.current?.trackGeometry.setSectorColors(showSectorColors);
  }, [showSectorColors]);

  useEffect(() => {
    const systems = systemsRef.current;
    if (!systems) return;

    if (cameraMode === "sector" && selectedSectorId) {
      const centroid = systems.trackGeometry.getSectorCentroid(selectedSectorId);
      systems.cameraController.flyToTarget(centroid);
    } else if (cameraMode === "overview") {
      systems.cameraController.resetToOverview();
    }
  }, [cameraMode, selectedSectorId]);

  const convertTemperature = (celsius: number): number => {
    return temperatureUnit === "F" ? (celsius * 9) / 5 + 32 : celsius;
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#080810",
      }}
    >
      <button
        onClick={() => setShowSettingsPanel(true)}
        style={{
          position: "absolute",
          top: "10px",
          right: "18px",
          zIndex: 25,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--border-color)",
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-faint)",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as any).style.color = "var(--text-dimmed)";
          (e.currentTarget as any).style.background = "rgba(255,255,255,0.06)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as any).style.color = "var(--text-faint)";
          (e.currentTarget as any).style.background = "rgba(255,255,255,0.04)";
        }}
      >
        <Settings size={16} />
      </button>

      {showWeatherPanel && (
        <div
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            right: "48px",
            zIndex: 20,
            background: "rgba(17, 17, 25, 0.95)",
            borderBottom: "1px solid var(--border-color)",
            padding: "10px 18px",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              display: "flex",
              gap: "20px",
              alignItems: "center",
            }}
          >
            {currentFrame?.weather ? (
              <>
                <div style={{ whiteSpace: "nowrap", display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ color: "var(--text-dimmed)" }}>TRACK:</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {Math.round(convertTemperature(currentFrame.weather.track_temp))}&deg;{temperatureUnit}
                  </span>
                </div>
                <div style={{ whiteSpace: "nowrap", display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ color: "var(--text-dimmed)" }}>AIR:</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {Math.round(convertTemperature(currentFrame.weather.air_temp))}&deg;{temperatureUnit}
                  </span>
                </div>
                <div style={{ whiteSpace: "nowrap", display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ color: "var(--text-dimmed)" }}>WIND:</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {Math.round(currentFrame.weather.wind_speed)} m/s
                  </span>
                </div>
                <div style={{ whiteSpace: "nowrap", display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ color: "var(--text-dimmed)" }}>CONDITIONS:</span>
                  <span
                    style={{
                      color: currentFrame.weather.rain_state === "DRY" ? "var(--cyan)" : "#3b82f6",
                      fontWeight: 600,
                    }}
                  >
                    {currentFrame.weather.rain_state || "DRY"}
                  </span>
                </div>
              </>
            ) : (
              <span style={{ color: "var(--text-faint)", letterSpacing: "0.06em" }}>
                AWAITING CONDITIONS DATA...
              </span>
            )}
          </div>
        </div>
      )}

      {cameraMode === "sector" && (
        <button
          onClick={resetCameraView}
          style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 25,
            background: "rgba(17, 17, 25, 0.9)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            padding: "8px 16px",
            borderRadius: "6px",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.05em",
          }}
        >
          RESET VIEW
        </button>
      )}

      <MapSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        showSectorColors={showSectorColors}
        onToggleSectorColors={toggleSectorColors}
        showWeatherPanel={showWeatherPanel}
        onToggleWeatherPanel={() => setShowWeatherPanel(!showWeatherPanel)}
        temperatureUnit={temperatureUnit}
        onToggleTemperatureUnit={() => setTemperatureUnit(temperatureUnit === "C" ? "F" : "C")}
        enableWeatherFx={enableWeatherFx}
        onToggleWeatherFx={() => setEnableWeatherFx((prev) => !prev)}
      />
    </div>
  );
};

export default TrackVisualization3D;
