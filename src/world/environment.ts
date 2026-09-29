import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Mood, Tier } from "./ride";
import { SWELL_GLSL } from "./swell";

const seaVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vHeight;
  varying vec3 vNormal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  ${SWELL_GLSL}

  float ripple(vec2 p, float t) {
    float sum = 0.0;
    float amp = 0.12;
    float freq = 0.9;
    for (int i = 0; i < OCTAVES; i++) {
      sum += (noise(p * freq + t * (mod(float(i), 2.0) < 0.5 ? 1.0 : -0.7)) - 0.5) * amp;
      amp *= 0.4;
      freq *= 2.4;
    }
    return sum;
  }

  float height(vec2 p) {
    return swell(p, uTime) + ripple(p, uTime * 0.18);
  }

  void main() {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    float e = 0.12;
    float h = height(wp.xz);
    float hx = height(wp.xz + vec2(e, 0.0));
    float hz = height(wp.xz + vec2(0.0, e));
    vHeight = h;
    vNormal = normalize(vec3(h - hx, e, h - hz));
    vWorld = vec3(wp.x, h, wp.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const seaFragment = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform vec3 uHorizon;
  uniform vec3 uCamPos;
  uniform vec2 uHaze;
  varying vec3 vWorld;
  varying float vHeight;
  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 toCam = normalize(uCamPos - vWorld);
    float diffuse = clamp(dot(n, uSunDir), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(uSunDir + toCam)), 0.0, 1.0), 90.0);
    float fresnel = pow(1.0 - clamp(dot(n, toCam), 0.0, 1.0), 3.0);

    float h = smoothstep(-0.5, 0.8, vHeight);
    vec3 col = mix(uDeep, uShallow, h * 0.55 + diffuse * 0.25);
    col = mix(col, uFoam, fresnel * 0.12);
    col = mix(col, uHorizon, fresnel * 0.3);
    col += uSun * spec * 0.6;
    col = mix(col, uHorizon, smoothstep(uHaze.x, uHaze.y, distance(vWorld, uCamPos)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uGlow;
  uniform vec3 uSunDir;
  uniform float uNight;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    vec3 dir = normalize(vDir);
    float sd = max(dot(dir, uSunDir), 0.0);
    vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, dir.y));
    col = mix(col, uGlow, pow(sd, 6.0) * 0.45);
    col += uGlow * pow(sd, 48.0) * 0.4;
    col = mix(col, uSun, smoothstep(0.9982, 0.9988, sd));

    vec3 cell = floor(dir * 90.0);
    float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.4, dir.y) * uNight;
    col += vec3(star) * (1.0 - smoothstep(0.0, 0.5, sd));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const white = new Color(0xffffff);

export function createEnvironment(tier: Tier, heading: Vector3) {
  const scene = new Scene();
  const fog = new Fog(0x000000, 14, 40);
  scene.fog = fog;

  const seaUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new Color() },
    uShallow: { value: new Color() },
    uFoam: { value: new Color(0xd8e6e2) },
    uSun: { value: new Color() },
    uSunDir: { value: new Vector3() },
    uHorizon: { value: new Color() },
    uCamPos: { value: new Vector3() },
    uHaze: { value: new Vector2(14, tier.seaSize * 0.46) },
  };
  const seaMaterial = new ShaderMaterial({
    vertexShader: seaVertex,
    fragmentShader: seaFragment,
    uniforms: seaUniforms,
    defines: { OCTAVES: tier.octaves },
  });
  const sea = new Mesh(new PlaneGeometry(tier.seaSize, tier.seaSize, tier.seaSegments, tier.seaSegments).rotateX(-Math.PI / 2), seaMaterial);
  sea.frustumCulled = false;
  scene.add(sea);

  const skyUniforms = {
    uTop: { value: new Color() },
    uHorizon: { value: new Color() },
    uSun: { value: new Color() },
    uGlow: { value: new Color() },
    uSunDir: { value: new Vector3() },
    uNight: { value: 0 },
  };
  const sky = new Mesh(
    new SphereGeometry(90, 32, 16),
    new ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, uniforms: skyUniforms, side: BackSide, depthWrite: false, fog: false }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const hemi = new HemisphereLight(0xffffff, 0x0b4558, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  const rim = new DirectionalLight(0xfff4e2, 0.6);
  scene.add(hemi, sun, sun.target, rim, rim.target);

  const sunDir = new Vector3();
  const flat = new Vector3(heading.x, 0, heading.z).normalize();
  const cell = tier.seaSize / tier.seaSegments;

  const applyMood = (m: Mood) => {
    const el = (m.elevation * Math.PI) / 180;
    sunDir.copy(flat).multiplyScalar(Math.cos(el)).setY(Math.sin(el));

    seaUniforms.uDeep.value.setHex(m.seaDeep);
    seaUniforms.uShallow.value.setHex(m.seaShallow);
    seaUniforms.uSun.value.setHex(m.sun);
    seaUniforms.uSunDir.value.copy(sunDir);
    seaUniforms.uHorizon.value.setHex(m.horizon);

    skyUniforms.uTop.value.setHex(m.skyTop);
    skyUniforms.uHorizon.value.setHex(m.horizon);
    skyUniforms.uSun.value.setHex(m.sun);
    skyUniforms.uGlow.value.setHex(m.glow);
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uNight.value = m.night;

    fog.color.setHex(m.horizon);
    hemi.color.setHex(m.skyTop).lerp(white, 0.5);
    hemi.groundColor.setHex(m.seaDeep);
    hemi.intensity = 1 - 0.6 * m.night;
    sun.color.setHex(m.sun);
    sun.intensity = (0.5 + 0.9 * smoothstep(0, 25, m.elevation)) * (1 - 0.5 * m.night);
  };

  const update = (camera: PerspectiveCamera, focus: Vector3, time: number) => {
    seaUniforms.uTime.value = time;
    seaUniforms.uCamPos.value.copy(camera.position);
    sea.position.set(Math.round(camera.position.x / cell) * cell, 0, Math.round(camera.position.z / cell) * cell);
    sky.position.copy(camera.position);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 10);
    rim.target.position.copy(focus);
    rim.position.copy(focus).sub(camera.position).setY(0).normalize().multiplyScalar(6).add(focus).setY(focus.y + 3);
  };

  const setOctaves = (n: number) => {
    seaMaterial.defines.OCTAVES = n;
    seaMaterial.needsUpdate = true;
  };

  return { scene, applyMood, update, setOctaves };
}
