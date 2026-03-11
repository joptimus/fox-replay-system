# 3D Visualization Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the 1228-line TrackVisualization3D monolith into 7 modular systems, swap to PerspectiveCamera with constrained OrbitControls, add clickable sector hit meshes with fly-to, and switch labels to CSS2DRenderer.

**Architecture:** Class-based systems (not React components) orchestrated by a thin React component. Each system owns one concern exclusively. TrackGeometry is the spatial data source of truth. CameraController owns all camera motion. Picking priority: driver-first, then sector.

**Tech Stack:** Three.js 0.182 (already installed), OrbitControls + CSS2DRenderer from `three/examples/jsm/` (already available), Zustand for state, TypeScript.

**Design Doc:** `docs/plans/2026-03-10-3d-visualization-refactor-design.md`

---

## Task 1: Store Scaffolding — SectorId Type + New State

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/replayStore.ts`

**Step 1: Add SectorId type to types/index.ts**

Add at the end of the file, before the closing exports:

```typescript
export type SectorId = 1 | 2 | 3;
```

**Step 2: Add sector/camera state and actions to replayStore.ts**

Add to the `ReplayStore` interface:

```typescript
selectedSectorId: SectorId | null;
cameraMode: 'overview' | 'sector';
selectSector: (sectorId: SectorId) => void;
clearSectorSelection: () => void;
resetCameraView: () => void;
```

Add to the store implementation:

```typescript
selectedSectorId: null,
cameraMode: 'overview' as const,

selectSector: (sectorId: SectorId) =>
  set({ selectedSectorId: sectorId, cameraMode: 'sector' as const }),

clearSectorSelection: () =>
  set({ selectedSectorId: null, cameraMode: 'overview' as const }),

resetCameraView: () =>
  set({ selectedSectorId: null, cameraMode: 'overview' as const }),
```

Add selectors at the bottom:

```typescript
export const useSelectedSectorId = () =>
  useReplayStore((state) => state.selectedSectorId);

export const useCameraMode = () =>
  useReplayStore((state) => state.cameraMode);
```

Import `SectorId` from `../types` at the top of replayStore.ts.

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors related to new state.

**Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/store/replayStore.ts
git commit -m "feat: add SectorId type and sector/camera state to store"
```

---

## Task 2: SceneSetup Module

**Files:**
- Create: `frontend/src/components/three/SceneSetup.ts`

**Step 1: Create the three/ directory**

```bash
mkdir -p frontend/src/components/three
```

**Step 2: Write SceneSetup.ts**

Extract scene, renderer, and lighting setup from TrackVisualization3D.tsx lines 120-165, 172-188.

```typescript
import * as THREE from "three";

export class SceneSetup {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080810);
    this.scene.fog = new THREE.FogExp2(0x080810, 0.000018);

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x080810, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.zIndex = "1";
    container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x252535, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight.position.set(10, 20, 10);
    this.scene.add(directionalLight);

    const redFill = new THREE.PointLight(0xe63946, 0.15, 30000);
    redFill.position.set(-8000, 2000, -5000);
    this.scene.add(redFill);

    const blueFill = new THREE.PointLight(0x3671c6, 0.1, 30000);
    blueFill.position.set(8000, 2000, 5000);
    this.scene.add(blueFill);
  }

  onResize(container: HTMLElement): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.renderer.setSize(width, height);
  }

  dispose(): void {
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add frontend/src/components/three/SceneSetup.ts
git commit -m "feat: extract SceneSetup module from TrackVisualization3D"
```

---

## Task 3: CameraController Module

**Files:**
- Create: `frontend/src/components/three/CameraController.ts`

**Step 1: Write CameraController.ts**

PerspectiveCamera with constrained OrbitControls. Generic `flyToTarget()` with lerped animation. User input cancels animation.

```typescript
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export class CameraController {
  camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;
  private defaultPosition = new THREE.Vector3();
  private defaultTarget = new THREE.Vector3();
  private defaultDistance = 0;

  private animating = false;
  private animStartTime = 0;
  private animDuration = 1000;
  private animStartPos = new THREE.Vector3();
  private animEndPos = new THREE.Vector3();
  private animStartTarget = new THREE.Vector3();
  private animEndTarget = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    container: HTMLElement
  ) {
    this.container = container;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 10, 200000);
    this.camera.position.set(0, 5000, 0);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(40);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
    this.controls.minDistance = 500;
    this.controls.maxDistance = 50000;

    this.controls.addEventListener("start", () => {
      if (this.animating) {
        this.animating = false;
      }
    });
  }

  setInitialView(trackCenter: THREE.Vector3, trackBounds: THREE.Box3): void {
    const size = new THREE.Vector3();
    trackBounds.getSize(size);
    const maxDim = Math.max(size.x, size.z);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.1;

    const polarAngle = THREE.MathUtils.degToRad(60);
    const offsetY = distance * Math.cos(polarAngle);
    const offsetZ = distance * Math.sin(polarAngle);

    this.camera.position.set(
      trackCenter.x,
      trackCenter.y + offsetY,
      trackCenter.z + offsetZ
    );
    this.controls.target.copy(trackCenter);
    this.controls.maxDistance = distance * 2;

    this.defaultPosition.copy(this.camera.position);
    this.defaultTarget.copy(trackCenter);
    this.defaultDistance = distance;

    this.controls.update();
  }

  flyToTarget(target: THREE.Vector3, distance?: number): void {
    const flyDistance = distance ?? this.defaultDistance * 0.4;

    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();

    this.animStartPos.copy(this.camera.position);
    this.animEndPos.copy(target).addScaledVector(direction, flyDistance);
    this.animStartTarget.copy(this.controls.target);
    this.animEndTarget.copy(target);

    this.animStartTime = performance.now();
    this.animating = true;
  }

  resetToOverview(): void {
    this.animStartPos.copy(this.camera.position);
    this.animEndPos.copy(this.defaultPosition);
    this.animStartTarget.copy(this.controls.target);
    this.animEndTarget.copy(this.defaultTarget);

    this.animStartTime = performance.now();
    this.animating = true;
  }

  onResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    if (this.animating) {
      const elapsed = performance.now() - this.animStartTime;
      let t = Math.min(elapsed / this.animDuration, 1);
      t = t * t * (3 - 2 * t); // smoothstep ease-in-out

      this.camera.position.lerpVectors(this.animStartPos, this.animEndPos, t);
      this.controls.target.lerpVectors(
        this.animStartTarget,
        this.animEndTarget,
        t
      );

      if (t >= 1) {
        this.animating = false;
      }
    }

    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/three/CameraController.ts
git commit -m "feat: add CameraController with PerspectiveCamera and OrbitControls"
```

