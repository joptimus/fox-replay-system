import * as THREE from 'three';
import type { TrackGeometry as TrackGeometryData } from '../../types';
import type { SectorId } from '../../types';

export interface SectorBoundaryIndices {
  s1: number;
  s2: number;
}

const SECTOR_COLORS: Record<number, { r: number; g: number; b: number }> = {
  1: { r: 0.102, g: 0.541, b: 0.541 },
  2: { r: 0.541, g: 0.239, b: 0.431 },
  3: { r: 0.541, g: 0.478, b: 0.180 },
};

const SECTOR_HEX: Record<number, number> = {
  1: 0x1a8a8a,
  2: 0x8a3d6e,
  3: 0x8a7a2e,
};

const ROAD_BASE = { r: 0.067, g: 0.067, b: 0.094 };
const TINT_STRENGTH = 0.07;

function blendColor(base: { r: number; g: number; b: number }, tint: { r: number; g: number; b: number }, strength: number) {
  return {
    r: base.r * (1 - strength) + tint.r * strength,
    g: base.g * (1 - strength) + tint.g * strength,
    b: base.b * (1 - strength) + tint.b * strength,
  };
}

export function findSectorBoundaryIndices(sectors: number[] | undefined): SectorBoundaryIndices | null {
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

  return s1Start !== -1 && s2Start !== -1 ? { s1: s1Start, s2: s2Start } : null;
}

export class TrackGeometry {
  trackGroup: THREE.Group;

