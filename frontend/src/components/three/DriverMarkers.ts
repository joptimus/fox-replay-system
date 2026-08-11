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
  private appliedColors: Map<string, number> = new Map();
  private hitTargets: THREE.Mesh[] = [];
  private driverRefs: Map<string, { pointLight: THREE.PointLight; materials: THREE.MeshStandardMaterial[] }> = new Map();
  private selectedFlags: Map<string, boolean> = new Map();
  private pickedThisFrame = false;
  private lastPickResult: string | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Pre-load car model
    loadCarModel(() => {
      // Create car meshes for any drivers that were added before model loaded
      for (const [code, { color }] of this.pendingDrivers.entries()) {
        const existing = this.meshes.get(code);
        if (existing) {
          // Reset group state before upgrading — sphere phase may have accumulated rotation
          existing.rotation.set(0, 0, 0);
          this.prevHeadings.delete(code);
          this.prevPositions.delete(code);
          this.upgradeToCarModel(existing, color, code);
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
    const materials: THREE.MeshStandardMaterial[] = [];

    if (_carModelTemplate) {
      const car = _carModelTemplate.clone(true);
      car.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = (child.material as THREE.MeshStandardMaterial).clone();
          mat.color.copy(color);
          mat.emissive.copy(color);
          mat.emissiveIntensity = 0.5;
          child.material = mat;
          // Geometry is shared with the GLTF template — never dispose per driver
          child.userData.sharedGeometry = true;
          materials.push(mat);
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
      materials.push(sphereMaterial);
      this.pendingDrivers.set(code, { hexColor, color: color.clone() });
    }

    const pointLight = new THREE.PointLight(hexColor, 0.5, 500);
    pointLight.position.set(0, 30, 0);
    group.add(pointLight);

    this.driverRefs.set(code, { pointLight, materials });

    // Invisible hit target sphere for easier clicking/hovering
    const hitGeo = new THREE.SphereGeometry(150, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitSphere = new THREE.Mesh(hitGeo, hitMat);
    hitSphere.userData.isHitTarget = true;
    hitSphere.userData.code = code;
    group.add(hitSphere);
    this.hitTargets.push(hitSphere);

    return group;
  }

  private upgradeToCarModel(group: THREE.Group, color: THREE.Color, code: string): void {
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
    const materials: THREE.MeshStandardMaterial[] = [];
    const car = _carModelTemplate.clone(true);
    car.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = (child.material as THREE.MeshStandardMaterial).clone();
        mat.color.copy(color);
        mat.emissive.copy(color);
        mat.emissiveIntensity = 0.5;
        child.material = mat;
        // Geometry is shared with the GLTF template — never dispose per driver
        child.userData.sharedGeometry = true;
        materials.push(mat);
      }
    });
    car.scale.set(200, 200, 200);
    car.userData.isCar = true;
    group.add(car);

    const refs = this.driverRefs.get(code);
    if (refs) refs.materials = materials;
  }

  update(
    frame: FrameData,
    selectedDriver: SelectedDriver | null,
    driverColors: Record<string, [number, number, number]> | undefined
  ): void {
    this.meshes.forEach((group, code) => {
      if (!frame.drivers[code]) {
        this.removeDriver(code, group);
      }
    });

    const time = performance.now() / 1000;

    for (const [code, driver] of Object.entries(frame.drivers)) {
      const isRetired = driver.status === "Retired" || driver.status === "DNF";

      if (isRetired) {
        const existing = this.meshes.get(code);
        if (existing) {
          this.removeDriver(code, existing);
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
        this.appliedColors.set(code, hexColor);
      } else if (this.appliedColors.get(code) !== hexColor) {
        // Color changed (e.g. driverColors arrived after initial creation) — update materials
        const color = new THREE.Color(hexColor);
        const refs = this.driverRefs.get(code);
        if (refs) {
          for (const mat of refs.materials) {
            mat.color.copy(color);
            mat.emissive.copy(color);
          }
          refs.pointLight.color.set(hexColor);
        }
        this.appliedColors.set(code, hexColor);
      }

      // Set target position (interpolation happens in interpolate())
      const elev = this.trackGeometry?.getElevationAt(driver.x, driver.y) ?? 0;
      let target = this.targetPositions.get(code);
      if (!target) {
        target = new THREE.Vector3();
        this.targetPositions.set(code, target);
      }
      target.set(driver.x, elev + 50, driver.y);

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
        prev.x = driver.x;
        prev.z = driver.y;
      } else {
        this.prevPositions.set(code, { x: driver.x, z: driver.y });
      }

      const isSelected = code === selectedDriver?.code;
      const wasSelected = this.selectedFlags.get(code) ?? false;
      const refs = this.driverRefs.get(code);

      if (isSelected) {
        const scalePulse = 1.0 + Math.sin(time * 4) * 0.1;
        group.scale.set(scalePulse, scalePulse, scalePulse);
        if (refs) {
          if (!wasSelected) refs.pointLight.intensity = 0.8;
          // Boost emissive on car meshes (animated, so written every frame while selected)
          const emissive = 0.9 + Math.sin(time * 6) * 0.2;
          for (const mat of refs.materials) {
            mat.emissiveIntensity = emissive;
          }
        }
      } else if (wasSelected) {
        group.scale.set(1.0, 1.0, 1.0);
        if (refs) {
          refs.pointLight.intensity = 0.5;
          for (const mat of refs.materials) {
            mat.emissiveIntensity = 0.5;
          }
        }
      }
      this.selectedFlags.set(code, isSelected);
    }
  }

  /** Run every render frame to smoothly interpolate position and heading */
  interpolate(): void {
    // New animation frame — allow the next pointermove to run a fresh hover raycast
    this.pickedThisFrame = false;

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
    // Throttle hover raycasting to at most once per animation frame — extra
    // pointermove events between frames reuse the last result. Clicks always
    // get a fresh raycast.
    if (event.type === "pointermove" && this.pickedThisFrame) {
      return this.lastPickResult;
    }

    const rect = domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.mouse.x = (x / rect.width) * 2 - 1;
    this.mouse.y = -(y / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);

    // Raycast only the flat list of invisible hit spheres (non-recursive) —
    // each carries its driver code in userData for direct hit-to-code mapping.
    const intersects = this.raycaster.intersectObjects(this.hitTargets, false);
    const result = intersects.length > 0
      ? ((intersects[0].object.userData.code as string) ?? null)
      : null;

    this.pickedThisFrame = true;
    this.lastPickResult = result;
    return result;
  }

  getDriverObject(code: string): THREE.Object3D | null {
    return this.meshes.get(code) || null;
  }

  dispose(): void {
    this.setHovered(null);
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
    this.appliedColors.clear();
    this.driverRefs.clear();
    this.selectedFlags.clear();
    this.hitTargets = [];
    this.lastPickResult = null;

    // Dispose the shared GLTF template geometry/materials once on unmount.
    // (If a new instance mounts later, Three.js re-uploads buffers lazily.)
    if (_carModelTemplate) {
      _carModelTemplate.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }
  }

  /** Remove a single driver, disposing only resources uniquely owned by it. */
  private removeDriver(code: string, group: THREE.Group): void {
    if (this.hoveredCode === code) {
      this.setHovered(null);
    }
    this.scene.remove(group);
    this.disposeGroup(group);
    this.meshes.delete(code);
    this.appliedColors.delete(code);
    this.driverRefs.delete(code);
    this.selectedFlags.delete(code);
    this.pendingDrivers.delete(code);
    this.prevPositions.delete(code);
    this.prevHeadings.delete(code);
    this.smoothedPositions.delete(code);
    this.smoothedHeadings.delete(code);
    this.targetPositions.delete(code);
    this.targetHeadings.delete(code);
    this.hitTargets = this.hitTargets.filter((m) => m.userData.code !== code);
    if (this.lastPickResult === code) this.lastPickResult = null;
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Car geometry is shared across all drivers (cloned from the GLTF
        // template) — only dispose geometry this driver uniquely owns.
        if (!child.userData.sharedGeometry) {
          child.geometry.dispose();
        }
        // Materials are always cloned per driver — safe to dispose.
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }
}
