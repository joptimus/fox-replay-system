import * as THREE from "three";
import type { TrackGeometry as TrackGeometryData, SectorId } from "../../types";
import type { SectorBoundaryIndices } from "./TrackGeometry";

const SECTOR_COLORS: Record<SectorId, number> = {
  1: 0x1a8a8a,
  2: 0x8a3d6e,
  3: 0x8a7a2e,
};

export class SectorInteraction {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private container: HTMLElement;
  private raycaster: THREE.Raycaster;
  private meshes: Map<SectorId, THREE.Mesh> = new Map();
  private highlightedSector: SectorId | null = null;

  constructor(scene: THREE.Scene, camera: THREE.Camera, container: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.raycaster = new THREE.Raycaster();
  }

  build(trackData: TrackGeometryData, boundaries: SectorBoundaryIndices): void {
    this.dispose();

    const totalPoints = trackData.inner_x.length;
    const ranges: [SectorId, number, number][] = [
      [1, 0, boundaries.s1],
      [2, boundaries.s1, boundaries.s2],
      [3, boundaries.s2, totalPoints],
    ];

    for (const [sectorId, start, end] of ranges) {
      const mesh = this.buildSectorMesh(trackData, start, end, sectorId);
      this.meshes.set(sectorId, mesh);
      this.scene.add(mesh);
    }
  }

  private buildSectorMesh(
    trackData: TrackGeometryData,
    startIdx: number,
    endIdx: number,
    sectorId: SectorId
  ): THREE.Mesh {
    const count = endIdx - startIdx;
    if (count < 2) {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.sectorId = sectorId;
      mesh.visible = false;
      return mesh;
    }

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = startIdx; i < endIdx; i++) {
      vertices.push(trackData.inner_x[i], 5, trackData.inner_y[i]);
      vertices.push(trackData.outer_x[i], 5, trackData.outer_y[i]);
    }

    for (let i = 0; i < count - 1; i++) {
      const innerCurr = i * 2;
      const outerCurr = i * 2 + 1;
      const innerNext = (i + 1) * 2;
      const outerNext = (i + 1) * 2 + 1;

      indices.push(innerCurr, outerCurr, innerNext);
      indices.push(outerCurr, outerNext, innerNext);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      color: SECTOR_COLORS[sectorId],
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.sectorId = sectorId;
    mesh.visible = false;

    return mesh;
  }

  private raycastSector(event: PointerEvent): SectorId | null {
    const rect = this.container.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const meshArray: THREE.Mesh[] = [];
    for (const mesh of this.meshes.values()) {
      mesh.visible = true;
      meshArray.push(mesh);
    }

    let intersects: THREE.Intersection[];
    try {
      intersects = this.raycaster.intersectObjects(meshArray, false);
    } finally {
      for (const mesh of this.meshes.values()) {
        mesh.visible = false;
      }
    }

    if (intersects.length > 0) {
      return intersects[0].object.userData.sectorId as SectorId;
    }

    return null;
  }

  onPointerMove(event: PointerEvent): SectorId | null {
    return this.raycastSector(event);
  }

  onPointerDown(event: PointerEvent): SectorId | null {
    return this.raycastSector(event);
  }

  setHighlight(sectorId: SectorId | null): void {
    if (this.highlightedSector !== null) {
      const prev = this.meshes.get(this.highlightedSector);
      if (prev) {
        (prev.material as THREE.MeshBasicMaterial).opacity = 0;
        prev.visible = false;
      }
    }

    this.highlightedSector = sectorId;

    if (sectorId !== null) {
      const mesh = this.meshes.get(sectorId);
      if (mesh) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.08;
        mat.color.setHex(SECTOR_COLORS[sectorId]);
        mesh.visible = true;
      }
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
    this.highlightedSector = null;
  }
}