  private scene: THREE.Scene;
  private cachedBounds: THREE.Box3 | null = null;
  private cachedCenter: THREE.Vector3 | null = null;
  private cachedSectorCentroids: Map<SectorId, THREE.Vector3> = new Map();
  private cachedSectorBounds: Map<SectorId, THREE.Box3> = new Map();
  private sectorVertexColors: Float32Array | null = null;
  private uniformVertexColors: Float32Array | null = null;
  private trackMesh: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
  }

  build(trackData: TrackGeometryData, showSectorColors: boolean): void {
    this.disposeChildren();

    if (!trackData.centerline_x?.length || !trackData.outer_x?.length || !trackData.inner_x?.length) {
      return;
    }

    this.buildTrackSurface(trackData, showSectorColors);
    this.buildEdgeTubes(trackData);
    this.buildCenterline(trackData);
    this.buildGroundPlane();
    this.buildGrid();
    this.buildSectorBoundaries(trackData);
    this.precomputeSpatialData(trackData);
  }

  setSectorColors(enabled: boolean): void {
    if (!this.trackMesh || !this.sectorVertexColors || !this.uniformVertexColors) return;

    const geometry = this.trackMesh.geometry;
    const colorAttr = geometry.getAttribute('color');
    if (!colorAttr) return;

    const source = enabled ? this.sectorVertexColors : this.uniformVertexColors;
    (colorAttr as THREE.BufferAttribute).set(source);
    colorAttr.needsUpdate = true;
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

  dispose(): void {
    this.disposeChildren();
    this.scene.remove(this.trackGroup);
    this.cachedBounds = null;
    this.cachedCenter = null;
    this.cachedSectorCentroids.clear();
    this.cachedSectorBounds.clear();
    this.sectorVertexColors = null;
    this.uniformVertexColors = null;
    this.trackMesh = null;
  }

  private disposeChildren(): void {
    this.trackGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) {
          obj.material.dispose();
        } else if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        }
      }
    });
    this.trackGroup.clear();
  }

  private buildTrackSurface(trackData: TrackGeometryData, showSectorColors: boolean): void {
    const numPoints = Math.min(trackData.inner_x.length, trackData.outer_x.length);
    if (numPoints < 2) return;

    const positions: number[] = [];
    const sectorColors: number[] = [];
    const uniformColors: number[] = [];

    for (let i = 0; i < numPoints; i++) {
      positions.push(trackData.inner_x[i], 0, trackData.inner_y[i]);
      positions.push(trackData.outer_x[i], 0, trackData.outer_y[i]);

      const sectorIndex = trackData.sector?.[i] || 1;
      const tint = SECTOR_COLORS[sectorIndex] || SECTOR_COLORS[3];
      const blended = blendColor(ROAD_BASE, tint, TINT_STRENGTH);

      sectorColors.push(blended.r, blended.g, blended.b);
      sectorColors.push(blended.r, blended.g, blended.b);

      uniformColors.push(ROAD_BASE.r, ROAD_BASE.g, ROAD_BASE.b);
      uniformColors.push(ROAD_BASE.r, ROAD_BASE.g, ROAD_BASE.b);
    }

    this.sectorVertexColors = new Float32Array(sectorColors);
    this.uniformVertexColors = new Float32Array(uniformColors);

    const indices: number[] = [];
    for (let i = 0; i < numPoints - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = (i + 1) * 2;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    const activeColors = showSectorColors ? this.sectorVertexColors : this.uniformVertexColors;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(activeColors), 3));
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geom.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.75,
      metalness: 0.2,
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.position.z = -1;
    this.trackGroup.add(mesh);
    this.trackMesh = mesh;
  }

  private buildEdgeTubes(trackData: TrackGeometryData): void {
    const tubeMaterialProps = {
      color: 0x252535,
      emissive: 0x151525,
      emissiveIntensity: 0.3,
      roughness: 0.8,
      metalness: 0.1,
    };

    if (trackData.outer_x.length > 1) {
      const points = trackData.outer_x.map((x, i) => new THREE.Vector3(x, 0.5, trackData.outer_y[i]));
      const curve = new THREE.CatmullRomCurve3(points);
      const geom = new THREE.TubeGeometry(curve, trackData.outer_x.length - 1, 4, 4, false);
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial(tubeMaterialProps));
      this.trackGroup.add(mesh);
    }

    if (trackData.inner_x.length > 1) {
      const points = trackData.inner_x.map((x, i) => new THREE.Vector3(x, 0.5, trackData.inner_y[i]));
      const curve = new THREE.CatmullRomCurve3(points);
      const geom = new THREE.TubeGeometry(curve, trackData.inner_x.length - 1, 4, 4, false);
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial(tubeMaterialProps));
      this.trackGroup.add(mesh);
    }
  }

  private buildCenterline(trackData: TrackGeometryData): void {
    if (trackData.centerline_x.length < 2) return;

    const linePositions: number[] = [];
    const lineColors: number[] = [];

    for (let i = 0; i < trackData.centerline_x.length; i++) {
      linePositions.push(trackData.centerline_x[i], 2, trackData.centerline_y[i]);
      const sector = trackData.sector?.[i] || 1;
      const color = new THREE.Color(SECTOR_HEX[sector] || SECTOR_HEX[1]);
      lineColors.push(color.r, color.g, color.b);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      linewidth: 1,
    });

    const line = new THREE.Line(geom, material);
    this.trackGroup.add(line);
  }

  private buildGroundPlane(): void {
    const geom = new THREE.PlaneGeometry(60000, 60000);
    const material = new THREE.MeshStandardMaterial({
      color: 0x080812,
      roughness: 0.95,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(geom, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -15;
    this.trackGroup.add(ground);
  }

  private buildGrid(): void {
    const grid = new THREE.GridHelper(60000, 60, 0x151525, 0x0c0c1a);
    grid.position.y = -14;
    this.trackGroup.add(grid);
  }

  private buildSectorBoundaries(trackData: TrackGeometryData): void {
    const boundaries = findSectorBoundaryIndices(trackData.sector);
    if (!boundaries) return;

    const createBoundaryTube = (innerIdx: number, outerIdx: number, isStartFinish: boolean): THREE.Mesh => {
      const innerPos = new THREE.Vector3(trackData.inner_x[innerIdx], 0, trackData.inner_y[innerIdx]);
      const outerPos = new THREE.Vector3(trackData.outer_x[outerIdx], 0, trackData.outer_y[outerIdx]);

      const direction = new THREE.Vector3().subVectors(outerPos, innerPos);
      const distance = direction.length();
      const extension = distance * 0.15;
      const normalizedDir = direction.clone().normalize();

      const extendedInner = innerPos.clone().addScaledVector(normalizedDir, -extension);
      const extendedOuter = outerPos.clone().addScaledVector(normalizedDir, extension);

      const curve = new THREE.LineCurve3(extendedInner, extendedOuter);
      const geom = new THREE.TubeGeometry(curve, 1, 15, 4, false);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: isStartFinish ? 0.2 : 0.1,
        transparent: true,
        opacity: isStartFinish ? 0.5 : 0.15,
        roughness: 0.5,
        metalness: 0.1,
      });

      return new THREE.Mesh(geom, material);
    };

    this.trackGroup.add(createBoundaryTube(boundaries.s1, boundaries.s1, false));
    this.trackGroup.add(createBoundaryTube(boundaries.s2, boundaries.s2, false));
    this.trackGroup.add(createBoundaryTube(0, 0, true));
  }

  private precomputeSpatialData(trackData: TrackGeometryData): void {
    this.cachedBounds = new THREE.Box3(
      new THREE.Vector3(trackData.x_min, -15, trackData.y_min),
      new THREE.Vector3(trackData.x_max, 5000, trackData.y_max),
    );

    this.cachedCenter = new THREE.Vector3(
      (trackData.x_min + trackData.x_max) / 2,
      0,
      (trackData.y_min + trackData.y_max) / 2,
    );

    const boundaries = findSectorBoundaryIndices(trackData.sector);
    if (!boundaries) return;

    const totalPoints = trackData.centerline_x.length;
    const sectorRanges: Record<SectorId, [number, number]> = {
      1: [0, boundaries.s1],
      2: [boundaries.s1, boundaries.s2],
      3: [boundaries.s2, totalPoints],
    };

    for (const sectorId of [1, 2, 3] as SectorId[]) {
      const [startIdx, endIdx] = sectorRanges[sectorId];
      this.cachedSectorCentroids.set(sectorId, this.computeSectorCentroid(startIdx, endIdx, trackData));
      this.cachedSectorBounds.set(sectorId, this.computeSectorBounds(startIdx, endIdx, trackData));
    }
  }

  private computeSectorCentroid(startIdx: number, endIdx: number, trackData: TrackGeometryData): THREE.Vector3 {
    const sectorLength = endIdx - startIdx;

    if (sectorLength <= 0) {
      const idx = Math.min(startIdx, trackData.inner_x.length - 1);
      return new THREE.Vector3(
        (trackData.inner_x[idx] + trackData.outer_x[idx]) / 2,
        0,
        (trackData.inner_y[idx] + trackData.outer_y[idx]) / 2,
      );
    }

    let sumX = 0;
    let sumZ = 0;
    let count = 0;

    const sampleInterval = Math.max(1, Math.floor(sectorLength / 5));

    for (let i = startIdx; i < endIdx; i += sampleInterval) {
      const idx = Math.min(i, trackData.inner_x.length - 1);
      sumX += (trackData.inner_x[idx] + trackData.outer_x[idx]) / 2;
      sumZ += (trackData.inner_y[idx] + trackData.outer_y[idx]) / 2;
      count++;
    }

    const lastIdx = Math.min(endIdx - 1, trackData.inner_x.length - 1);
    sumX += (trackData.inner_x[lastIdx] + trackData.outer_x[lastIdx]) / 2;
    sumZ += (trackData.inner_y[lastIdx] + trackData.outer_y[lastIdx]) / 2;
    count++;

    return new THREE.Vector3(sumX / count, 0, sumZ / count);
  }

  private computeSectorBounds(startIdx: number, endIdx: number, trackData: TrackGeometryData): THREE.Box3 {
    const box = new THREE.Box3();

    for (let i = startIdx; i < endIdx; i++) {
      const idx = Math.min(i, trackData.inner_x.length - 1);
      box.expandByPoint(new THREE.Vector3(trackData.inner_x[idx], 0, trackData.inner_y[idx]));
      box.expandByPoint(new THREE.Vector3(trackData.outer_x[idx], 0, trackData.outer_y[idx]));
    }

    return box;
  }
}