---

## Task 4: TrackGeometry Module

**Files:**
- Create: `frontend/src/components/three/TrackGeometry.ts`

**Step 1: Write TrackGeometry.ts**

Extract track mesh, boundaries, centerline, ground, grid from TrackVisualization3D.tsx lines 402-813. Precompute and cache spatial data (bounds, centroids). Export `SectorBoundary` interface.

```typescript
import * as THREE from "three";
import type { TrackGeometry as TrackGeometryData } from "../../types";
import type { SectorId } from "../../types";

export interface SectorBoundaryIndices {
  s1: number;
  s2: number;
}

export class TrackGeometry {
  trackGroup: THREE.Group;
  private trackMesh: THREE.Mesh | null = null;
  private sectorColorsArray: Float32Array | null = null;

  private cachedBounds: THREE.Box3 | null = null;
  private cachedCenter: THREE.Vector3 | null = null;
  private cachedSectorCentroids: Map<SectorId, THREE.Vector3> = new Map();
  private cachedSectorBounds: Map<SectorId, THREE.Box3> = new Map();
  private sectorBoundaryIndices: SectorBoundaryIndices | null = null;

  constructor(private scene: THREE.Scene) {
    this.trackGroup = new THREE.Group();
  }

  build(trackData: TrackGeometryData, showSectorColors: boolean): void {
    this.disposeGeometry();

    if (
      !trackData.centerline_x?.length ||
      !trackData.outer_x?.length ||
      !trackData.inner_x?.length
    ) {
      return;
    }

    this.buildTrackSurface(trackData, showSectorColors);
    this.buildTrackEdges(trackData);
    this.buildCenterline(trackData);
    this.buildGround();
    this.buildSectorBoundaryLines(trackData);
    this.precomputeSpatialData(trackData);

    this.scene.add(this.trackGroup);
  }

  private buildTrackSurface(
    trackData: TrackGeometryData,
    showSectorColors: boolean
  ): void {
    const geom = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];

    const numPoints = Math.min(
      trackData.inner_x.length,
      trackData.outer_x.length
    );

    const roadBase = { r: 0.067, g: 0.067, b: 0.094 };
    const sectorTints: Record<number, { r: number; g: number; b: number }> = {
      1: { r: 0.102, g: 0.541, b: 0.541 },
      2: { r: 0.541, g: 0.239, b: 0.431 },
      3: { r: 0.541, g: 0.478, b: 0.18 },
    };
    const tintStrength = 0.07;

    for (let i = 0; i < numPoints; i++) {
      positions.push(trackData.inner_x[i], 0, trackData.inner_y[i]);
      positions.push(trackData.outer_x[i], 0, trackData.outer_y[i]);

      let tint = sectorTints[3];
      if (trackData.sector && trackData.sector[i]) {
        tint = sectorTints[trackData.sector[i]] || sectorTints[3];
      }

      const r = roadBase.r * (1 - tintStrength) + tint.r * tintStrength;
      const g = roadBase.g * (1 - tintStrength) + tint.g * tintStrength;
      const b = roadBase.b * (1 - tintStrength) + tint.b * tintStrength;
      colors.push(r, g, b, r, g, b);
    }

    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3)
    );
    geom.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(colors), 3)
    );

    const indices: number[] = [];
    for (let i = 0; i < numPoints - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = (i + 1) * 2;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geom.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.75,
      metalness: 0.2,
    });

    this.trackMesh = new THREE.Mesh(geom, material);
    this.trackMesh.position.z = -1;
    this.trackGroup.add(this.trackMesh);

    this.sectorColorsArray = new Float32Array(colors);

    if (!showSectorColors) {
      this.setSectorColors(false);
    }
  }

  private buildTrackEdges(trackData: TrackGeometryData): void {
    const buildEdge = (xs: number[], ys: number[]) => {
      if (xs.length < 2) return;
      const points = xs.map(
        (x, i) => new THREE.Vector3(x, 0.5, ys[i])
      );
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeom = new THREE.TubeGeometry(curve, xs.length - 1, 4, 4, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x252535,
        emissive: 0x151525,
        emissiveIntensity: 0.3,
        roughness: 0.8,
        metalness: 0.1,
      });
      this.trackGroup.add(new THREE.Mesh(tubeGeom, tubeMat));
    };

    buildEdge(trackData.outer_x, trackData.outer_y);
    buildEdge(trackData.inner_x, trackData.inner_y);
  }

  private buildCenterline(trackData: TrackGeometryData): void {
    if (trackData.centerline_x.length < 2) return;

    const sectorColors: Record<number, THREE.Color> = {
      1: new THREE.Color(0x1a8a8a),
      2: new THREE.Color(0x8a3d6e),
      3: new THREE.Color(0x8a7a2e),
    };

    const positions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < trackData.centerline_x.length; i++) {
      positions.push(trackData.centerline_x[i], 2, trackData.centerline_y[i]);
      const sector = trackData.sector?.[i] || 1;
      const c = sectorColors[sector] || sectorColors[1];
      colors.push(c.r, c.g, c.b);
    }

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    lineGeom.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3)
    );

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      linewidth: 1,
    });

    this.trackGroup.add(new THREE.Line(lineGeom, lineMat));
  }

  private buildGround(): void {
    const groundGeom = new THREE.PlaneGeometry(60000, 60000);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x080812,
      roughness: 0.95,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -15;
    this.trackGroup.add(ground);

    const gridHelper = new THREE.GridHelper(60000, 60, 0x151525, 0x0c0c1a);
    gridHelper.position.y = -14;
    this.trackGroup.add(gridHelper);
  }

  private buildSectorBoundaryLines(trackData: TrackGeometryData): void {
    if (!trackData.sector) return;

    const boundaries = this.findSectorBoundaryIndices(trackData.sector);
    if (!boundaries) return;

    this.sectorBoundaryIndices = boundaries;

    const createLine = (
      innerPos: THREE.Vector3,
      outerPos: THREE.Vector3,
      isStartFinish: boolean
    ) => {
      const direction = new THREE.Vector3().subVectors(outerPos, innerPos);
      const distance = direction.length();
      const extension = distance * 0.15;
      const normalizedDir = direction.clone().normalize();

      const extendedInner = innerPos
        .clone()
        .addScaledVector(normalizedDir, -extension);
      const extendedOuter = outerPos
        .clone()
        .addScaledVector(normalizedDir, extension);

      const curve = new THREE.LineCurve3(extendedInner, extendedOuter);
      const tubeGeom = new THREE.TubeGeometry(curve, 1, 15, 4, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: isStartFinish ? 0.2 : 0.1,
        transparent: true,
        opacity: isStartFinish ? 0.5 : 0.15,
        roughness: 0.5,
        metalness: 0.1,
      });

      return new THREE.Mesh(tubeGeom, tubeMat);
    };

    const s1Idx = boundaries.s1;
    const s2Idx = boundaries.s2;

    this.trackGroup.add(
      createLine(
        new THREE.Vector3(trackData.inner_x[s1Idx], 0, trackData.inner_y[s1Idx]),
        new THREE.Vector3(trackData.outer_x[s1Idx], 0, trackData.outer_y[s1Idx]),
        false
      )
    );

    this.trackGroup.add(
      createLine(
        new THREE.Vector3(trackData.inner_x[s2Idx], 0, trackData.inner_y[s2Idx]),
        new THREE.Vector3(trackData.outer_x[s2Idx], 0, trackData.outer_y[s2Idx]),
        false
      )
    );

    this.trackGroup.add(
      createLine(
        new THREE.Vector3(trackData.inner_x[0], 0, trackData.inner_y[0]),
        new THREE.Vector3(trackData.outer_x[0], 0, trackData.outer_y[0]),
        true
      )
    );
  }

  private precomputeSpatialData(trackData: TrackGeometryData): void {
    this.cachedBounds = new THREE.Box3(
      new THREE.Vector3(trackData.x_min, -15, trackData.y_min),
      new THREE.Vector3(trackData.x_max, 500, trackData.y_max)
    );

    this.cachedCenter = new THREE.Vector3(
      (trackData.x_min + trackData.x_max) / 2,
      0,
      (trackData.y_min + trackData.y_max) / 2
    );

    if (!trackData.sector || !this.sectorBoundaryIndices) return;

    const boundaries = this.sectorBoundaryIndices;
    const totalPoints = trackData.centerline_x.length;

    const sectorRanges: Record<SectorId, [number, number]> = {
      1: [0, boundaries.s1],
      2: [boundaries.s1, boundaries.s2],
      3: [boundaries.s2, totalPoints],
    };

    for (const [sectorId, [start, end]] of Object.entries(sectorRanges)) {
      const id = Number(sectorId) as SectorId;

      let sumX = 0,
        sumY = 0,
        count = 0;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      const sampleInterval = Math.max(1, Math.floor((end - start) / 5));

      for (let i = start; i < end; i += sampleInterval) {
        const idx = Math.min(i, trackData.inner_x.length - 1);
        const cx = (trackData.inner_x[idx] + trackData.outer_x[idx]) / 2;
        const cy = (trackData.inner_y[idx] + trackData.outer_y[idx]) / 2;
        sumX += cx;
        sumY += cy;
        count++;

        minX = Math.min(minX, trackData.inner_x[idx], trackData.outer_x[idx]);
        maxX = Math.max(maxX, trackData.inner_x[idx], trackData.outer_x[idx]);
        minY = Math.min(minY, trackData.inner_y[idx], trackData.outer_y[idx]);
        maxY = Math.max(maxY, trackData.inner_y[idx], trackData.outer_y[idx]);
      }

      if (count > 0) {
        this.cachedSectorCentroids.set(
          id,
          new THREE.Vector3(sumX / count, 0, sumY / count)
        );
        this.cachedSectorBounds.set(
          id,
          new THREE.Box3(
            new THREE.Vector3(minX, -15, minY),
            new THREE.Vector3(maxX, 500, maxY)
          )
        );
      }
    }
  }

  private findSectorBoundaryIndices(
    sectors: number[]
  ): SectorBoundaryIndices | null {
    if (!sectors || sectors.length === 0) return null;

    let s1Start = -1;
    let s2Start = -1;

    for (let i = 1; i < sectors.length; i++) {
      if (sectors[i] !== sectors[i - 1]) {
        if (s1Start === -1 && sectors[i] === 2) {
          s1Start = i;
        } else if (s2Start === -1 && sectors[i] === 3) {
          s2Start = i;
          break;
        }
      }
    }

    return s1Start > 0 && s2Start > 0 ? { s1: s1Start, s2: s2Start } : null;
  }

  setSectorColors(enabled: boolean): void {
    if (!this.trackMesh || !this.sectorColorsArray) return;

    const colorAttribute = this.trackMesh.geometry.getAttribute(
      "color"
    ) as THREE.BufferAttribute;
    if (!colorAttribute) return;

    if (enabled) {
      colorAttribute.array = this.sectorColorsArray;
    } else {
      const grayColors = new Float32Array(this.sectorColorsArray.length);
      for (let i = 0; i < grayColors.length; i += 3) {
        grayColors[i] = 0.067;
        grayColors[i + 1] = 0.067;
        grayColors[i + 2] = 0.094;
      }
      colorAttribute.array = grayColors;
    }

    colorAttribute.needsUpdate = true;
  }

  getTrackBounds(): THREE.Box3 {
    return this.cachedBounds ?? new THREE.Box3();
  }

  getTrackCenter(): THREE.Vector3 {
    return this.cachedCenter ?? new THREE.Vector3();
  }

  getSectorCentroid(sectorId: SectorId): THREE.Vector3 {
    return this.cachedSectorCentroids.get(sectorId) ?? new THREE.Vector3();
  }

  getSectorBounds(sectorId: SectorId): THREE.Box3 {
    return this.cachedSectorBounds.get(sectorId) ?? new THREE.Box3();
  }

  private disposeGeometry(): void {
    this.trackGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      } else if (child instanceof THREE.Line) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });

    if (this.trackGroup.parent) {
      this.scene.remove(this.trackGroup);
    }

    this.trackGroup = new THREE.Group();
    this.trackMesh = null;
    this.sectorColorsArray = null;
  }

  dispose(): void {
    this.disposeGeometry();
    this.cachedBounds = null;
    this.cachedCenter = null;
    this.cachedSectorCentroids.clear();
    this.cachedSectorBounds.clear();
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/three/TrackGeometry.ts
git commit -m "feat: extract TrackGeometry module with precomputed spatial data"
```

