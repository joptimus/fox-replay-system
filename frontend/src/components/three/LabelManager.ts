import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { SelectedDriver, SectorId } from '../../types';
import { getTeamLogoPath } from '../../utils/teamLogoMap';

const SECTOR_COLORS: Record<SectorId, string> = {
  1: '#1a8a8a',
  2: '#8a3d6e',
  3: '#8a7a2e',
};

function createBadge(
  colorRgb: [number, number, number],
  posText: string | null,
  code: string,
  teamName?: string,
): HTMLDivElement {
  const div = document.createElement('div');
  Object.assign(div.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: 'rgba(8,8,16,0.85)',
    border: `1px solid rgba(${colorRgb[0]}, ${colorRgb[1]}, ${colorRgb[2]}, 0.3)`,
    borderRadius: '5px',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: '11px',
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'visible',
    lineHeight: '1',
  });

  const teamColor = `rgb(${colorRgb[0]}, ${colorRgb[1]}, ${colorRgb[2]})`;

  if (posText) {
    const posSpan = document.createElement('span');
    posSpan.style.color = teamColor;
    posSpan.style.fontWeight = 'bold';
    posSpan.dataset.pos = '1';
    posSpan.textContent = posText;
    div.appendChild(posSpan);

    const sep = document.createElement('span');
    sep.style.opacity = '0.4';
    sep.textContent = '\u2014';
    div.appendChild(sep);
  }

  const codeSpan = document.createElement('span');
  codeSpan.style.fontWeight = 'bold';
  codeSpan.textContent = code;
  div.appendChild(codeSpan);

  const logoPath = getTeamLogoPath(teamName);
  if (logoPath) {
    const img = document.createElement('img');
    img.src = logoPath;
    img.style.height = '14px';
    img.style.width = 'auto';
    img.style.flexShrink = '0';
    img.onerror = () => { img.style.display = 'none'; };
    div.appendChild(img);
  }

  return div;
}

export class LabelManager {
  private css2dRenderer: CSS2DRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private driverLabel: CSS2DObject | null = null;
  private driverAnchor: THREE.Object3D | null = null;
  private sectorLabel: CSS2DObject | null = null;
  private sectorAnchor: THREE.Object3D | null = null;
  private hoverLabel: CSS2DObject | null = null;
  private hoverAnchor: THREE.Object3D | null = null;
  private positionSpan: HTMLSpanElement | null = null;
  private selectedCode: string | null = null;

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
    // Remove existing selected label
    if (this.driverLabel && this.driverAnchor) {
      this.driverLabel.element.remove();
      this.driverAnchor.remove(this.driverLabel);
    }
    this.driverLabel = null;
    this.driverAnchor = null;
    this.positionSpan = null;
    this.selectedCode = driver?.code ?? null;

    // Clear hover label when selecting (avoid duplicates)
    this.removeHoverLabel();

    if (!driver || !anchor) return;

    const div = createBadge(
      driver.color,
      `P${driver.data.position}`,
      driver.code,
      driverTeams?.[driver.code],
    );
    this.positionSpan = div.querySelector('[data-pos]') as HTMLSpanElement;

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

  attachHoverLabel(
    code: string | null,
    anchor: THREE.Object3D | null,
    position: number | null,
    color: [number, number, number] | null,
    driverTeams?: Record<string, string>,
  ): void {
    this.removeHoverLabel();

    if (!code || !anchor || !color) return;

    // Don't show hover if this driver is already selected
    if (code === this.selectedCode) return;

    const div = createBadge(
      color,
      position !== null ? `P${position}` : null,
      code,
      driverTeams?.[code],
    );

    const labelObj = new CSS2DObject(div);
    labelObj.position.set(0, 200, 0);
    labelObj.center.set(0.5, 1);

    anchor.add(labelObj);
    this.hoverLabel = labelObj;
    this.hoverAnchor = anchor;
  }

  private removeHoverLabel(): void {
    if (this.hoverLabel && this.hoverAnchor) {
      this.hoverLabel.element.remove();
      this.hoverAnchor.remove(this.hoverLabel);
    }
    this.hoverLabel = null;
    this.hoverAnchor = null;
  }

  showSectorLabel(sectorId: SectorId | null, position: THREE.Vector3): void {
    if (this.sectorLabel && this.sectorAnchor) {
      this.sectorLabel.element.remove();
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
      this.driverLabel.element.remove();
      this.driverAnchor.remove(this.driverLabel);
    }
    this.driverLabel = null;
    this.driverAnchor = null;
    this.positionSpan = null;
    this.selectedCode = null;

    this.removeHoverLabel();

    if (this.sectorLabel && this.sectorAnchor) {
      this.sectorLabel.element.remove();
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
