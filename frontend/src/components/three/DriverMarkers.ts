import * as THREE from "three";
import type { FrameData, SelectedDriver } from "../../types";

export class DriverMarkers {
  private scene: THREE.Scene;
  private meshes: Map<string, THREE.Group> = new Map();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
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
        group = new THREE.Group();

        const color = new THREE.Color(hexColor);

        const sphereGeometry = new THREE.SphereGeometry(80, 32, 32);
        const sphereMaterial = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.7,
          metalness: 0.7,
          roughness: 0.3,
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        group.add(sphere);

        const ringGeometry = new THREE.TorusGeometry(95, 5, 16, 32);
        const ringMaterial = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.3,
          metalness: 0.5,
          roughness: 0.4,
          transparent: true,
          opacity: 0.6,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 3;
        group.add(ring);

        const pointLight = new THREE.PointLight(hexColor, 0.5, 300);
        pointLight.position.set(0, 30, 0);
        group.add(pointLight);

        this.scene.add(group);
        this.meshes.set(code, group);
      }

      group.position.set(driver.x, 50, driver.y);

      const isSelected = code === selectedDriver?.code;
      const mainMaterial = (group.children[0] as THREE.Mesh)
        .material as THREE.MeshStandardMaterial;
      const ringMaterial = (group.children[1] as THREE.Mesh)
        .material as THREE.MeshStandardMaterial;
      const pointLight = group.children[2] as THREE.PointLight;

      if (isSelected) {
        const scalePulse = 1.0 + Math.sin(time * 4) * 0.1;
        const emissivePulse = 0.9 + Math.sin(time * 6) * 0.2;
        mainMaterial.emissiveIntensity = emissivePulse;
        ringMaterial.emissiveIntensity = 0.6;
        ringMaterial.opacity = 0.9;
        group.scale.set(scalePulse, scalePulse, scalePulse);
        pointLight.intensity = 0.8;
      } else {
        mainMaterial.emissiveIntensity = 0.7;
        ringMaterial.emissiveIntensity = 0.3;
        ringMaterial.opacity = 0.6;
        group.scale.set(0.7, 0.7, 0.7);
        pointLight.intensity = 0.5;
      }
    }
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
      if (hit === group || group.children.includes(hit as THREE.Mesh)) {
        return code;
      }
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
  }

  private disposeGroup(group: THREE.Group): void {
    group.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }
}