---

## Task 5: WeatherEffects Module

**Files:**
- Create: `frontend/src/components/three/WeatherEffects.ts`

**Step 1: Write WeatherEffects.ts**

Extract rain shader, noise texture, and weather state handling from TrackVisualization3D.tsx lines 189-320, 1052-1065.

```typescript
import * as THREE from "three";

export class WeatherEffects {
  private rainLines: THREE.LineSegments;
  private clock: THREE.Clock;
  private noiseRenderTarget: THREE.WebGLRenderTarget;
  private noiseScene: THREE.Scene;
  private noiseCam: THREE.OrthographicCamera;
  private noiseShaderMat: THREE.ShaderMaterial;
  private rainShaderUniforms: { time: { value: number }; noiseMap: { value: THREE.Texture } };
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private isVisible = false;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    this.noiseRenderTarget = new THREE.WebGLRenderTarget(512, 512);
    this.noiseScene = new THREE.Scene();
    this.noiseCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.noiseShaderMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        float N(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }
        float smoothNoise(vec2 ip) {
          vec2 lv = fract(ip);
          vec2 id = floor(ip);
          lv = lv * lv * (3.0 - 2.0 * lv);
          float bl = N(id);
          float br = N(id + vec2(1.0, 0.0));
          float tl = N(id + vec2(0.0, 1.0));
          float tr = N(id + vec2(1.0, 1.0));
          return mix(mix(bl, br, lv.x), mix(tl, tr, lv.x), lv.y);
        }
        void main() {
          vec2 uv = vUv * 5.0 + time * 0.1;
          float h = smoothNoise(uv);
          h += smoothNoise(uv * 2.0) * 0.5;
          h += smoothNoise(uv * 4.0) * 0.25;
          gl_FragColor = vec4(vec3(h), 1.0);
        }
      `,
    });

    const noisePlane = new THREE.PlaneGeometry(2, 2);
    this.noiseScene.add(new THREE.Mesh(noisePlane, this.noiseShaderMat));

    const gCount = 15000;
    const gPos: number[] = [];
    const gEnds: number[] = [];

    for (let i = 0; i < gCount; i++) {
      const x = THREE.MathUtils.randFloatSpread(15000);
      const y = THREE.MathUtils.randFloat(-100, 500);
      const z = THREE.MathUtils.randFloatSpread(15000);
      const len = THREE.MathUtils.randFloat(150, 300);
      gPos.push(x, y, z, x, y, z);
      gEnds.push(0, len, 1, len);
    }

    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.Float32BufferAttribute(gPos, 3));
    rainGeo.setAttribute("gEnds", new THREE.Float32BufferAttribute(gEnds, 2));

    this.rainShaderUniforms = {
      time: { value: 0 },
      noiseMap: { value: this.noiseRenderTarget.texture },
    };

    const rainMat = new THREE.LineBasicMaterial({
      color: 0x3388ff,
      transparent: true,
      opacity: 0.9,
      linewidth: 3,
    });

    (rainMat as any).onBeforeCompile = (shader: any) => {
      Object.assign(shader.uniforms, this.rainShaderUniforms);
      shader.vertexShader = `
        uniform float time;
        uniform sampler2D noiseMap;
        attribute vec2 gEnds;
        varying float vGEnds;
        varying float vH;
        ${shader.vertexShader}
      `.replace(
        `#include <begin_vertex>`,
        `#include <begin_vertex>
        vec3 pos = position;
        pos.y = -mod(500. - (pos.y - time * 1200.), 600.) + 500.;
        pos.y += gEnds.x * gEnds.y;
        vec2 noiseUv = pos.xz / 1000.0;
        vec4 noiseH = texture2D(noiseMap, noiseUv);
        float h = noiseH.r;
        vH = smoothstep(3.0, 0.0, h);
        transformed = pos;
        vGEnds = gEnds.x;`
      );

      shader.fragmentShader = `
        varying float vGEnds;
        varying float vH;
        ${shader.fragmentShader}
      `.replace(
        `vec4 diffuseColor = vec4( diffuse, opacity );`,
        `float op = 1. - vGEnds;
        op = pow(op, 2.);
        op *= 0.8;
        vec3 col = diffuse;
        col += vH * vec3(0.5, 0.8, 1.0);
        col *= 1. + smoothstep(0.99, 1.0, vH);
        vec4 diffuseColor = vec4( col, op * opacity );`
      );
    };

    this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
    this.rainLines.frustumCulled = false;
  }

  setRainState(state: string | null): void {
    const shouldShow = state === "RAINING";

    if (shouldShow && !this.isVisible) {
      this.scene.add(this.rainLines);
      this.isVisible = true;
    } else if (!shouldShow && this.isVisible) {
      this.scene.remove(this.rainLines);
      this.isVisible = false;
    }
  }

  update(): void {
    if (!this.isVisible) return;

    const elapsed = this.clock.getElapsedTime();
    this.rainShaderUniforms.time.value = elapsed;
    this.noiseShaderMat.uniforms.time.value = elapsed;

    this.renderer.setRenderTarget(this.noiseRenderTarget);
    this.renderer.render(this.noiseScene, this.noiseCam);
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    if (this.isVisible) {
      this.scene.remove(this.rainLines);
    }
    this.rainLines.geometry.dispose();
    (this.rainLines.material as THREE.Material).dispose();
    this.noiseRenderTarget.dispose();
    this.noiseShaderMat.dispose();
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/three/WeatherEffects.ts
git commit -m "feat: extract WeatherEffects module with rain shaders"
```

---

## Task 6: DriverMarkers Module

**Files:**
- Create: `frontend/src/components/three/DriverMarkers.ts`

**Step 1: Write DriverMarkers.ts**

Extract driver sphere creation, position updates, selection pulse, and picking from TrackVisualization3D.tsx lines 817-1114.

```typescript
import * as THREE from "three";
import type { FrameData, SelectedDriver, SessionMetadata } from "../../types";

export class DriverMarkers {
  private scene: THREE.Scene;
  private meshes: Map<string, THREE.Group> = new Map();
  private lights: Map<string, THREE.PointLight> = new Map();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(
    frame: FrameData,
    selectedDriver: SelectedDriver | null,
    driverColors: Record<string, [number, number, number]> | undefined
  ): void {
    this.meshes.forEach((mesh, code) => {
      if (!frame.drivers[code]) {
        this.scene.remove(mesh);
        this.meshes.delete(code);
        this.lights.delete(code);
      }
    });

    for (const [code, driver] of Object.entries(frame.drivers)) {
      const isRetired =
        driver.status === "Retired" ||
        driver.status === "DNF" ||
        driver.rel_dist >= 0.99;

      if (isRetired) {
        const mesh = this.meshes.get(code);
        if (mesh) {
          this.scene.remove(mesh);
          this.meshes.delete(code);
          this.lights.delete(code);
        }
        continue;
      }

      const teamColor = driverColors?.[code] || [220, 38, 38];
      const hexColor =
        (teamColor[0] << 16) | (teamColor[1] << 8) | teamColor[2];

      let group = this.meshes.get(code);

      if (!group) {
        group = this.createDriverGroup(hexColor);
        this.scene.add(group);
        this.meshes.set(code, group);
      }

      group.position.set(driver.x, 50, driver.y);

      const isSelected = code === selectedDriver?.code;
      this.applySelectionState(group, code, isSelected);
    }
  }

  private createDriverGroup(hexColor: number): THREE.Group {
    const group = new THREE.Group();
    const color = new THREE.Color(hexColor);

    const sphereGeometry = new THREE.SphereGeometry(80, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      metalness: 0.7,
      roughness: 0.3,
    });
    group.add(new THREE.Mesh(sphereGeometry, material));

    const ringGeometry = new THREE.TorusGeometry(95, 5, 16, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.4,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 3;
    group.add(ring);

    const pointLight = new THREE.PointLight(hexColor, 0.5, 300);
    pointLight.position.set(0, 30, 0);
    group.add(pointLight);
    this.lights.set("__pending__", pointLight);

    return group;
  }

  private applySelectionState(
    group: THREE.Group,
    code: string,
    isSelected: boolean
  ): void {
    if (group.children.length < 2) return;

    const mainMat = (group.children[0] as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    const ringMat = (group.children[1] as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    const pointLight = this.lights.get(code);

    if (isSelected) {
      const time = performance.now() / 1000;
      const scalePulse = 1.0 + Math.sin(time * 4) * 0.1;
      const emissivePulse = 0.9 + Math.sin(time * 6) * 0.2;
      mainMat.emissiveIntensity = emissivePulse;
      ringMat.emissiveIntensity = 0.6;
      ringMat.opacity = 0.9;
      group.scale.set(scalePulse, scalePulse, scalePulse);
      if (pointLight) pointLight.intensity = 0.8;
    } else {
      mainMat.emissiveIntensity = 0.7;
      ringMat.emissiveIntensity = 0.3;
      ringMat.opacity = 0.6;
      group.scale.set(0.7, 0.7, 0.7);
      if (pointLight) pointLight.intensity = 0.5;
    }
  }

  pick(
    event: MouseEvent,
    camera: THREE.Camera,
    domElement: HTMLElement
  ): string | null {
    const rect = domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);
    const meshArray = Array.from(this.meshes.values());
    const intersects = this.raycaster.intersectObjects(meshArray, true);

    if (intersects.length === 0) return null;

    for (const [code, group] of this.meshes.entries()) {
      if (
        intersects[0].object === group ||
        group.children.includes(intersects[0].object as THREE.Mesh)
      ) {
        return code;
      }
    }

    return null;
  }

  getDriverObject(code: string): THREE.Object3D | null {
    return this.meshes.get(code) ?? null;
  }

  dispose(): void {
    this.meshes.forEach((group) => {
      this.scene.remove(group);
      group.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
    });
    this.meshes.clear();
    this.lights.clear();
  }
}
```

Note: The `createDriverGroup` method has a `__pending__` key for the light — fix this by passing the code. Actually, let's store the light reference on the group's third child (it's always the PointLight). Simplify by reading from group.children[2] in `applySelectionState`:

Replace the `this.lights.set("__pending__", pointLight);` line and the lights Map usage. The PointLight is always `group.children[2]`, so `applySelectionState` can just cast it directly. Remove the `lights` Map entirely to keep it simple:

```typescript
private applySelectionState(
  group: THREE.Group,
  _code: string,
  isSelected: boolean
): void {
  if (group.children.length < 3) return;

  const mainMat = (group.children[0] as THREE.Mesh)
    .material as THREE.MeshStandardMaterial;
  const ringMat = (group.children[1] as THREE.Mesh)
    .material as THREE.MeshStandardMaterial;
  const pointLight = group.children[2] as THREE.PointLight;

  if (isSelected) {
    const time = performance.now() / 1000;
    const scalePulse = 1.0 + Math.sin(time * 4) * 0.1;
    const emissivePulse = 0.9 + Math.sin(time * 6) * 0.2;
    mainMat.emissiveIntensity = emissivePulse;
    ringMat.emissiveIntensity = 0.6;
    ringMat.opacity = 0.9;
    group.scale.set(scalePulse, scalePulse, scalePulse);
    pointLight.intensity = 0.8;
  } else {
    mainMat.emissiveIntensity = 0.7;
    ringMat.emissiveIntensity = 0.3;
    ringMat.opacity = 0.6;
    group.scale.set(0.7, 0.7, 0.7);
    pointLight.intensity = 0.5;
  }
}
```

And remove the `lights` Map field, `this.lights` references in `createDriverGroup`, `update`, and `dispose`.

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/three/DriverMarkers.ts
git commit -m "feat: extract DriverMarkers module with picking support"
```

---

## Task 7: SectorInteraction Module

**Files:**
- Create: `frontend/src/components/three/SectorInteraction.ts`

**Step 1: Write SectorInteraction.ts**

Builds invisible hit meshes per sector for raycasting. Uses track data from TrackGeometry's precomputed spatial data.

```typescript
import * as THREE from "three";
import type { TrackGeometry as TrackGeometryData } from "../../types";
import type { SectorId } from "../../types";
import type { SectorBoundaryIndices } from "./TrackGeometry";

export class SectorInteraction {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private container: HTMLElement;
  private hitMeshes: Map<SectorId, THREE.Mesh> = new Map();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private highlightedSector: SectorId | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement
  ) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
  }

  build(
    trackData: TrackGeometryData,
    boundaries: SectorBoundaryIndices
  ): void {
    this.disposeHitMeshes();

    const totalPoints = trackData.centerline_x.length;
    const sectorRanges: Record<SectorId, [number, number]> = {
      1: [0, boundaries.s1],
      2: [boundaries.s1, boundaries.s2],
      3: [boundaries.s2, totalPoints],
    };

    for (const [sectorIdStr, [start, end]] of Object.entries(sectorRanges)) {
      const sectorId = Number(sectorIdStr) as SectorId;
      const mesh = this.buildSectorHitMesh(trackData, start, end);
      mesh.userData.sectorId = sectorId;
      mesh.visible = false;
      this.scene.add(mesh);
      this.hitMeshes.set(sectorId, mesh);
    }
  }

  private buildSectorHitMesh(
    trackData: TrackGeometryData,
    startIdx: number,
    endIdx: number
  ): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    const numPoints = Math.min(
      trackData.inner_x.length,
      trackData.outer_x.length
    );

    let vertexCount = 0;

    for (let i = startIdx; i < endIdx && i < numPoints; i++) {
      positions.push(trackData.inner_x[i], 5, trackData.inner_y[i]);
      positions.push(trackData.outer_x[i], 5, trackData.outer_y[i]);

      if (i > startIdx) {
        const a = vertexCount * 2 - 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }

      vertexCount++;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3)
    );
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geom, material);
  }

  onPointerMove(event: PointerEvent): SectorId | null {
    return this.raycastSector(event);
  }

  onPointerDown(event: PointerEvent): SectorId | null {
    return this.raycastSector(event);
  }

  private raycastSector(event: MouseEvent): SectorId | null {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const hitMeshArray = Array.from(this.hitMeshes.values());
    hitMeshArray.forEach((m) => (m.visible = true));
    const intersects = this.raycaster.intersectObjects(hitMeshArray, false);
    hitMeshArray.forEach((m) => (m.visible = false));

    if (intersects.length === 0) return null;

    return intersects[0].object.userData.sectorId as SectorId;
  }

  setHighlight(sectorId: SectorId | null): void {
    if (this.highlightedSector === sectorId) return;

    if (this.highlightedSector !== null) {
      const prevMesh = this.hitMeshes.get(this.highlightedSector);
      if (prevMesh) {
        (prevMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    if (sectorId !== null) {
      const mesh = this.hitMeshes.get(sectorId);
      if (mesh) {
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.08;
        (mesh.material as THREE.MeshBasicMaterial).color.set(
          sectorId === 1 ? 0x1a8a8a : sectorId === 2 ? 0x8a3d6e : 0x8a7a2e
        );
      }
    }

    this.highlightedSector = sectorId;
  }

  private disposeHitMeshes(): void {
    this.hitMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.hitMeshes.clear();
  }

  dispose(): void {
    this.disposeHitMeshes();
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/three/SectorInteraction.ts
git commit -m "feat: add SectorInteraction module with invisible hit meshes"
```

---

## Task 8: LabelManager Module

**Files:**
- Create: `frontend/src/components/three/LabelManager.ts`

**Step 1: Write LabelManager.ts**

CSS2DRenderer-based labels. Driver label anchors to driver mesh (auto-tracks). Sector hover label positioned manually.

```typescript
import * as THREE from "three";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SelectedDriver, SessionMetadata } from "../../types";
import type { SectorId } from "../../types";
import { getTeamLogoPath } from "../../utils/teamLogoMap";

export class LabelManager {
  private css2dRenderer: CSS2DRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private driverLabel: CSS2DObject | null = null;
  private driverLabelAnchor: THREE.Object3D | null = null;
  private sectorLabel: CSS2DObject | null = null;
  private sectorLabelAnchor: THREE.Object3D | null = null;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement
  ) {
    this.scene = scene;
    this.camera = camera;

    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(container.clientWidth, container.clientHeight);
    this.css2dRenderer.domElement.style.position = "absolute";
    this.css2dRenderer.domElement.style.top = "0";
    this.css2dRenderer.domElement.style.left = "0";
    this.css2dRenderer.domElement.style.pointerEvents = "none";
    this.css2dRenderer.domElement.style.zIndex = "2";
    container.appendChild(this.css2dRenderer.domElement);
  }

  attachDriverLabel(
    driver: SelectedDriver | null,
    anchor: THREE.Object3D | null,
    driverTeams?: Record<string, string>
  ): void {
    if (this.driverLabel) {
      this.driverLabelAnchor?.remove(this.driverLabel);
      this.driverLabel = null;
      this.driverLabelAnchor = null;
    }

    if (!driver || !anchor) return;

    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "6px";
    div.style.padding = "4px 10px";
    div.style.backgroundColor = "rgba(8, 8, 16, 0.85)";
    div.style.border = `1px solid rgba(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]}, 0.30)`;
    div.style.color = "#e8e8ee";
    div.style.fontFamily = "'Share Tech Mono', monospace";
    div.style.borderRadius = "5px";
    div.style.letterSpacing = "0.05em";
    div.style.fontSize = "11px";
    div.style.whiteSpace = "nowrap";

    const posSpan = document.createElement("span");
    posSpan.style.fontWeight = "700";
    posSpan.style.color = `rgb(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]})`;
    posSpan.textContent = `P${driver.data.position || "?"}`;
    div.appendChild(posSpan);

    const sep = document.createElement("span");
    sep.textContent = "\u2014";
    sep.style.color = "rgba(255,255,255,0.3)";
    div.appendChild(sep);

    const codeSpan = document.createElement("span");
    codeSpan.style.fontWeight = "700";
    codeSpan.textContent = driver.code;
    div.appendChild(codeSpan);

    const teamName = driverTeams?.[driver.code];
    const logoPath = getTeamLogoPath(teamName);
    if (logoPath) {
      const img = document.createElement("img");
      img.style.height = "14px";
      img.style.width = "auto";
      img.style.marginLeft = "4px";
      img.src = logoPath;
      img.onerror = () => { img.style.display = "none"; };
      div.appendChild(img);
    }

    const label = new CSS2DObject(div);
    label.position.set(0, 120, 0);
    label.center.set(0.5, 1);

    anchor.add(label);
    this.driverLabel = label;
    this.driverLabelAnchor = anchor;
  }

  updateDriverLabelContent(driver: SelectedDriver): void {
    if (!this.driverLabel) return;

    const div = this.driverLabel.element;
    const posSpan = div.children[0] as HTMLSpanElement;
    if (posSpan) {
      posSpan.textContent = `P${driver.data.position || "?"}`;
    }
  }

  showSectorLabel(sectorId: SectorId | null, position: THREE.Vector3): void {
    if (this.sectorLabel) {
      if (this.sectorLabelAnchor) {
        this.sectorLabelAnchor.remove(this.sectorLabel);
        this.scene.remove(this.sectorLabelAnchor);
      }
      this.sectorLabel = null;
      this.sectorLabelAnchor = null;
    }

    if (sectorId === null) return;

    const sectorInfo: Record<SectorId, { label: string; color: string; rgb: string }> = {
      1: { label: "S1", color: "#1a8a8a", rgb: "26, 138, 138" },
      2: { label: "S2", color: "#8a3d6e", rgb: "138, 61, 110" },
      3: { label: "S3", color: "#8a7a2e", rgb: "138, 122, 46" },
    };

    const info = sectorInfo[sectorId];
    const div = document.createElement("div");
    div.textContent = info.label;
    div.style.padding = "4px 10px";
    div.style.fontSize = "11px";
    div.style.fontWeight = "600";
    div.style.color = info.color;
    div.style.opacity = "0.8";
    div.style.border = `1px solid rgba(${info.rgb}, 0.20)`;
    div.style.borderRadius = "4px";
    div.style.backgroundColor = `rgba(${info.rgb}, 0.08)`;
    div.style.whiteSpace = "nowrap";
    div.style.fontFamily = "'Share Tech Mono', monospace";
    div.style.letterSpacing = "0.1em";

    const label = new CSS2DObject(div);
    label.center.set(0.5, 0.5);

    const anchorObj = new THREE.Object3D();
    anchorObj.position.copy(position);
    this.scene.add(anchorObj);
    anchorObj.add(label);

    this.sectorLabel = label;
    this.sectorLabelAnchor = anchorObj;
  }

  clearAll(): void {
    this.attachDriverLabel(null, null);
    this.showSectorLabel(null, new THREE.Vector3());
  }

  onResize(container: HTMLElement): void {
    this.css2dRenderer.setSize(container.clientWidth, container.clientHeight);
  }

  render(): void {
    this.css2dRenderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.clearAll();
    if (this.css2dRenderer.domElement.parentNode) {
      this.css2dRenderer.domElement.parentNode.removeChild(
        this.css2dRenderer.domElement
      );
    }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/three/LabelManager.ts
git commit -m "feat: add LabelManager module with CSS2DRenderer"
```

