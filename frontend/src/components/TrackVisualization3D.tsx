/**
 * 3D Track visualization using Three.js
 * Shows F1 track with driver positions in real-time
 */

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useCurrentFrame, useSelectedDriver, useSessionMetadata, useSectorColors, useReplayStore } from "../store/replayStore";
import { getTeamLogoPath } from "../utils/teamLogoMap";
import { MapSettingsPanel } from "./MapSettingsPanel";
import { Settings } from "lucide-react";

interface SectorBoundary {
  s1: number;
  s2: number;
}

function findSectorBoundaryIndices(sectors: number[] | undefined): SectorBoundary | null {
  if (!sectors || sectors.length === 0) return null;

  let s1Start = 0;
  let s2Start = 0;

  for (let i = 1; i < sectors.length; i++) {
    if (sectors[i] !== sectors[i - 1]) {
      if (s1Start === 0 && sectors[i] === 2) {
        s1Start = i;
      } else if (s2Start === 0 && sectors[i] === 3) {
        s2Start = i;
        break;
      }
    }
  }

  return s1Start > 0 && s2Start > 0 ? { s1: s1Start, s2: s2Start } : null;
}

function calculateSectorCentroid(
  startIdx: number,
  endIdx: number,
  innerX: number[],
  innerY: number[],
  outerX: number[],
  outerY: number[]
): { x: number; y: number } {
  const sectorLength = endIdx - startIdx;

  if (sectorLength <= 0) {
    const idx = Math.min(startIdx, innerX.length - 1);
    return {
      x: (innerX[idx] + outerX[idx]) / 2,
      y: (innerY[idx] + outerY[idx]) / 2
    };
  }

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  const sampleInterval = Math.max(1, Math.floor(sectorLength / 5));

  for (let i = startIdx; i < endIdx; i += sampleInterval) {
    const idx = Math.min(i, innerX.length - 1);
    sumX += (innerX[idx] + outerX[idx]) / 2;
    sumY += (innerY[idx] + outerY[idx]) / 2;
    count++;
  }

  const idx = Math.min(endIdx - 1, innerX.length - 1);
  sumX += (innerX[idx] + outerX[idx]) / 2;
  sumY += (innerY[idx] + outerY[idx]) / 2;
  count++;

  return {
    x: sumX / count,
    y: sumY / count
  };
}

