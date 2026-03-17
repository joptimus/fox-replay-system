import * as THREE from 'three';

export class SceneSetup {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080810);
    this.scene.fog = new THREE.FogExp2(0x080810, 0.000018);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x080810, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.zIndex = '1';
    container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404055, 0.9);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(12, 15, 8);
    this.scene.add(directionalLight);

    const redFill = new THREE.PointLight(0xe63946, 0.15, 30000);
    redFill.position.set(-8000, 2000, -5000);
    this.scene.add(redFill);

    const blueFill = new THREE.PointLight(0x3671c6, 0.10, 30000);
    blueFill.position.set(8000, 2000, 5000);
    this.scene.add(blueFill);
  }

  onResize(container: HTMLElement): void {
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  dispose(): void {
    const canvas = this.renderer.domElement;
    this.renderer.dispose();
    canvas.parentElement?.removeChild(canvas);
  }
}