---

## Task 9: Rewrite TrackVisualization3D Orchestrator

**Files:**
- Modify: `frontend/src/components/TrackVisualization3D.tsx`

This is the largest task. Replace the 1228-line monolith with a ~200-line orchestrator that wires the 7 systems together.

**Step 1: Rewrite TrackVisualization3D.tsx**

The orchestrator:
- Creates all systems on mount
- Subscribes to Zustand store
- Routes store changes to the right system
- Runs the animation loop
- Handles resize
- Handles pointer events (driver-first, then sector priority)
- Calls dispose on all systems on unmount

```typescript
import React, { useEffect, useRef, useCallback } from "react";
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
import { TrackGeometry } from "./three/TrackGeometry";
import { SectorInteraction } from "./three/SectorInteraction";
import { DriverMarkers } from "./three/DriverMarkers";
import { WeatherEffects } from "./three/WeatherEffects";
import { LabelManager } from "./three/LabelManager";
import { MapSettingsPanel } from "./MapSettingsPanel";
import { Settings } from "lucide-react";
import { useState } from "react";

export const TrackVisualization3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const systemsRef = useRef<{
    sceneSetup: SceneSetup;
    cameraController: CameraController;
    trackGeometry: TrackGeometry;
    sectorInteraction: SectorInteraction;
    driverMarkers: DriverMarkers;
    weatherEffects: WeatherEffects;
    labelManager: LabelManager;
  } | null>(null);
  const initRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const hoveredSectorIdRef = useRef<SectorId | null>(null);

  const currentFrame = useCurrentFrame();
  const selectedDriver = useSelectedDriver();
  const sessionMetadata = useSessionMetadata();
  const { isEnabled: showSectorColors, toggle: toggleSectorColors } =
    useSectorColors();
  const selectedSectorId = useSelectedSectorId();
  const cameraMode = useCameraMode();
  const { setSelectedDriver, selectSector, clearSectorSelection, resetCameraView } =
    useReplayStore();

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
    const weatherEffects = new WeatherEffects(
      sceneSetup.scene,
      sceneSetup.renderer
    );
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
          const teamColor =
            metadata?.driver_colors?.[driverCode] || [220, 38, 38];
          useReplayStore.getState().setSelectedDriver({
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
          labelManager.showSectorLabel(null, new (await import("three")).Vector3());
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
      const anchor = systems.driverMarkers.getDriverObject(selectedDriver.code);
      systems.labelManager.attachDriverLabel(
        selectedDriver,
        anchor,
        (sessionMetadata as any)?.driver_teams
      );
    } else {
      systems.labelManager.attachDriverLabel(null, null);
    }

    systems.weatherEffects.setRainState(
      currentFrame.weather?.rain_state ?? null
    );
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
        onToggleTemperatureUnit={() =>
          setTemperatureUnit(temperatureUnit === "C" ? "F" : "C")
        }
        enableWeatherFx={enableWeatherFx}
        onToggleWeatherFx={() => setEnableWeatherFx((prev) => !prev)}
      />
    </div>
  );
};

function findSectorBoundaryIndices(
  sectors: number[]
): { s1: number; s2: number } | null {
  if (!sectors || sectors.length === 0) return null;
  let s1Start = -1;
  let s2Start = -1;
  for (let i = 1; i < sectors.length; i++) {
    if (sectors[i] !== sectors[i - 1]) {
      if (s1Start === -1 && sectors[i] === 2) s1Start = i;
      else if (s2Start === -1 && sectors[i] === 3) {
        s2Start = i;
        break;
      }
    }
  }
  return s1Start > 0 && s2Start > 0 ? { s1: s1Start, s2: s2Start } : null;
}

export default TrackVisualization3D;
```