export const TrackVisualization3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const driverMeshesRef = useRef<Map<string, THREE.Mesh | THREE.Group>>(new Map());
  const driverLightsRef = useRef<Map<string, THREE.PointLight>>(new Map());
  const driverLabelsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const sectorLabelsRef = useRef<HTMLDivElement[]>([]);
  const trackMeshRef = useRef<THREE.Mesh | null>(null);
  const trackMaterialColorsRef = useRef<Float32Array | null>(null);
  const sectorBoundaryLinesRef = useRef<THREE.Group | null>(null);
  const rainSegmentsRef = useRef<THREE.LineSegments | null>(null);
  const clockRef = useRef<THREE.Clock | null>(null);
  const noiseRenderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseRef = useRef<THREE.Vector2 | null>(null);
  const initRef = useRef(false);
  const currentFrame = useCurrentFrame();
  const selectedDriver = useSelectedDriver();
  const sessionMetadata = useSessionMetadata();
  const { isEnabled: showSectorColors, toggle: toggleSectorColors } = useSectorColors();
  const { setSelectedDriver } = useReplayStore();
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showWeatherPanel, setShowWeatherPanel] = useState(true);
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>('C');
  const [enableWeatherFx, setEnableWeatherFx] = useState(true);

  // Setup scene and track (only once)
  useEffect(() => {
    if (!containerRef.current) {
      console.log("Container not ready");
      return;
    }

    if (initRef.current) {
      console.log("Scene already initialized");
      return;
    }

try {
  console.log("Initializing Three.js scene...");
  const container = containerRef.current;
  initRef.current = true;

  // Scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080810);
  scene.fog = new THREE.FogExp2(0x080810, 0.000018);
  sceneRef.current = scene;

  // Camera setup (top-down ortho, no movement)
  const width = container.clientWidth;
  const height = container.clientHeight;
  console.log("Container dimensions:", { width, height });

  const camera = new THREE.OrthographicCamera(
    -width / 2, width / 2, height / 2, -height / 2, 0.1, 100000
  );
  camera.position.set(0, 5000, 0);
  camera.lookAt(0, 0, 0);
  cameraRef.current = camera;
  console.log("Orthographic camera created for top-down view");

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x080810, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.zIndex = '1';
  container.appendChild(renderer.domElement);
  rendererRef.current = renderer;
  console.log("Renderer created and appended to DOM", {
    canvasFound: !!renderer.domElement,
    containerHasCanvas: container.querySelector('canvas') !== null
  });

  // Raycaster for driver click detection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  raycasterRef.current = raycaster;
  mouseRef.current = mouse;

  // Lighting — atmospheric setup
  const ambientLight = new THREE.AmbientLight(0x252535, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
  directionalLight.position.set(10, 20, 10);
  scene.add(directionalLight);

  // Subtle colored fill lights for atmosphere
  const redFill = new THREE.PointLight(0xe63946, 0.15, 30000);
  redFill.position.set(-8000, 2000, -5000);
  scene.add(redFill);

  const blueFill = new THREE.PointLight(0x3671C6, 0.10, 30000);
  blueFill.position.set(8000, 2000, 5000);
  scene.add(blueFill);

  // Create noise texture via render target (for rain shaping)
  const noiseRenderTarget = new THREE.WebGLRenderTarget(512, 512);
  noiseRenderTargetRef.current = noiseRenderTarget;

  const noiseScene = new THREE.Scene();
  const noiseCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const noiseShaderMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;

      float N(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      float smoothNoise(vec2 ip) {
        vec2 lv = fract(ip);
        vec2 id = floor(ip);
        lv = lv * lv * (3.0 - 2.0 * lv);
        float bl = N(id);
        float br = N(id + vec2(1.0, 0.0));
        float tl = N(id + vec2(0.0, 1.0));
        float tr = N(id + vec2(1.0, 1.0));
        return mix(mix(bl, br, lv.x), mix(tl, tr, lv.x), lv.y);
      }

      void main() {
        vec2 uv = vUv * 5.0 + time * 0.1;
        float h = smoothNoise(uv);
        h += smoothNoise(uv * 2.0) * 0.5;
        h += smoothNoise(uv * 4.0) * 0.25;
        gl_FragColor = vec4(vec3(h), 1.0);
      }
    `
  });

  const noisePlane = new THREE.PlaneGeometry(2, 2);
  const noiseMesh = new THREE.Mesh(noisePlane, noiseShaderMat);
  noiseScene.add(noiseMesh);

  // Initialize shader-based rain (line segments)
  const gCount = 15000;
  const gPos: number[] = [];
  const gEnds: number[] = [];

  for (let i = 0; i < gCount; i++) {
    const x = THREE.MathUtils.randFloatSpread(15000);
    const y = THREE.MathUtils.randFloat(-100, 500);
    const z = THREE.MathUtils.randFloatSpread(15000);
    const len = THREE.MathUtils.randFloat(150, 300);

    gPos.push(x, y, z, x, y, z);
    gEnds.push(0, len, 1, len);
  }

  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
  rainGeo.setAttribute('gEnds', new THREE.Float32BufferAttribute(gEnds, 2));

  const rainShaderUniforms = {
    time: { value: 0 },
    noiseMap: { value: noiseRenderTarget.texture }
  };

  const rainMat = new THREE.LineBasicMaterial({
    color: 0x3388ff,
    transparent: true,
    opacity: 0.9,
    linewidth: 3,
  });

  (rainMat as any).onBeforeCompile = (shader: any) => {
    Object.assign(shader.uniforms, rainShaderUniforms);
    shader.vertexShader = `
      uniform float time;
      uniform sampler2D noiseMap;
      attribute vec2 gEnds;
      varying float vGEnds;
      varying float vH;
      ${shader.vertexShader}
    `.replace(
      `#include <begin_vertex>`,
      `#include <begin_vertex>
      vec3 pos = position;
      pos.y = -mod(500. - (pos.y - time * 1200.), 600.) + 500.;
      pos.y += gEnds.x * gEnds.y;

      vec2 noiseUv = pos.xz / 1000.0;
      vec4 noiseH = texture2D(noiseMap, noiseUv);
      float h = noiseH.r;
      vH = smoothstep(3.0, 0.0, h);

      transformed = pos;
      vGEnds = gEnds.x;`
    );

    shader.fragmentShader = `
      varying float vGEnds;
      varying float vH;
      ${shader.fragmentShader}
    `.replace(
      `vec4 diffuseColor = vec4( diffuse, opacity );`,
      `float op = 1. - vGEnds;
      op = pow(op, 2.);
      op *= 0.8;

      vec3 col = diffuse;
      col += vH * vec3(0.5, 0.8, 1.0);
      col *= 1. + smoothstep(0.99, 1.0, vH);

      vec4 diffuseColor = vec4( col, op * opacity );`
    );
  };

  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainSegmentsRef.current = rainLines;
  clockRef.current = new THREE.Clock();

  scene.add(rainLines);

  (rainMat as any).rainShaderUniforms = rainShaderUniforms;
  (rainMat as any).noiseShaderMat = noiseShaderMat;

  const handleWindowResize = () => {
    if (!containerRef.current || !renderer) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    if (camera instanceof THREE.OrthographicCamera) {
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener("resize", handleWindowResize);

  const animate = () => {
    requestAnimationFrame(animate);

    if (clockRef.current && rainSegmentsRef.current) {
      const elapsed = clockRef.current.getElapsedTime();

      const rainMat = rainSegmentsRef.current.material as any;
      if (rainMat.rainShaderUniforms) {
        rainMat.rainShaderUniforms.time.value = elapsed;
      }

      noiseShaderMat.uniforms.time.value = elapsed;
      renderer.setRenderTarget(noiseRenderTarget);
      renderer.render(noiseScene, noiseCam);
      renderer.setRenderTarget(null);
    }

    renderer.render(scene, camera);
  };

  animate();

      // Cleanup
      return () => {
        window.removeEventListener("resize", handleWindowResize);
        initRef.current = false;

        // Remove driver labels from DOM
        driverLabelsRef.current.forEach((label) => label.remove());
        driverLabelsRef.current.clear();

        // Remove sector labels from DOM
        sectorLabelsRef.current.forEach((label) => label.remove());
        sectorLabelsRef.current = [];

        // Dispose driver meshes and lights
        driverLightsRef.current.clear();
        driverMeshesRef.current.forEach((mesh) => {
          if (mesh instanceof THREE.Group) {
            mesh.children.forEach((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (child.material instanceof THREE.Material) child.material.dispose();
              }
            });
          } else if (mesh instanceof THREE.Mesh) {
            mesh.geometry?.dispose();
            if (mesh.material instanceof THREE.Material) mesh.material.dispose();
          }
        });
        driverMeshesRef.current.clear();

        // Dispose render targets and renderer
        noiseRenderTargetRef.current?.dispose();
        if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    } catch (error) {
      console.error("Error initializing Three.js scene:", error);
    }
  }, []);

  // Build track geometry when metadata is available
  useEffect(() => {
    if (!sceneRef.current || !sessionMetadata?.track_geometry) {
      console.log("Track geometry not ready:", {
        hasScene: !!sceneRef.current,
        hasGeometry: !!sessionMetadata?.track_geometry,
        metadataKeys: sessionMetadata ? Object.keys(sessionMetadata) : "no metadata"
      });
      return;
    }

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!camera) return;

    const geometry = sessionMetadata.track_geometry;
    console.log("Building track geometry with bounds:", { x_min: geometry.x_min, x_max: geometry.x_max, y_min: geometry.y_min, y_max: geometry.y_max });

    if (!geometry.centerline_x?.length || !geometry.outer_x?.length || !geometry.inner_x?.length) {
      console.error("Track geometry arrays are empty or invalid");
      return;
    }

    const trackGroup = new THREE.Group();

    try {
      if (geometry.centerline_x.length > 1) {
        console.log("Creating track surface mesh");
        const trackGeom = new THREE.BufferGeometry();
        const positions: number[] = [];
        const colors: number[] = [];

        const innerPoints = geometry.inner_x.map((x, i) => ({ x, y: geometry.inner_y[i] }));
        const outerPoints = geometry.outer_x.map((x, i) => ({ x, y: geometry.outer_y[i] }));

        const numPoints = Math.min(innerPoints.length, outerPoints.length);

        // Muted sector colors — subtle tint on dark road surface
        const roadBase = { r: 0.067, g: 0.067, b: 0.094 }; // #111118
        const sectorTints: Record<number, { r: number; g: number; b: number }> = {
          1: { r: 0.102, g: 0.541, b: 0.541 }, // #1a8a8a muted teal
          2: { r: 0.541, g: 0.239, b: 0.431 }, // #8a3d6e muted rose
          3: { r: 0.541, g: 0.478, b: 0.180 }, // #8a7a2e muted gold
        };
        const tintStrength = 0.07; // 7% sector color mixed into road

        for (let i = 0; i < numPoints; i++) {
          positions.push(innerPoints[i].x, 0, innerPoints[i].y);
          positions.push(outerPoints[i].x, 0, outerPoints[i].y);

          let tint = sectorTints[3];
          if (geometry.sector && geometry.sector[i]) {
            const sectorIndex = geometry.sector[i];
            tint = sectorTints[sectorIndex] || sectorTints[3];
          }

          // Blend road base with subtle sector tint
          const r = roadBase.r * (1 - tintStrength) + tint.r * tintStrength;
          const g = roadBase.g * (1 - tintStrength) + tint.g * tintStrength;
          const b = roadBase.b * (1 - tintStrength) + tint.b * tintStrength;

          colors.push(r, g, b);
          colors.push(r, g, b);
        }

        trackGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        trackGeom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

        const indices: number[] = [];
        for (let i = 0; i < numPoints - 1; i++) {
          const a = i * 2;
          const b = a + 1;
          const c = (i + 1) * 2;
          const d = c + 1;

          indices.push(a, c, b);
          indices.push(b, c, d);
        }

        trackGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        trackGeom.computeVertexNormals();

        const trackMaterial = new THREE.MeshStandardMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          roughness: 0.75,
          metalness: 0.2,
        });
        const trackMesh = new THREE.Mesh(trackGeom, trackMaterial);
        trackMesh.position.z = -1;
        trackGroup.add(trackMesh);

        trackMeshRef.current = trackMesh;
        trackMaterialColorsRef.current = new Float32Array(colors);
      }

      if (geometry.outer_x.length > 1) {
        console.log("Creating outer track edge with", geometry.outer_x.length, "points");
        const outerPoints = geometry.outer_x.map((x, i) => new THREE.Vector3(x, 0.5, geometry.outer_y[i]));
        const outerCurve = new THREE.CatmullRomCurve3(outerPoints);
        const tubeGeom = new THREE.TubeGeometry(outerCurve, geometry.outer_x.length - 1, 4, 4, false);
        const tubeMaterial = new THREE.MeshStandardMaterial({
          color: 0x252535,
          emissive: 0x151525,
          emissiveIntensity: 0.3,
          roughness: 0.8,
          metalness: 0.1,
        });
        const outerTube = new THREE.Mesh(tubeGeom, tubeMaterial);
        trackGroup.add(outerTube);
      }

      if (geometry.inner_x.length > 1) {
        console.log("Creating inner track edge with", geometry.inner_x.length, "points");
        const innerPoints = geometry.inner_x.map((x, i) => new THREE.Vector3(x, 0.5, geometry.inner_y[i]));
        const innerCurve = new THREE.CatmullRomCurve3(innerPoints);
        const tubeGeom = new THREE.TubeGeometry(innerCurve, geometry.inner_x.length - 1, 4, 4, false);
        const tubeMaterial = new THREE.MeshStandardMaterial({
          color: 0x252535,
          emissive: 0x151525,
          emissiveIntensity: 0.3,
          roughness: 0.8,
          metalness: 0.1,
        });
        const innerTube = new THREE.Mesh(tubeGeom, tubeMaterial);
        trackGroup.add(innerTube);
      }

      // Ground plane
      const groundGeom = new THREE.PlaneGeometry(60000, 60000);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x080812,
        roughness: 0.95,
        metalness: 0.1,
      });
      const ground = new THREE.Mesh(groundGeom, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -15;
      trackGroup.add(ground);

      // Subtle grid helper
      const gridHelper = new THREE.GridHelper(60000, 60, 0x151525, 0x0c0c1a);
      gridHelper.position.y = -14;
      trackGroup.add(gridHelper);

      // Centerline racing line with sector-colored glow
      if (geometry.centerline_x.length > 1) {
        const sectorLineColors: Record<number, THREE.Color> = {
          1: new THREE.Color(0x1a8a8a),
          2: new THREE.Color(0x8a3d6e),
          3: new THREE.Color(0x8a7a2e),
        };
        const linePositions: number[] = [];
        const lineColors: number[] = [];
        for (let i = 0; i < geometry.centerline_x.length; i++) {
          linePositions.push(geometry.centerline_x[i], 2, geometry.centerline_y[i]);
          const sector = geometry.sector?.[i] || 1;
          const c = sectorLineColors[sector] || sectorLineColors[1];
          lineColors.push(c.r, c.g, c.b);
        }
        const lineGeom = new THREE.BufferGeometry();
        lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        lineGeom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
        const lineMat = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.4,
          linewidth: 1,
        });
        const centerLine = new THREE.Line(lineGeom, lineMat);
        trackGroup.add(centerLine);
      }

      const boundsX = geometry.x_max - geometry.x_min;
      const boundsY = geometry.y_max - geometry.y_min;
      const centerX = (geometry.x_min + geometry.x_max) / 2;
      const centerY = (geometry.y_min + geometry.y_max) / 2;
      const maxBound = Math.max(boundsX, boundsY);

      if (camera instanceof THREE.OrthographicCamera) {
        camera.position.set(centerX, 5000, centerY);
        camera.left = -maxBound / 2 * 1.1;
        camera.right = maxBound / 2 * 1.1;
        camera.top = maxBound / 2 * 1.1;
        camera.bottom = -maxBound / 2 * 1.1;
        camera.updateProjectionMatrix();
      }

      console.log("Camera positioned for top-down view, Center:", { centerX, centerY }, "Bounds:", { boundsX, boundsY, maxBound });

      if (geometry.sector && containerRef.current && camera instanceof THREE.OrthographicCamera) {
        const boundaries = findSectorBoundaryIndices(geometry.sector);
        if (boundaries) {
          const sectorInfo = [
            { label: "S1", color: "#1a8a8a", rgb: { r: 26, g: 138, b: 138 } },
            { label: "S2", color: "#8a3d6e", rgb: { r: 138, g: 61, b: 110 } },
            { label: "S3", color: "#8a7a2e", rgb: { r: 138, g: 122, b: 46 } },
          ];

          const boundaryGroup = new THREE.Group();

          const s1EndIdx = boundaries.s1;
          const s2EndIdx = boundaries.s2;
          const totalPoints = geometry.centerline_x.length;

          const line1InnerPos = new THREE.Vector3(
            geometry.inner_x[s1EndIdx],
            0,
            geometry.inner_y[s1EndIdx]
          );
          const line1OuterPos = new THREE.Vector3(
            geometry.outer_x[s1EndIdx],
            0,
            geometry.outer_y[s1EndIdx]
          );

          const line2InnerPos = new THREE.Vector3(
            geometry.inner_x[s2EndIdx],
            0,
            geometry.inner_y[s2EndIdx]
          );
          const line2OuterPos = new THREE.Vector3(
            geometry.outer_x[s2EndIdx],
            0,
            geometry.outer_y[s2EndIdx]
          );

          const startFinishInnerPos = new THREE.Vector3(
            geometry.inner_x[0],
            0,
            geometry.inner_y[0]
          );
          const startFinishOuterPos = new THREE.Vector3(
            geometry.outer_x[0],
            0,
            geometry.outer_y[0]
          );

          function createBoundaryLine(
            innerPos: THREE.Vector3,
            outerPos: THREE.Vector3,
            isStartFinish: boolean = false
          ) {
            const direction = new THREE.Vector3().subVectors(outerPos, innerPos);
            const distance = direction.length();
            const extensionFactor = 0.15;
            const extension = distance * extensionFactor;

            const normalizedDir = direction.clone().normalize();
            const extendedInnerPos = innerPos.clone().addScaledVector(normalizedDir, -extension);
            const extendedOuterPos = outerPos.clone().addScaledVector(normalizedDir, extension);

            const curve = new THREE.LineCurve3(extendedInnerPos, extendedOuterPos);
            const tubeGeom = new THREE.TubeGeometry(curve, 1, 15, 4, false);
            const tubeMaterial = new THREE.MeshStandardMaterial({
              color: isStartFinish ? 0xffffff : 0xffffff,
              emissive: 0xffffff,
              emissiveIntensity: isStartFinish ? 0.2 : 0.1,
              transparent: true,
              opacity: isStartFinish ? 0.5 : 0.15,
              roughness: 0.5,
              metalness: 0.1,
            });

            return new THREE.Mesh(tubeGeom, tubeMaterial);
          }

          const line1 = createBoundaryLine(line1InnerPos, line1OuterPos, false);
          const line2 = createBoundaryLine(line2InnerPos, line2OuterPos, false);
          const startFinishLine = createBoundaryLine(
            startFinishInnerPos,
            startFinishOuterPos,
            true
          );

          boundaryGroup.add(line1);
          boundaryGroup.add(line2);
          boundaryGroup.add(startFinishLine);
          scene.add(boundaryGroup);
          sectorBoundaryLinesRef.current = boundaryGroup;

          const sector1Centroid = calculateSectorCentroid(0, s1EndIdx, geometry.inner_x, geometry.inner_y, geometry.outer_x, geometry.outer_y);
          const sector2Centroid = calculateSectorCentroid(s1EndIdx, s2EndIdx, geometry.inner_x, geometry.inner_y, geometry.outer_x, geometry.outer_y);
          const sector3Centroid = calculateSectorCentroid(s2EndIdx, totalPoints - 1, geometry.inner_x, geometry.inner_y, geometry.outer_x, geometry.outer_y);
          // Start/finish is at the start of the track (beginning of sector 1, end of sector 3)
          const startFinishCentroid = {
            x: (geometry.inner_x[0] + geometry.outer_x[0]) / 2,
            y: (geometry.inner_y[0] + geometry.outer_y[0]) / 2
          };

          const sectorCentroids = [sector1Centroid, sector2Centroid, sector3Centroid];

          sectorInfo.forEach(({ label, color }, idx) => {
            if (containerRef.current && camera) {
              const centroid = sectorCentroids[idx];
              if (!centroid || isNaN(centroid.x) || isNaN(centroid.y)) {
                console.warn(`Invalid sector ${idx + 1} centroid:`, centroid);
                return;
              }

              const centroid3D = new THREE.Vector3(centroid.x, 0, centroid.y);
              const vector = centroid3D.clone();
              vector.project(camera);

              const screenX = (vector.x * 0.5 + 0.5) * containerRef.current.clientWidth;
              const screenY = (-vector.y * 0.5 + 0.5) * containerRef.current.clientHeight;

              const { r: sr, g: sg, b: sb } = sectorInfo[idx].rgb;
              const tagDiv = document.createElement("div");
              tagDiv.textContent = label;
              tagDiv.style.position = "absolute";
              tagDiv.style.pointerEvents = "none";
              tagDiv.style.padding = "4px 10px";
              tagDiv.style.fontSize = "11px";
              tagDiv.style.fontWeight = "600";
              tagDiv.style.color = color;
              tagDiv.style.opacity = "0.6";
              tagDiv.style.border = `1px solid rgba(${sr}, ${sg}, ${sb}, 0.20)`;
              tagDiv.style.borderRadius = "4px";
              tagDiv.style.backgroundColor = `rgba(${sr}, ${sg}, ${sb}, 0.08)`;
              tagDiv.style.whiteSpace = "nowrap";
              tagDiv.style.transform = "translate(-50%, -50%)";
              tagDiv.style.left = `${screenX}px`;
              tagDiv.style.top = `${screenY}px`;
              tagDiv.style.fontFamily = "'Share Tech Mono', monospace";
              tagDiv.style.letterSpacing = "0.1em";

              containerRef.current.appendChild(tagDiv);
              sectorLabelsRef.current.push(tagDiv);
            }
          });

          if (containerRef.current && camera) {
            const sfCentroid3D = new THREE.Vector3(startFinishCentroid.x, 0, startFinishCentroid.y);

            const trackCenter = new THREE.Vector3(centerX, 0, centerY);
            let offsetDir = new THREE.Vector3().subVectors(sfCentroid3D, trackCenter).normalize();
            const offsetDistance = 800;
            let offsetPos = sfCentroid3D.clone().addScaledVector(offsetDir, offsetDistance);

            let sfVector = offsetPos.clone();
            sfVector.project(camera);

            let sfScreenX = (sfVector.x * 0.5 + 0.5) * containerRef.current.clientWidth;
            let sfScreenY = (-sfVector.y * 0.5 + 0.5) * containerRef.current.clientHeight;

            const isInViewport = sfScreenX >= -100 && sfScreenX <= containerRef.current.clientWidth + 100 &&
                                 sfScreenY >= -100 && sfScreenY <= containerRef.current.clientHeight + 100;

            if (!isInViewport) {
              offsetDir = offsetDir.multiplyScalar(-1);
              offsetPos = sfCentroid3D.clone().addScaledVector(offsetDir, offsetDistance);

              sfVector = offsetPos.clone();
              sfVector.project(camera);

              sfScreenX = (sfVector.x * 0.5 + 0.5) * containerRef.current.clientWidth;
              sfScreenY = (-sfVector.y * 0.5 + 0.5) * containerRef.current.clientHeight;
            }

            const sfTagDiv = document.createElement("div");
            sfTagDiv.textContent = "START/FINISH";
            sfTagDiv.style.position = "absolute";
            sfTagDiv.style.pointerEvents = "none";
            sfTagDiv.style.padding = "3px 8px";
            sfTagDiv.style.fontSize = "9px";
            sfTagDiv.style.fontWeight = "600";
            sfTagDiv.style.color = "rgba(255,255,255,0.5)";
            sfTagDiv.style.border = "1px solid rgba(255,255,255,0.15)";
            sfTagDiv.style.borderRadius = "4px";
            sfTagDiv.style.backgroundColor = "rgba(8, 8, 16, 0.85)";
            sfTagDiv.style.whiteSpace = "nowrap";
            sfTagDiv.style.transform = "translate(-50%, -50%)";
            sfTagDiv.style.left = `${sfScreenX}px`;
            sfTagDiv.style.top = `${sfScreenY}px`;
            sfTagDiv.style.fontFamily = "'Share Tech Mono', monospace";
            sfTagDiv.style.letterSpacing = "0.1em";

            containerRef.current.appendChild(sfTagDiv);
            sectorLabelsRef.current.push(sfTagDiv);
          }
        }
      }

      if (trackGroup.children.length > 0) {
        scene.add(trackGroup);
        console.log("Track group added to scene, children:", trackGroup.children.length);
      } else {
        console.warn("No track geometry meshes created");
      }

      return () => {
        if (trackGroup.children.length > 0) {
          scene.remove(trackGroup);
        }
        if (sectorBoundaryLinesRef.current) {
          scene.remove(sectorBoundaryLinesRef.current);
        }
        sectorLabelsRef.current.forEach((label) => label.remove());
        sectorLabelsRef.current = [];
      };
    } catch (error) {
      console.error("Error building track geometry:", error);
      return () => {
        scene.remove(trackGroup);
        if (sectorBoundaryLinesRef.current) {
          scene.remove(sectorBoundaryLinesRef.current);
        }
        sectorLabelsRef.current.forEach((label) => label.remove());
        sectorLabelsRef.current = [];
      };
    }
  }, [sessionMetadata?.track_geometry]);

  // Update driver positions on each frame
  useEffect(() => {
    if (!sceneRef.current || !currentFrame || !currentFrame.drivers || !containerRef.current) return;

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const container = containerRef.current;
    const drivers = Object.entries(currentFrame.drivers);

    driverMeshesRef.current.forEach((mesh, code) => {
      if (!currentFrame.drivers[code]) {
        scene.remove(mesh);
        driverMeshesRef.current.delete(code);
        driverLightsRef.current.delete(code);

        const label = driverLabelsRef.current.get(code);
        if (label) {
          label.remove();
          driverLabelsRef.current.delete(code);
        }
      }
    });

    drivers.forEach(([code, driver]) => {
      const isRetired = driver.status === "Retired" || driver.status === "DNF" || driver.rel_dist >= 0.99;

      if (isRetired) {
        const mesh = driverMeshesRef.current.get(code);
        if (mesh) {
          scene.remove(mesh);
          driverMeshesRef.current.delete(code);
          driverLightsRef.current.delete(code);

          const label = driverLabelsRef.current.get(code);
          if (label) {
            label.remove();
            driverLabelsRef.current.delete(code);
          }
        }
        return;
      }

      const x = driver.x;
      const y = driver.y;

      const teamColor = sessionMetadata?.driver_colors?.[code] || [220, 38, 38];
      const hexColor = (teamColor[0] << 16) | (teamColor[1] << 8) | teamColor[2];

      let mesh = driverMeshesRef.current.get(code);

      if (!mesh) {
        const group = new THREE.Group();

        // Main driver sphere — the brightest element in the scene
        const sphereGeometry = new THREE.SphereGeometry(80, 32, 32);
        const color = new THREE.Color(hexColor);
        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.7,
          metalness: 0.7,
          roughness: 0.3,
        });
        const sphere = new THREE.Mesh(sphereGeometry, material);
        group.add(sphere);

        // Subtle outer glow ring
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
        ring.position.y = 0;
        ring.rotation.x = Math.PI / 3;
        group.add(ring);

        // Point light per car — casts colored pool on track
        const pointLight = new THREE.PointLight(hexColor, 0.5, 300);
        pointLight.position.set(0, 30, 0);
        group.add(pointLight);
        driverLightsRef.current.set(code, pointLight);

        scene.add(group);
        driverMeshesRef.current.set(code, group);
        mesh = group;
      }

      mesh.position.set(x, 50, y);

      const isSelected = code === selectedDriver?.code;
      const pointLight = driverLightsRef.current.get(code);

      if (mesh instanceof THREE.Group && mesh.children.length > 0) {
        const mainMaterial = (mesh.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        const ringMaterial = mesh.children.length > 1 ? (mesh.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial : null;

        if (isSelected) {
          // Selected car: brighter, pulsing (pulse applied in animate loop)
          const time = performance.now() / 1000;
          const scalePulse = 1.0 + Math.sin(time * 4) * 0.1;
          const emissivePulse = 0.9 + Math.sin(time * 6) * 0.2;
          mainMaterial.emissiveIntensity = emissivePulse;
          if (ringMaterial) {
            ringMaterial.emissiveIntensity = 0.6;
            ringMaterial.opacity = 0.9;
          }
          mesh.scale.set(scalePulse, scalePulse, scalePulse);
          if (pointLight) pointLight.intensity = 0.8;
        } else {
          mainMaterial.emissiveIntensity = 0.7;
          if (ringMaterial) {
            ringMaterial.emissiveIntensity = 0.3;
            ringMaterial.opacity = 0.6;
          }
          mesh.scale.set(0.7, 0.7, 0.7);
          if (pointLight) pointLight.intensity = 0.5;
        }
      }

      if (isSelected) {
        let label = driverLabelsRef.current.get(code);

        if (!label) {
          label = document.createElement('div');
          label.style.position = 'absolute';
          label.style.display = 'flex';
          label.style.alignItems = 'center';
          label.style.gap = '6px';
          label.style.padding = '4px 10px';
          label.style.backgroundColor = 'rgba(8, 8, 16, 0.85)';
          label.style.border = `1px solid rgba(${teamColor[0]}, ${teamColor[1]}, ${teamColor[2]}, 0.30)`;
          label.style.color = '#e8e8ee';
          label.style.fontFamily = "'Share Tech Mono', monospace";
          label.style.borderRadius = '5px';
          label.style.pointerEvents = 'none';
          label.style.zIndex = '10';
          label.style.letterSpacing = '0.05em';
          label.style.fontSize = '11px';

          // Position text (team color)
          const posSpan = document.createElement('span');
          posSpan.style.fontWeight = '700';
          posSpan.style.color = `rgb(${teamColor[0]}, ${teamColor[1]}, ${teamColor[2]})`;
          label.appendChild(posSpan);

          // Separator
          const sepSpan = document.createElement('span');
          sepSpan.textContent = '\u2014';
          sepSpan.style.color = 'rgba(255,255,255,0.3)';
          label.appendChild(sepSpan);

          // Driver code
          const codeSpan = document.createElement('span');
          codeSpan.style.fontWeight = '700';
          codeSpan.style.color = '#e8e8ee';
          label.appendChild(codeSpan);

          // Team logo
          const img = document.createElement('img');
          img.style.height = '14px';
          img.style.width = 'auto';
          img.style.marginLeft = '4px';
          img.onerror = () => { img.style.display = 'none'; };
          label.appendChild(img);

          container.appendChild(label);
          driverLabelsRef.current.set(code, label);
        }

        const position = driver.position || '?';
        const teamName = (sessionMetadata as any)?.driver_teams?.[code];

        const posSpan = label.children[0] as HTMLSpanElement;
        const codeSpan = label.children[2] as HTMLSpanElement;
        const img = label.children[3] as HTMLImageElement;

        posSpan.textContent = `P${position}`;
        codeSpan.textContent = code;

        const logoPath = getTeamLogoPath(teamName);
        if (logoPath) {
          img.src = logoPath;
          img.style.display = 'block';
        } else {
          img.style.display = 'none';
        }

        if (camera) {
          const vector = new THREE.Vector3(x, 50, y);
          vector.project(camera);

          const screenX = (vector.x * 0.5 + 0.5) * container.clientWidth;
          const screenY = (-vector.y * 0.5 + 0.5) * container.clientHeight;

          label.style.left = screenX - 80 + 'px';
          label.style.top = screenY - 50 + 'px';
        }
      } else {
        const label = driverLabelsRef.current.get(code);
        if (label) {
          label.remove();
          driverLabelsRef.current.delete(code);
        }
      }
    });
  }, [currentFrame, selectedDriver, sessionMetadata?.driver_colors]);

  // Handle sector colors toggle
  useEffect(() => {
    if (!trackMeshRef.current || !trackMaterialColorsRef.current) return;

    const colorAttribute = trackMeshRef.current.geometry.getAttribute("color") as THREE.BufferAttribute;
    if (!colorAttribute) return;

    if (showSectorColors) {
      colorAttribute.array = trackMaterialColorsRef.current;
    } else {
      // Uniform dark road surface when sectors disabled
      const grayColors = new Float32Array(trackMaterialColorsRef.current.length);
      for (let i = 0; i < grayColors.length; i += 3) {
        grayColors[i] = 0.067;     // R — #111118
        grayColors[i + 1] = 0.067; // G
        grayColors[i + 2] = 0.094; // B
      }
      colorAttribute.array = grayColors;
    }

    colorAttribute.needsUpdate = true;
  }, [showSectorColors]);

  // Show/hide rain based on weather conditions
  useEffect(() => {
    if (!sceneRef.current || !rainSegmentsRef.current) return;

    const isRaining = currentFrame?.weather?.rain_state === 'RAINING';

    if (isRaining) {
      if (!rainSegmentsRef.current.parent) {
        sceneRef.current.add(rainSegmentsRef.current);
      }
    } else if (rainSegmentsRef.current.parent) {
      sceneRef.current.remove(rainSegmentsRef.current);
    }
  }, [currentFrame?.weather?.rain_state]);

  // Handle driver click detection
  useEffect(() => {
    if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;

    const handleCanvasClick = (event: MouseEvent) => {
      if (!raycasterRef.current || !mouseRef.current) return;

      const rect = rendererRef.current!.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      mouseRef.current.x = (x / rect.width) * 2 - 1;
      mouseRef.current.y = -(y / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);

      const driverMeshesArray = Array.from(driverMeshesRef.current.values());
      const intersects = raycasterRef.current.intersectObjects(driverMeshesArray, true);

      if (intersects.length > 0) {
        let clickedDriverCode: string | null = null;

        for (const [code, mesh] of driverMeshesRef.current.entries()) {
          if (intersects[0].object === mesh || (mesh instanceof THREE.Group && mesh.children.includes(intersects[0].object as THREE.Mesh))) {
            clickedDriverCode = code;
            break;
          }
        }

        if (clickedDriverCode && currentFrame?.drivers?.[clickedDriverCode]) {
          const driver = currentFrame.drivers[clickedDriverCode];
          const teamColor = sessionMetadata?.driver_colors?.[clickedDriverCode] || [220, 38, 38];
          setSelectedDriver({
            code: clickedDriverCode,
            data: driver,
            color: teamColor
          });
        }
      }
    };

    const canvas = rendererRef.current.domElement;
    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [currentFrame, sessionMetadata, setSelectedDriver]);

  const convertTemperature = (celsius: number): number => {
    if (temperatureUnit === 'F') {
      return (celsius * 9 / 5) + 32;
    }
    return celsius;
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#080810",
      }}
    >
      {/* Settings Button at Top-Right */}
      <button
        onClick={() => setShowSettingsPanel(true)}
        style={{
          position: 'absolute',
          top: '10px',
          right: '18px',
          zIndex: 25,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border-color)',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-faint)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as any).style.color = 'var(--text-dimmed)';
          (e.currentTarget as any).style.background = 'rgba(255,255,255,0.06)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as any).style.color = 'var(--text-faint)';
          (e.currentTarget as any).style.background = 'rgba(255,255,255,0.04)';
        }}
      >
        <Settings size={16} />
      </button>

      {/* Conditions Bar at Top-Left */}
      {showWeatherPanel && (
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '48px',
            zIndex: 20,
            background: 'rgba(17, 17, 25, 0.95)',
            borderBottom: '1px solid var(--border-color)',
            padding: '10px 18px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', display: 'flex', gap: '20px', alignItems: 'center' }}>
            {currentFrame?.weather ? (
              <>
                <div style={{ whiteSpace: 'nowrap', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dimmed)' }}>TRACK:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{Math.round(convertTemperature(currentFrame.weather.track_temp))}&deg;{temperatureUnit}</span>
                </div>
                <div style={{ whiteSpace: 'nowrap', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dimmed)' }}>AIR:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{Math.round(convertTemperature(currentFrame.weather.air_temp))}&deg;{temperatureUnit}</span>
                </div>
                <div style={{ whiteSpace: 'nowrap', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dimmed)' }}>WIND:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{Math.round(currentFrame.weather.wind_speed)} m/s</span>
                </div>
                <div style={{ whiteSpace: 'nowrap', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dimmed)' }}>CONDITIONS:</span>
                  <span style={{ color: currentFrame.weather.rain_state === 'DRY' ? 'var(--cyan)' : '#3b82f6', fontWeight: 600 }}>
                    {currentFrame.weather.rain_state || 'DRY'}
                  </span>
                </div>
              </>
            ) : (
              <span style={{ color: 'var(--text-faint)', letterSpacing: '0.06em' }}>AWAITING CONDITIONS DATA...</span>
            )}
          </div>
        </div>
      )}

      {/* Map Settings Panel */}
      <MapSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        showSectorColors={showSectorColors}
        onToggleSectorColors={toggleSectorColors}
        showWeatherPanel={showWeatherPanel}
        onToggleWeatherPanel={() => setShowWeatherPanel(!showWeatherPanel)}
        temperatureUnit={temperatureUnit}
        onToggleTemperatureUnit={() => setTemperatureUnit(temperatureUnit === 'C' ? 'F' : 'C')}
        // NEW: hook this up in MapSettingsPanel to a switch called e.g. "Weather FX"
        enableWeatherFx={enableWeatherFx}
        onToggleWeatherFx={() => setEnableWeatherFx((prev) => !prev)}
      />
    </div>
  );
};

export default TrackVisualization3D;
