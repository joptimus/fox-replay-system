import * as THREE from 'three';
import type { TrackGeometry as TrackGeometryData } from '../../types';

const TERRAIN_COLOR_LOW = new THREE.Color(0x121220);
const TERRAIN_COLOR_HIGH = new THREE.Color(0x242438);
const TERRAIN_SUBDIVISIONS = 50;
const TERRAIN_MARGIN = 2000;
const TRACK_HALF_WIDTH = 300;
const FALLOFF_RADIUS = 3000;
const TRACK_CLEARANCE = 50;

const SECTOR_TINTS: Record<number, THREE.Color> = {
  1: new THREE.Color(0x1a8a8a),
  2: new THREE.Color(0x8a3d6e),
  3: new THREE.Color(0x8a7a2e),
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class TerrainMesh {
  private group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
  }

  build(trackData: TrackGeometryData, getElevation: (i: number) => number): THREE.Group {
    this.dispose();
    this.group = new THREE.Group();

    const xMin = trackData.x_min - TERRAIN_MARGIN;
    const xMax = trackData.x_max + TERRAIN_MARGIN;
    const zMin = trackData.y_min - TERRAIN_MARGIN;
    const zMax = trackData.y_max + TERRAIN_MARGIN;
    const width = xMax - xMin;
    const depth = zMax - zMin;

    const geo = new THREE.PlaneGeometry(width, depth, TERRAIN_SUBDIVISIONS, TERRAIN_SUBDIVISIONS);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const vertCount = posAttr.count;

    const clLen = trackData.centerline_x.length;
    const clX = trackData.centerline_x;
    const clZ = trackData.centerline_y;
    const clElev: number[] = [];
    for (let i = 0; i < clLen; i++) {
      clElev.push(getElevation(i));
    }

    const clSector: number[] = [];
    for (let i = 0; i < clLen; i++) {
      clSector.push(trackData.sector?.[i] ?? 1);
    }

    let elevMin = Infinity, elevMax = -Infinity;
    for (const e of clElev) {
      if (e < elevMin) elevMin = e;
      if (e > elevMax) elevMax = e;
    }
    const elevRange = elevMax - elevMin || 1;

    const BUCKET_SIZE = 10;
    const bucketCount = Math.ceil(clLen / BUCKET_SIZE);

    const findNearest = (vx: number, vz: number): { dist: number; idx: number } => {
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let b = 0; b < bucketCount; b++) {
        const i = Math.min(b * BUCKET_SIZE, clLen - 1);
        const dx = clX[i] - vx;
        const dz = clZ[i] - vz;
        const d = dx * dx + dz * dz;
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const lo = Math.max(0, bestIdx - BUCKET_SIZE);
      const hi = Math.min(clLen - 1, bestIdx + BUCKET_SIZE);
      for (let i = lo; i <= hi; i++) {
        const dx = clX[i] - vx;
        const dz = clZ[i] - vz;
        const d = dx * dx + dz * dz;
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      return { dist: Math.sqrt(bestDist), idx: bestIdx };
    };

    const colors = new Float32Array(vertCount * 3);
    const tempColor = new THREE.Color();

    for (let v = 0; v < vertCount; v++) {
      const vx = posAttr.getX(v) + (xMin + xMax) / 2;
      const vz = posAttr.getZ(v) + (zMin + zMax) / 2;

      posAttr.setX(v, vx);
      posAttr.setZ(v, vz);

      const { dist, idx } = findNearest(vx, vz);
      const nearestTrackY = clElev[idx];

      let terrainY: number;

      if (dist < TRACK_HALF_WIDTH) {
        terrainY = nearestTrackY - 80;
      } else if (dist < FALLOFF_RADIUS) {
        const factor = smoothstep(FALLOFF_RADIUS, TRACK_HALF_WIDTH, dist);
        terrainY = nearestTrackY * factor;
        terrainY = Math.min(terrainY, nearestTrackY - TRACK_CLEARANCE);
      } else {
        terrainY = 0;
      }

      if (terrainY >= nearestTrackY - TRACK_CLEARANCE) {
        terrainY = nearestTrackY - TRACK_CLEARANCE;
      }

      terrainY += Math.sin(vx * 0.008) * 5 + Math.sin(vz * 0.012) * 4;
      if (terrainY >= nearestTrackY - TRACK_CLEARANCE) {
        terrainY = nearestTrackY - TRACK_CLEARANCE;
      }

      posAttr.setY(v, terrainY);

      const heightNorm = Math.max(0, Math.min(1, (terrainY - elevMin) / elevRange));
      tempColor.copy(TERRAIN_COLOR_LOW).lerp(TERRAIN_COLOR_HIGH, heightNorm);

      if (dist < FALLOFF_RADIUS) {
        const sector = clSector[idx];
        const tint = SECTOR_TINTS[sector];
        if (tint) {
          const tintStrength = 0.05 * (1 - dist / FALLOFF_RADIUS);
          tempColor.lerp(tint, tintStrength);
        }
      }

      colors[v * 3] = tempColor.r;
      colors[v * 3 + 1] = tempColor.g;
      colors[v * 3 + 2] = tempColor.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, material);
    this.group.add(mesh);

    const grid = new THREE.GridHelper(
      Math.max(width, depth) * 1.2, 60, 0x151525, 0x0c0c1a
    );
    grid.position.set((xMin + xMax) / 2, -0.1, (zMin + zMax) / 2);
    this.group.add(grid);

    return this.group;
  }

  buildEmbankments(
    trackData: TrackGeometryData,
    getElevation: (i: number) => number,
  ): void {
    const numPoints = Math.min(trackData.inner_x.length, trackData.outer_x.length);
    if (numPoints < 2) return;

    const THRESHOLD = 20;
    const step = Math.max(1, Math.floor(numPoints / 200));

    const innerVerts: number[] = [];
    const outerVerts: number[] = [];
    const innerIndices: number[] = [];
    const outerIndices: number[] = [];

    let innerCount = 0;
    let outerCount = 0;

    let prevInnerTrackY = 0;
    let prevInnerTerrainY = 0;
    let prevInnerX = 0;
    let prevInnerZ = 0;
    let hasPrevInner = false;

    for (let i = 0; i < numPoints; i += step) {
      const trackY = getElevation(i);
      const terrainY = trackY - 80;
      const gap = trackY - terrainY;

      const ix = trackData.inner_x[i];
      const iz = trackData.inner_y[i];

      if (gap > THRESHOLD && hasPrevInner) {
        const baseIdx = innerCount;
        innerVerts.push(
          prevInnerX, prevInnerTrackY, prevInnerZ,
          prevInnerX, prevInnerTerrainY, prevInnerZ,
          ix, trackY, iz,
          ix, terrainY, iz,
        );
        innerIndices.push(
          baseIdx, baseIdx + 1, baseIdx + 2,
          baseIdx + 1, baseIdx + 3, baseIdx + 2,
        );
        innerCount += 4;
      }

      prevInnerTrackY = trackY;
      prevInnerTerrainY = terrainY;
      prevInnerX = ix;
      prevInnerZ = iz;
      hasPrevInner = true;
    }

    let prevOuterTrackY = 0;
    let prevOuterTerrainY = 0;
    let prevOuterX = 0;
    let prevOuterZ = 0;
    let hasPrevOuter = false;

    for (let i = 0; i < numPoints; i += step) {
      const trackY = getElevation(i);
      const terrainY = trackY - 80;
      const gap = trackY - terrainY;

      const ox = trackData.outer_x[i];
      const oz = trackData.outer_y[i];

      if (gap > THRESHOLD && hasPrevOuter) {
        const baseIdx = outerCount;
        outerVerts.push(
          prevOuterX, prevOuterTrackY, prevOuterZ,
          prevOuterX, prevOuterTerrainY, prevOuterZ,
          ox, trackY, oz,
          ox, terrainY, oz,
        );
        outerIndices.push(
          baseIdx, baseIdx + 2, baseIdx + 1,
          baseIdx + 1, baseIdx + 2, baseIdx + 3,
        );
        outerCount += 4;
      }

      prevOuterTrackY = trackY;
      prevOuterTerrainY = terrainY;
      prevOuterX = ox;
      prevOuterZ = oz;
      hasPrevOuter = true;
    }

    const embankmentMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a30,
      emissive: 0x1a1a30,
      emissiveIntensity: 0.05,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.05,
    });

    if (innerVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(innerVerts, 3));
      geo.setIndex(innerIndices);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, embankmentMat));
    }

    if (outerVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(outerVerts, 3));
      geo.setIndex(outerIndices);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, embankmentMat.clone()));
    }
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) {
          obj.material.dispose();
        }
      }
    });
    this.group.clear();
  }
}