**Important note:** The `handlePointerMove` callback has an issue with the dynamic import of THREE.Vector3. Fix this by importing THREE at the top and using `new THREE.Vector3()` directly. Also, the `attachDriverLabel` call needs to handle the case where the label should only be recreated when the selected driver changes, not every frame. Consider memoizing or checking if the driver code changed before recreating.

**Step 2: Fix the pointer move handler**

Replace the dynamic import in `handlePointerMove`:

```typescript
import * as THREE from "three";
// ... at the top

// In handlePointerMove:
labelManager.showSectorLabel(null, new THREE.Vector3());
```

**Step 3: Optimize driver label updates**

In the `currentFrame` effect, only recreate the label when the selected driver code changes, and only update content (position number) on subsequent frames:

```typescript
const prevDriverRef = useRef<string | null>(null);

// In the effect:
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
```

**Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 5: Verify the app renders**

Run: `cd frontend && npm run dev`
Open http://localhost:5173, load a session, verify:
- Track renders
- Drivers appear and move
- Orbit controls work (drag to rotate, scroll to zoom)
- Click a driver to select
- Settings panel works
- Weather panel works

**Step 6: Commit**

```bash
git add frontend/src/components/TrackVisualization3D.tsx
git commit -m "feat: rewrite TrackVisualization3D as thin orchestrator over modular systems"
```

