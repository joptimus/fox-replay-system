import * as THREE from 'three';

export class WeatherEffects {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private rainLines: THREE.LineSegments;
  private rainGeometry: THREE.BufferGeometry;
  private rainMaterial: THREE.LineBasicMaterial;
  private noiseRenderTarget: THREE.WebGLRenderTarget;
  private noiseScene: THREE.Scene;
  private noiseCam: THREE.OrthographicCamera;
  private noiseShaderMat: THREE.ShaderMaterial;
  private clock: THREE.Clock;
  private rainShaderUniforms: { time: { value: number }; noiseMap: { value: THREE.Texture } };
  private visible = false;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    this.noiseRenderTarget = new THREE.WebGLRenderTarget(512, 512);
    this.noiseScene = new THREE.Scene();
    this.noiseCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.noiseShaderMat = new THREE.ShaderMaterial({
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
    const noiseMesh = new THREE.Mesh(noisePlane, this.noiseShaderMat);
    this.noiseScene.add(noiseMesh);

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

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
    this.rainGeometry.setAttribute('gEnds', new THREE.Float32BufferAttribute(gEnds, 2));

    this.rainShaderUniforms = {
      time: { value: 0 },
      noiseMap: { value: this.noiseRenderTarget.texture }
    };

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0x3388ff,
      transparent: true,
      opacity: 0.9,
      linewidth: 3,
    });

    (this.rainMaterial as any).onBeforeCompile = (shader: any) => {
      Object.assign(shader.uniforms, this.rainShaderUniforms);
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

    this.rainLines = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rainLines.frustumCulled = false;
  }

  setRainState(state: string | null): void {
    const shouldShow = state === 'RAINING';
    if (shouldShow === this.visible) return;
    this.visible = shouldShow;

    if (shouldShow) {
      this.scene.add(this.rainLines);
    } else {
      this.scene.remove(this.rainLines);
    }
  }

  update(): void {
    if (!this.visible) return;

    const elapsed = this.clock.getElapsedTime();
    this.rainShaderUniforms.time.value = elapsed;
    this.noiseShaderMat.uniforms.time.value = elapsed;

    this.renderer.setRenderTarget(this.noiseRenderTarget);
    this.renderer.render(this.noiseScene, this.noiseCam);
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.scene.remove(this.rainLines);
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.noiseRenderTarget.dispose();
    this.noiseShaderMat.dispose();
  }
}
