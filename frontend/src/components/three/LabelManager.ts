import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { SelectedDriver, SectorId } from '../../types';
import { getTeamLogoPath } from '../../utils/teamLogoMap';

const SECTOR_COLORS: Record<SectorId, string> = {
  1: '#1a8a8a',
  2: '#8a3d6e',
  3: '#6e8a1a',
};

export class LabelManager {
  private css2dRenderer: CSS2DRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private driverLabel: CSS2DObject | null = null;
  private driverAnchor: THREE.Object3D | null = null;
  private sectorLabel: CSS2DObject | null = null;
  private sectorAnchor: THREE.Object3D | null = null;
  private positionSpan: HTMLSpanElement | null = null;

  constructor(
    _renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(container.clientWidth, container.clientHeight);
    this.css2dRenderer.domElement.style.position = 'absolute';
    this.css2dRenderer.domElement.style.top = '0';
    this.css2dRenderer.domElement.style.left = '0';
    this.css2dRenderer.domElement.style.pointerEvents = 'none';
    this.css2dRenderer.domElement.style.zIndex = '2';
    container.appendChild(this.css2dRenderer.domElement);
  }

  attachDriverLabel(
    driver: SelectedDriver | null,
    anchor: THREE.Object3D | null,
    driverTeams?: Record<string, string>,
  ): void {
    if (this.driverLabel && this.driverAnchor) {
      this.driverAnchor.remove(this.driverLabel);
    }
    this.driverLabel = null;
    this.driverAnchor = null;
    this.positionSpan = null;

    if (!driver || !anchor) return;

    const teamColor = `rgb(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]})`;

    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '6px';
    div.style.padding = '4px 10px';
    div.style.background = 'rgba(8,8,16,0.85)';
    div.style.border = `1px solid rgba(${driver.color[0]}, ${driver.color[1]}, ${driver.color[2]}, 0.3)`;
    div.style.borderRadius = '5px';
    div.style.fontFamily = "'Share Tech Mono', monospace";
    div.style.fontSize = '11px';
    div.style.color = '#ffffff';
    div.style.whiteSpace = 'nowrap';

    const posSpan = document.createElement('span');
    posSpan.style.color = teamColor;
    posSpan.style.fontWeight = 'bold';
    posSpan.textContent = `P${driver.data.position}`;
    this.positionSpan = posSpan;

    const sepSpan = document.createElement('span');
    sepSpan.style.opacity = '0.4';
    sepSpan.textContent = '\u2014';

    const codeSpan = document.createElement('span');
    codeSpan.style.fontWeight = 'bold';
    codeSpan.textContent = driver.code;

    div.appendChild(posSpan);
    div.appendChild(sepSpan);
    div.appendChild(codeSpan);

    const teamName = driverTeams?.[driver.code];
    const logoPath = getTeamLogoPath(teamName);
    if (logoPath) {
      const img = document.createElement('img');
      img.src = logoPath;
      img.style.height = '14px';
      img.style.width = 'auto';
      img.onerror = () => { img.style.display = 'none'; };
      div.appendChild(img);
    }

    const labelObj = new CSS2DObject(div);
    labelObj.position.set(0, 120, 0);
    labelObj.center.set(0.5, 1);

    anchor.add(labelObj);
    this.driverLabel = labelObj;
    this.driverAnchor = anchor;
  }

  updateDriverLabelContent(driver: SelectedDriver): void {
    if (this.positionSpan) {
      this.positionSpan.textContent = `P${driver.data.position}`;
    }
  }

  showSectorLabel(sectorId: SectorId | null, position: THREE.Vector3): void {
    if (this.sectorLabel && this.sectorAnchor) {
      this.scene.remove(this.sectorAnchor);
    }
    this.sectorLabel = null;
    this.sectorAnchor = null;

    if (!sectorId) return;

    const color = SECTOR_COLORS[sectorId];

    const div = document.createElement('div');
    div.style.fontFamily = "'Share Tech Mono', monospace";
    div.style.fontSize = '11px';
    div.style.fontWeight = '600';
    div.style.color = color;
    div.style.padding = '3px 8px';
    div.style.border = `1px solid ${color}33`;
    div.style.background = `${color}14`;
    div.style.borderRadius = '4px';
    div.style.whiteSpace = 'nowrap';
    div.textContent = `S${sectorId}`;

    const labelObj = new CSS2DObject(div);
    labelObj.center.set(0.5, 0.5);

    const anchorObj = new THREE.Object3D();
    anchorObj.position.copy(position);
    anchorObj.add(labelObj);
    this.scene.add(anchorObj);

    this.sectorLabel = labelObj;
    this.sectorAnchor = anchorObj;
  }

  clearAll(): void {
    if (this.driverLabel && this.driverAnchor) {
      this.driverAnchor.remove(this.driverLabel);
    }
    this.driverLabel = null;
    this.driverAnchor = null;
    this.positionSpan = null;

    if (this.sectorLabel && this.sectorAnchor) {
      this.scene.remove(this.sectorAnchor);
    }
    this.sectorLabel = null;
    this.sectorAnchor = null;
  }

  onResize(container: HTMLElement): void {
    this.css2dRenderer.setSize(container.clientWidth, container.clientHeight);
  }

  render(): void {
    this.css2dRenderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.clearAll();
    this.css2dRenderer.domElement.parentElement?.removeChild(
      this.css2dRenderer.domElement,
    );
  }
}
