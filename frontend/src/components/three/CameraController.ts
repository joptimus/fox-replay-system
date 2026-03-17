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

  // Follow mode state
  private followTarget: THREE.Object3D | null = null;
  private followLerp = 0.08; // smoothing factor
  private followOffset = new THREE.Vector3(0, 400, -800); // behind and above
  private followTransitioning = false;
  private followTransitionStart = 0;
  private followTransitionDuration = 800;
  private followTransitionStartPos = new THREE.Vector3();
  private followTransitionStartTarget = new THREE.Vector3();

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
      // User grabbed controls — exit follow mode and animation
      if (this.followTarget) {
        this.followTarget = null;
        this.followTransitioning = false;
      }
      this.animating = false;
    });
  }

  setInitialView(trackCenter: THREE.Vector3, trackBounds: THREE.Box3): void {
    const size = new THREE.Vector3();
    trackBounds.getSize(size);

    const aspect = this.camera.aspect;
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const trackWidth = size.x;
    const trackDepth = size.z;

    let fitDim: number;
    if (aspect > trackWidth / trackDepth) {
      fitDim = trackDepth;
    } else {
      fitDim = trackWidth / aspect;
    }

    const distance = (fitDim / (2 * Math.tan(fovRad / 2))) * 0.85;

    const polarAngle = THREE.MathUtils.degToRad(55);
    const offset = new THREE.Vector3(
      Math.sin(polarAngle) * distance * 0.3,
      Math.cos(polarAngle) * distance,
      0,
    );

    this.camera.position.copy(trackCenter).add(offset);
    this.controls.target.copy(trackCenter);
    this.controls.maxDistance = distance * 2.5;
    this.controls.update();

    this.defaultPosition.copy(this.camera.position);
    this.defaultTarget.copy(trackCenter);
    this.defaultDistance = distance;
  }

  /** Start following a driver's 3D object — camera smoothly moves behind the car */
  startFollowing(target: THREE.Object3D): void {
    this.followTarget = target;
    this.animating = false;

    // Smooth transition from current camera position to follow position
    this.followTransitioning = true;
    this.followTransitionStart = performance.now();
    this.followTransitionStartPos.copy(this.camera.position);
    this.followTransitionStartTarget.copy(this.controls.target);
  }

  /** Stop following and animate back to overview */
  stopFollowing(): void {
    this.followTarget = null;
    this.followTransitioning = false;
    this.resetToOverview();
  }

  isFollowing(): boolean {
    return this.followTarget !== null;
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
    this.animDuration = 1000;
    this.animating = true;
  }

  onResize(): void {
    this.camera.aspect =
      this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    if (this.followTarget) {
      this.updateFollowMode();
      return;
    }

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

  private updateFollowMode(): void {
    if (!this.followTarget) return;

    const targetPos = this.followTarget.position;

    // Compute "behind the car" offset using the car's rotation
    const worldOffset = this.followOffset.clone();
    worldOffset.applyQuaternion(this.followTarget.quaternion);
    const desiredCamPos = targetPos.clone().add(worldOffset);

    if (this.followTransitioning) {
      // Smooth transition from previous camera position
      const elapsed = performance.now() - this.followTransitionStart;
      let t = Math.min(elapsed / this.followTransitionDuration, 1);
      t = t * t * (3 - 2 * t); // smoothstep

      this.camera.position.lerpVectors(this.followTransitionStartPos, desiredCamPos, t);
      this.controls.target.lerpVectors(this.followTransitionStartTarget, targetPos, t);

      if (t >= 1) {
        this.followTransitioning = false;
      }
    } else {
      // Smooth follow with lerp
      this.camera.position.lerp(desiredCamPos, this.followLerp);
      this.controls.target.lerp(targetPos, this.followLerp);
    }

    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
