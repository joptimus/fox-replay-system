# 3D Visualization Refactor Design

## Goal

Refactor TrackVisualization3D from a 1228-line monolith into a modular system architecture that supports interactive 3D exploration: PerspectiveCamera with constrained OrbitControls, clickable sectors with fly-to, and CSS2DRenderer labels.

## Interaction State Model

### Types

```typescript
type SectorId = 1 | 2 | 3;
```

### Zustand Store Additions

```typescript
// New state
selectedSectorId: SectorId | null;
cameraMode: 'overview' | 'sector';

// New actions
selectSector: (sectorId: SectorId) => void;
clearSectorSelection: () => void;
resetCameraView: () => void;
```

### Action Behavior

- `selectSector(id)` sets `selectedSectorId: id` and `cameraMode: 'sector'`
- `clearSectorSelection()` sets `selectedSectorId: null` and `cameraMode: 'overview'`
- `resetCameraView()` explicitly sets `{ selectedSectorId: null, cameraMode: 'overview' }`

### Invariant

`cameraMode === 'sector'` implies `selectedSectorId !== null`. Actions enforce this; there is no way to set one without the other.

### State Location

| State | Location | Reason |
|---|---|---|
| `selectedSectorId` | Zustand store | Other UI components may react to it |
| `cameraMode` | Zustand store | Technically derived from selectedSectorId for v1, but kept explicit for future modes |
| `hoveredSectorId` | Local `useRef` in SectorInteraction | Rapid-fire visual-only concern, no other component needs it |
| `selectedDriver` | Zustand store (existing) | Already there |

### Independence Rules

- Selecting a sector does not deselect the driver (and vice versa)
- Driver selection does not change camera mode (v1 scope)

## Component Architecture

### File Structure

```
frontend/src/components/three/
  SceneSetup.ts
  CameraController.ts
  TrackGeometry.ts
  SectorInteraction.ts
  DriverMarkers.ts
  WeatherEffects.ts
  LabelManager.ts

frontend/src/components/
  TrackVisualization3D.tsx    (orchestrator, ~150-200 lines)
```

### Design Principles

- Each module is a plain TypeScript class, not a React component
- TrackVisualization3D.tsx is the only React component; it creates instances, routes store changes, runs the animation loop, and calls dispose on unmount
- Each system owns one concern exclusively
- The orchestrator never reaches into a system's internals

### Module Interfaces

```typescript
class SceneSetup {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  constructor(container: HTMLElement);
  onResize(): void;       // renderer.setSize only
  dispose(): void;
}

class CameraController {
  camera: THREE.PerspectiveCamera;
  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, container: HTMLElement);
  flyToTarget(target: THREE.Vector3, distance?: number): void;
  resetToOverview(): void;
  onResize(): void;       // aspect ratio + projection matrix only
  update(): void;         // OrbitControls + active tweens
  dispose(): void;
}

class TrackGeometry {
  trackGroup: THREE.Group;
  constructor(scene: THREE.Scene);
  build(trackData: TrackGeometryData, showSectorColors: boolean): void;
  setSectorColors(enabled: boolean): void;
  getTrackBounds(): THREE.Box3;
  getTrackCenter(): THREE.Vector3;
  getSectorCentroid(sectorId: SectorId): THREE.Vector3;
  getSectorBounds(sectorId: SectorId): THREE.Box3;
  dispose(): void;
}

class SectorInteraction {
  constructor(scene: THREE.Scene, camera: THREE.Camera, container: HTMLElement);
  build(trackData: TrackGeometryData, sectorBoundaries: SectorBoundary): void;
  onPointerMove(event: PointerEvent): SectorId | null;
  onPointerDown(event: PointerEvent): SectorId | null;
  setHighlight(sectorId: SectorId | null): void;
  dispose(): void;
}

class DriverMarkers {
  constructor(scene: THREE.Scene);
  update(frame: FrameData, selectedDriver: SelectedDriver | null): void;
  pick(raycaster: THREE.Raycaster): string | null;
  getDriverObject(code: string): THREE.Object3D | null;
  dispose(): void;
}

class WeatherEffects {
  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer);
  setRainState(state: string | null): void;
  update(): void;
  dispose(): void;
}

class LabelManager {
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera);
  attachDriverLabel(driver: SelectedDriver | null, anchor: THREE.Object3D | null): void;
  showSectorLabel(sectorId: SectorId | null, position: THREE.Vector3): void;
  clearAll(): void;
  render(): void;
  dispose(): void;
}
```

