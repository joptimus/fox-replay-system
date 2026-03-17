import * as THREE from 'three';
import type { TrackCorner, TrackGeometry as TrackGeometryData, SectorId } from '../../types';

const SECTOR_HIGHLIGHT_COLORS: Record<number, string> = {
  1: '#1a8a8a',
  2: '#8a3d6e',
  3: '#8a7a2e',
};

const DEFAULT_TEXT_COLOR = 'rgba(255, 255, 255, 0.7)';

interface TurnMarkerGroup {
  sprite: THREE.Sprite;
  line: THREE.Line;
  dot: THREE.Mesh;
  position: THREE.Vector3;
  sectorId: number;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  label: string;
}

export class TurnMarkers {
  private group: THREE.Group;
  private markers: TurnMarkerGroup[] = [];
  private highlightedSector: SectorId | null = null;

  constructor() {
    this.group = new THREE.Group();
  }

  build(
    corners: TrackCorner[],
    getElevationAtXY: (x: number, z: number) => number,
    trackData: TrackGeometryData,
    trackHalfWidth: number = 300,
  ): THREE.Group {
    this.dispose();
    this.group = new THREE.Group();

    // Determine which sector each corner belongs to by finding the nearest centerline point
    const clLen = trackData.centerline_x.length;

    for (const corner of corners) {
      const label = `T${corner.number}${corner.letter || ''}`;
      const trackY = getElevationAtXY(corner.x, corner.y);

      // Find nearest centerline index to determine sector
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let i = 0; i < clLen; i += 10) {
        const dx = trackData.centerline_x[i] - corner.x;
        const dz = trackData.centerline_y[i] - corner.y;
        const d = dx * dx + dz * dz;
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      // Refine
      const lo = Math.max(0, bestIdx - 10);
      const hi = Math.min(clLen - 1, bestIdx + 10);
      for (let i = lo; i <= hi; i++) {
        const dx = trackData.centerline_x[i] - corner.x;
        const dz = trackData.centerline_y[i] - corner.y;
        const d = dx * dx + dz * dz;
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const sectorId = trackData.sector?.[bestIdx] ?? 1;

      const offsetDist = trackHalfWidth + 30;
      const angleRad = (corner.angle / 180) * Math.PI;
      const markerX = corner.x + Math.cos(angleRad) * offsetDist;
      const markerZ = corner.y + Math.sin(angleRad) * offsetDist;
      const markerY = trackY + 150;

      // A. Number Badge (Billboard Sprite)
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      this.drawBadge(canvas, label, DEFAULT_TEXT_COLOR);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;

      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(markerX, markerY, markerZ);
      sprite.scale.set(300, 150, 1);
      this.group.add(sprite);

      // B. Connector Line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(corner.x, trackY + 10, corner.y),
        new THREE.Vector3(markerX, markerY - 20, markerZ),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.06,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      this.group.add(line);

      // C. Surface Dot
      const dotGeo = new THREE.CircleGeometry(30, 16);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(corner.x, trackY + 5, corner.y);
      dot.rotation.x = -Math.PI / 2;
      this.group.add(dot);

      this.markers.push({
        sprite,
        line,
        dot,
        position: new THREE.Vector3(markerX, markerY, markerZ),
        sectorId,
        canvas,
        texture,
        label,
      });
    }

    return this.group;
  }

  /** Highlight turn markers in the given sector with the sector color */
  setSectorHighlight(sectorId: SectorId | null): void {
    if (sectorId === this.highlightedSector) return;
    this.highlightedSector = sectorId;

    for (const marker of this.markers) {
      if (sectorId !== null && marker.sectorId === sectorId) {
        // Redraw badge with sector highlight color
        const color = SECTOR_HIGHLIGHT_COLORS[sectorId] || DEFAULT_TEXT_COLOR;
        this.drawBadge(marker.canvas, marker.label, color);
      } else {
        // Restore default
        this.drawBadge(marker.canvas, marker.label, DEFAULT_TEXT_COLOR);
      }
      marker.texture.needsUpdate = true;
    }
  }

  private drawBadge(canvas: HTMLCanvasElement, label: string, textColor: string): void {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 64);

    // Rounded rect background
    const pad = 4;
    const rr = 8;
    const rw = 128 - pad * 2;
    const rh = 64 - pad * 2;
    ctx.fillStyle = 'rgba(10, 10, 20, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + rr, pad);
    ctx.lineTo(pad + rw - rr, pad);
    ctx.arcTo(pad + rw, pad, pad + rw, pad + rr, rr);
    ctx.lineTo(pad + rw, pad + rh - rr);
    ctx.arcTo(pad + rw, pad + rh, pad + rw - rr, pad + rh, rr);
    ctx.lineTo(pad + rr, pad + rh);
    ctx.arcTo(pad, pad + rh, pad, pad + rh - rr, rr);
    ctx.lineTo(pad, pad + rr);
    ctx.arcTo(pad, pad, pad + rr, pad, rr);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = textColor;
    ctx.font = "bold 28px 'Share Tech Mono', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 32);
  }

  updateVisibility(camera: THREE.Camera): void {
    for (const marker of this.markers) {
      const dist = camera.position.distanceTo(marker.position);

      let opacity: number;
      if (dist < 4000) {
        opacity = 1.0;
      } else if (dist < 12000) {
        opacity = 1.0 - (dist - 4000) / 8000 * 0.8;
      } else {
        opacity = 0.2;
      }

      (marker.sprite.material as THREE.SpriteMaterial).opacity = opacity;
      (marker.line.material as THREE.LineBasicMaterial).opacity = opacity * 0.06;
      (marker.dot.material as THREE.MeshBasicMaterial).opacity = opacity * 0.3;
    }
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  dispose(): void {
    for (const marker of this.markers) {
      marker.sprite.material.dispose();
      (marker.sprite.material as THREE.SpriteMaterial).map?.dispose();
      marker.line.geometry.dispose();
      (marker.line.material as THREE.Material).dispose();
      marker.dot.geometry.dispose();
      (marker.dot.material as THREE.Material).dispose();
    }
    this.markers = [];
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
      }
    });
    this.group.clear();
  }
}