---

## Task 10: Integration Testing + Polish

**Files:**
- Potentially fix issues in any `frontend/src/components/three/*.ts` file
- Potentially fix `frontend/src/components/TrackVisualization3D.tsx`

**Step 1: Test sector click → fly-to → reset cycle**

1. Load a session
2. Click on a sector on the track
3. Verify: camera animates to sector centroid
4. Verify: store `selectedSectorId` and `cameraMode` update
5. Verify: "RESET VIEW" button appears
6. Click "RESET VIEW"
7. Verify: camera returns to overview
8. Verify: store resets to `null` / `'overview'`

**Step 2: Test driver selection with sector**

1. Click a driver → verify label appears anchored to driver
2. Click a sector → verify camera flies to sector, driver label stays
3. Click another driver → verify label switches
4. Deselect driver → verify label disappears

**Step 3: Test sector hover labels**

1. Move mouse over a sector → verify sector label appears
2. Move mouse to another sector → verify label switches
3. Move mouse off track → verify label disappears

**Step 4: Test orbit controls constraints**

1. Drag to orbit → verify smooth rotation
2. Scroll to zoom in → verify min distance holds
3. Scroll to zoom out → verify max distance holds
4. Try to orbit below ground → verify max polar angle holds
5. Try to orbit directly overhead → verify min polar angle holds
6. Try to pan → verify it's disabled

**Step 5: Test resize**

1. Resize browser window
2. Verify: track stays visible, no distortion
3. Verify: labels still positioned correctly

**Step 6: Test weather effects**

1. Load a session with rain
2. Verify: rain effect renders correctly
3. Toggle Weather FX in settings → verify rain hides/shows

**Step 7: Fix any issues found**

Address bugs discovered during testing. Each fix gets its own commit.

**Step 8: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes for 3D visualization refactor"
```

---

## Summary

| Task | Module | Lines (approx) |
|------|--------|----------------|
| 1 | Store scaffolding | ~30 |
| 2 | SceneSetup | ~60 |
| 3 | CameraController | ~120 |
| 4 | TrackGeometry | ~280 |
| 5 | WeatherEffects | ~140 |
| 6 | DriverMarkers | ~150 |
| 7 | SectorInteraction | ~130 |
| 8 | LabelManager | ~170 |
| 9 | Orchestrator rewrite | ~250 |
| 10 | Integration testing | varies |

Total new module code: ~1,050 lines across 7 focused files
Orchestrator: ~250 lines (down from 1,228)
Net effect: Same functionality, modular architecture, ready for interactive features.