### Ownership Rules

- Only CameraController touches the camera
- Only SectorInteraction raycasts against sectors
- Only DriverMarkers manages car meshes and raycasts against drivers
- Only LabelManager creates/removes labels
- TrackGeometry is the source of truth for spatial data (bounds, centroids)
- Spatial query methods return cached/precomputed values from build()

### Picking Priority

Driver-first, then sector. The orchestrator delegates pointer events in that order.

### Resize Ownership

- SceneSetup: `renderer.setSize()`
- CameraController: aspect ratio + projection matrix update
- Orchestrator calls both from one resize handler

## Camera Defaults and Constraints

### Camera

- Type: PerspectiveCamera
- FOV: 50
- Near: 10
- Far: 200000

### Default Overview

- Target: track center (from TrackGeometry.getTrackCenter())
- Distance: computed from track bounds, full circuit visible with ~10% margin
- Polar angle: ~60° (angled with depth, not flat)
- Azimuth: 0°

### OrbitControls Constraints

| Constraint | Value | Reason |
|---|---|---|
| Min polar angle | 40° | Keep depth, prevent too-overhead views |
| Max polar angle | 82° | Prevent going below ground plane |
| Min distance | 500 | Don't clip into track |
| Max distance | track bounds x 2 | Don't lose the track |
| Pan | disabled | Orbit + zoom + fly-to + reset covers v1 navigation |
| Damping | enabled, factor 0.08 | Smooth deceleration |

### Fly-to Behavior

- Duration: ~1 second, ease-in-out
- Animates both camera position and OrbitControls target
- Maintains current azimuth (doesn't spin the view)
- User input during animation cancels it immediately

### flyToTarget() Internals

Generic API for v1. Room internally for optional angle/duration parameters later without changing the external interface.

## Implementation Order

### Step 1: Refactor into modules + store scaffolding

Extract the 7 systems from TrackVisualization3D.tsx into `frontend/src/components/three/`. Add `SectorId` type, `selectedSectorId`, `cameraMode`, and new actions to Zustand store. Keep behavior close to current but don't force old assumptions (ortho/DOM labels) if they make the new architecture worse. The orchestrator wires systems together.

Test: app renders track and drivers, store actions work.

### Step 2: PerspectiveCamera + OrbitControls

Replace camera with PerspectiveCamera in CameraController. Add constrained OrbitControls (polar 40-82, no pan, damping). Compute default position from track bounds.

Test: can orbit and zoom the track, constraints hold.

### Step 3: Sector hit meshes + interaction

SectorInteraction builds invisible meshes from track data, one per sector. TrackGeometry precomputes and exposes centroids/bounds. Wire pointer events through orchestrator with driver-first priority. Connect to store actions.

Test: clicking a sector highlights it and updates store state.

### Step 4: Fly-to on sector click

CameraController.flyToTarget() with lerped position/target animation. Sector click triggers fly-to centroid. Reset button triggers resetToOverview(). User input cancels animation.

Test: click sector -> smooth camera move, click reset -> smooth return.

### Step 5: CSS2DRenderer labels

LabelManager replaces DOM overlay labels. Driver label anchors to driver mesh object. Sector hover label shown at hover position. Contextual only: selected driver + hovered sector.

Test: labels track correctly through orbit/zoom/fly-to.

### Step 6: Cleanup + polish

Remove old DOM label code, old camera setup, old picking logic. Verify full disposal on unmount. End-to-end interaction loop validation.

Test: full interaction loop works, no resource leaks.

## Not In Scope (v1)

- Driver camera follow (selection + highlight only, no camera movement)
- Preset camera views (broadcast, top, sector)
- Pan navigation
- Sector hover visual highlighting (material change) — hit meshes support it, visual feedback later
- flyToTarget angle/duration options (internal room exists, external API stable)
