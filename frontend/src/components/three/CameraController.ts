import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;
  private defaultPosition = new THREE.Vector3();
  private defaultTarget = new THREE.Vector3();
  private defaultDistance = 10000;

  private animating = false;
  private animStartTime = 0;
  private animDuration = 1000;
  private animStartPos = new THREE.Vector3();
  private animEndPos = new THREE.Vector3();
  private animStartTarget = new THREE.Vector3();
  private animEndTarget = new THREE.Vector3();

  constructor(
    renderer: THREE.WebGLRenderer,
    container: HTMLElement,
  ) {
    this.container = container;

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      10,
      200000,
    );

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(40);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
    this.controls.minDistance = 500;
    this.controls.maxDistance = 50000;

    this.controls.addEventListener('start', () => {
      this.animating = false;
    });
  }

  setInitialView(trackCenter: THREE.Vector3, trackBounds: THREE.Box3): void {
    const size = new THREE.Vector3();
    trackBounds.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.1;

    const polarAngle = THREE.MathUtils.degToRad(60);
    const offset = new THREE.Vector3(
      Math.sin(polarAngle) * distance,
      Math.cos(polarAngle) * distance,
      0,
    );

    this.camera.position.copy(trackCenter).add(offset);
    this.controls.target.copy(trackCenter);
    this.controls.maxDistance = distance * 2;
    this.controls.update();

    this.defaultPosition.copy(this.camera.position);
    this.defaultTarget.copy(trackCenter);
    this.defaultDistance = distance;
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
    this.camera.aspect =
      this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    if (this.animating) {
      const elapsed = performance.now() - this.animStartTime;
      let t = Math.min(elapsed / this.animDuration, 1);
      t = t * t * (3 - 2 * t);

      this.camera.position.lerpVectors(this.animStartPos, this.animEndPos, t);
      this.controls.target.lerpVectors(
        this.animStartTarget,
        this.animEndTarget,
        t,
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
