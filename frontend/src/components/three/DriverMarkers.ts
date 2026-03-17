import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FrameData, SelectedDriver } from "../../types";
import type { TrackGeometry } from "./TrackGeometry";

// Shared car model template — loaded once, cloned per driver
let _carModelTemplate: THREE.Group | null = null;
let _carModelLoading = false;
const _carModelCallbacks: ((model: THREE.Group) => void)[] = [];

function loadCarModel(callback: (model: THREE.Group) => void): void {
  if (_carModelTemplate) {
    callback(_carModelTemplate);
    return;
  }
  _carModelCallbacks.push(callback);
  if (_carModelLoading) return;
  _carModelLoading = true;

  const loader = new GLTFLoader();
  loader.load('/f1car.glb', (gltf) => {
    _carModelTemplate = gltf.scene;
    _carModelTemplate.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Replace material with a standard one we can tint
        child.material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.6,
          roughness: 0.3,
        });
      }
    });
    for (const cb of _carModelCallbacks) cb(_carModelTemplate);
    _carModelCallbacks.length = 0;
  }, undefined, () => {
    // On error, fall back — callbacks won't fire, drivers use fallback sphere
    _carModelLoading = false;
  });
}

export class DriverMarkers {
  private scene: THREE.Scene;
  private meshes: Map<string, THREE.Group> = new Map();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2();
  private trackGeometry: TrackGeometry | null = null;
  private pendingDrivers: Map<string, { hexColor: number; color: THREE.Color }> = new Map();
  private prevPositions: Map<string, { x: number; z: number }> = new Map();
  private prevHeadings: Map<string, number> = new Map();
  private smoothedPositions: Map<string, THREE.Vector3> = new Map();
  private smoothedHeadings: Map<string, number> = new Map();
  private targetPositions: Map<string, THREE.Vector3> = new Map();
  private targetHeadings: Map<string, number> = new Map();
  private hoverRing: THREE.Mesh | null = null;
  private hoveredCode: string | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Pre-load car model
    loadCarModel(() => {
      // Create car meshes for any drivers that were added before model loaded
      for (const [code, { hexColor, color }] of this.pendingDrivers.entries()) {
        const existing = this.meshes.get(code);
        if (existing) {
          // Reset group state before upgrading — sphere phase may have accumulated rotation
          existing.rotation.set(0, 0, 0);
          this.prevHeadings.delete(code);
          this.prevPositions.delete(code);
          this.upgradeToCarModel(existing, color, hexColor);
        }
      }
      this.pendingDrivers.clear();
    });
  }

  setTrackGeometry(trackGeometry: TrackGeometry): void {
    this.trackGeometry = trackGeometry;
  }

  private createDriverGroup(color: THREE.Color, hexColor: number, code: string): THREE.Group {
    const group = new THREE.Group();

    if (_carModelTemplate) {
      const car = _carModelTemplate.clone(true);
      car.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = (child.material as THREE.MeshStandardMaterial).clone();
          mat.color.copy(color);
          mat.emissive.copy(color);
          mat.emissiveIntensity = 0.5;
          child.material = mat;
        }
      });
      // 1 Blender unit = 1 car length. Scale to 56 track units (5.6m in 1/10m)
      car.scale.set(200, 200, 200);
      car.userData.isCar = true;
      group.add(car);
    } else {
      // Fallback sphere while model loads
      const sphereGeometry = new THREE.SphereGeometry(40, 16, 16);
      const sphereMaterial = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.7,
        metalness: 0.7,
        roughness: 0.3,
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.userData.isFallback = true;
      group.add(sphere);
      this.pendingDrivers.set(code, { hexColor, color: color.clone() });
    }

    const pointLight = new THREE.PointLight(hexColor, 0.5, 500);
    pointLight.position.set(0, 30, 0);
    group.add(pointLight);

    // Invisible hit target sphere for easier clicking/hovering
    const hitGeo = new THREE.SphereGeometry(150, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitSphere = new THREE.Mesh(hitGeo, hitMat);
    hitSphere.userData.isHitTarget = true;
    group.add(hitSphere);

    return group;
  }

  private upgradeToCarModel(group: THREE.Group, color: THREE.Color, _hexColor: number): void {
    if (!_carModelTemplate) return;

    // Remove fallback sphere
    const toRemove: THREE.Object3D[] = [];
    group.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.userData.isFallback) {
        toRemove.push(child);
      }
    });
    for (const obj of toRemove) {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
      group.remove(obj);
    }

    // Add car model
    const car = _carModelTemplate.clone(true);
    car.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = (child.material as THREE.MeshStandardMaterial).clone();
        mat.color.copy(color);
        mat.emissive.copy(color);
        mat.emissiveIntensity = 0.5;
        child.material = mat;
      }
    });
    car.scale.set(200, 200, 200);
    car.userData.isCar = true;
    group.add(car);
  }

  update(
    frame: FrameData,
    selectedDriver: SelectedDriver | null,
    driverColors: Record<string, [number, number, number]> | undefined
  ): void {
    this.meshes.forEach((group, code) => {
      if (!frame.drivers[code]) {
        this.scene.remove(group);
        this.disposeGroup(group);
        this.meshes.delete(code);
      }
    });

    const time = performance.now() / 1000;

    for (const [code, driver] of Object.entries(frame.drivers)) {
      const isRetired =
        driver.status === "Retired" ||
        driver.status === "DNF" ||
        driver.rel_dist >= 0.99;

      if (isRetired) {
        const existing = this.meshes.get(code);
        if (existing) {
          this.scene.remove(existing);
          this.disposeGroup(existing);
          this.meshes.delete(code);
        }
        continue;
      }

      const teamColor = driverColors?.[code] || [220, 38, 38];
      const hexColor =
        (teamColor[0] << 16) | (teamColor[1] << 8) | teamColor[2];

      let group = this.meshes.get(code);

      if (!group) {
        const color = new THREE.Color(hexColor);
        group = this.createDriverGroup(color, hexColor, code);
        this.scene.add(group);
        this.meshes.set(code, group);
      }

      // Set target position (interpolation happens in interpolate())
      const elev = this.trackGeometry?.getElevationAt(driver.x, driver.y) ?? 0;
      this.targetPositions.set(code, new THREE.Vector3(driver.x, elev + 50, driver.y));

      // Initialize smoothed position if first time
      if (!this.smoothedPositions.has(code)) {
        this.smoothedPositions.set(code, new THREE.Vector3(driver.x, elev + 50, driver.y));
        group.position.set(driver.x, elev + 50, driver.y);
      }

      // Compute target heading from position delta
      const prev = this.prevPositions.get(code);
      if (prev) {
        const dx = driver.x - prev.x;
        const dz = driver.y - prev.z;
        if (dx * dx + dz * dz > 1) {
          const heading = Math.atan2(dx, dz);
          this.targetHeadings.set(code, heading);
          if (!this.smoothedHeadings.has(code)) {
            this.smoothedHeadings.set(code, heading);
          }
        }
      }
      this.prevPositions.set(code, { x: driver.x, z: driver.y });

      const isSelected = code === selectedDriver?.code;

      // Find car sub-group and point light
      const pointLight = group.children.find(c => c instanceof THREE.PointLight) as THREE.PointLight | undefined;

      if (isSelected) {
        const scalePulse = 1.0 + Math.sin(time * 4) * 0.1;
        group.scale.set(scalePulse, scalePulse, scalePulse);
        if (pointLight) pointLight.intensity = 0.8;
        // Boost emissive on car meshes
        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissiveIntensity = 0.9 + Math.sin(time * 6) * 0.2;
          }
        });
      } else {
        group.scale.set(1.0, 1.0, 1.0);
        if (pointLight) pointLight.intensity = 0.5;
        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissiveIntensity = 0.5;
          }
        });
      }
    }
  }

  /** Run every render frame to smoothly interpolate position and heading */
  interpolate(): void {
    const POS_LERP = 0.07;
    const HDG_LERP = 0.06;

    for (const [code, group] of this.meshes.entries()) {
      // Smooth position
      const target = this.targetPositions.get(code);
      const smoothed = this.smoothedPositions.get(code);
      if (target && smoothed) {
        smoothed.lerp(target, POS_LERP);
        group.position.copy(smoothed);
      }

      // Smooth heading
      const targetH = this.targetHeadings.get(code);
      const currentH = this.smoothedHeadings.get(code);
      if (targetH !== undefined && currentH !== undefined) {
        let delta = targetH - currentH;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const newH = currentH + delta * HDG_LERP;
        this.smoothedHeadings.set(code, newH);
        group.rotation.set(0, newH, 0);
      }
    }

    // Animate hover ring pulse
    if (this.hoverRing) {
      const t = performance.now() / 1000;
      const pulse = 0.4 + Math.sin(t * 4) * 0.2; // opacity pulses 0.2 — 0.6
      const scale = 1.0 + Math.sin(t * 3) * 0.08; // subtle scale pulse
      (this.hoverRing.material as THREE.MeshStandardMaterial).opacity = pulse;
      (this.hoverRing.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + Math.sin(t * 5) * 0.4;
      this.hoverRing.scale.set(scale, scale, 1);
    }
  }

  /** Show/hide hover ring on a driver */
  setHovered(code: string | null, driverColors?: Record<string, [number, number, number]>): void {
    if (code === this.hoveredCode) return;

    // Remove old ring
    if (this.hoverRing) {
      this.hoverRing.geometry.dispose();
      (this.hoverRing.material as THREE.Material).dispose();
      this.hoverRing.parent?.remove(this.hoverRing);
      this.hoverRing = null;
    }
    this.hoveredCode = code;

    if (!code) return;

    const group = this.meshes.get(code);
    if (!group) return;

    // Use team color for the ring
    const teamColor = driverColors?.[code] || [255, 255, 255];
    const hexColor = (teamColor[0] << 16) | (teamColor[1] << 8) | teamColor[2];
    const color = new THREE.Color(hexColor);

    const ringGeo = new THREE.RingGeometry(180, 210, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      roughness: 0.3,
      metalness: 0.5,
    });
    this.hoverRing = new THREE.Mesh(ringGeo, ringMat);
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.position.y = -40;
    group.add(this.hoverRing);
  }

  getHoveredCode(): string | null {
    return this.hoveredCode;
  }

  pick(
    event: MouseEvent,
    camera: THREE.Camera,
    domElement: HTMLElement
  ): string | null {
    const rect = domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.mouse.x = (x / rect.width) * 2 - 1;
    this.mouse.y = -(y / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);

    const groupsArray = Array.from(this.meshes.values());
    const intersects = this.raycaster.intersectObjects(groupsArray, true);

    if (intersects.length === 0) return null;

    const hit = intersects[0].object;
    for (const [code, group] of this.meshes.entries()) {
      let found = false;
      group.traverse((child) => {
        if (child === hit) found = true;
      });
      if (found) return code;
    }

    return null;
  }

  getDriverObject(code: string): THREE.Object3D | null {
    return this.meshes.get(code) || null;
  }

  dispose(): void {
    this.meshes.forEach((group) => {
      this.scene.remove(group);
      this.disposeGroup(group);
    });
    this.meshes.clear();
    this.pendingDrivers.clear();
    this.prevPositions.clear();
    this.prevHeadings.clear();
    this.smoothedPositions.clear();
    this.smoothedHeadings.clear();
    this.targetPositions.clear();
    this.targetHeadings.clear();
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }
}
