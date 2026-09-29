import {
  BackSide,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Contact } from "./surfer";
import type { Mood, Tier } from "./ride";
import { SWELL_GLSL } from "./swell";

const seaVertex = /* glsl */ `
  uniform float uTime;
  uniform vec2 uFlow;
  uniform vec2 uFade;
  uniform vec3 uCamPos;
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
    float amp = 0.08;
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
    float fade = 1.0 - smoothstep(uFade.x, uFade.y, distance(wp.xz, uCamPos.xz));
    vec2 q = wp.xz + uFlow;
    float h = height(q) * fade;
    float hx = height(q + vec2(e, 0.0)) * fade;
    float hz = height(q + vec2(0.0, e)) * fade;
    vHeight = h;
    vNormal = normalize(vec3(h - hx, e, h - hz));
    vWorld = vec3(wp.x, h, wp.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const SKY_GLSL = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSunDir;

  vec3 skyAt(vec3 dir) {
    float y = max(dir.y, 0.0);
    float sd = max(dot(dir, uSunDir), 0.0);
    vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.6, y), 0.7));
    return mix(col, uGlow, pow(sd, 6.0) * 0.45 * (1.0 - smoothstep(0.0, 0.4, y)));
  }
`;

const seaFragment = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSun;
  uniform vec3 uCamPos;
  uniform vec2 uHaze;
  uniform vec2 uFlow;
  uniform vec2 uBoard;
  uniform vec2 uBoardFwd;
  uniform float uWake;
  uniform float uTime;
  varying vec3 vWorld;
  varying float vHeight;
  varying vec3 vNormal;

  ${SKY_GLSL}

  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 toCam = normalize(uCamPos - vWorld);
    float dist = distance(vWorld, uCamPos);
    float diffuse = clamp(dot(n, uSunDir), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(uSunDir + toCam)), 0.0, 1.0), 90.0);
    float fresnel = pow(1.0 - clamp(dot(n, toCam), 0.0, 1.0), 3.0);

    float h = smoothstep(-0.5, 0.8, vHeight);
    vec3 col = mix(uDeep, uShallow, h * 0.55 + diffuse * 0.25);
    col = mix(col, uShallow * 1.2, smoothstep(0.1, 0.35, vHeight) * 0.35);
    col = mix(col, skyAt(reflect(-toCam, n)), fresnel * 0.35);

    vec2 d = vWorld.xz - uBoard;
    float a = dot(d, uBoardFwd);
    float c = dot(d, vec2(-uBoardFwd.y, uBoardFwd.x));
    float e = length(vec2(a / 1.05, c / 0.34));
    col *= 1.0 - 0.35 * (1.0 - smoothstep(0.4, 1.0, e));
    float ring = smoothstep(0.8, 1.0, e) * (1.0 - smoothstep(1.0, 1.4, e)) * smoothstep(0.3, 0.8, uWake);
    float back = max(-a - 0.85, 0.0);
    float behind = step(0.001, back);
    float fade = 1.0 - smoothstep(0.0, 5.5, back);
    float wake = (1.0 - smoothstep(0.0, 0.07 + 0.09 * back, abs(abs(c) - 0.2 - 0.34 * back))) * fade * fade * behind * 0.75;
    float churn = (1.0 - smoothstep(0.0, 0.2 + 0.1 * back, abs(c))) * exp(-1.6 * back) * behind * 0.6;
    vec2 gp = (vWorld.xz + uFlow) * 4.0;
    float grain = 0.6 * n2(gp) + 0.4 * n2(gp * 2.3 + back * 3.0);
    float foam = clamp((0.45 * ring + wake + churn) * uWake, 0.0, 1.0) * smoothstep(0.4, 0.7, grain + 0.15);
    float crest = smoothstep(0.3, 0.42, vHeight) * smoothstep(0.5, 0.8, n2((vWorld.xz + uFlow) * 1.3 + uTime * 0.2));
    col = mix(col, uFoam, max(foam, 0.45 * crest));
    col += uSun * spec * 0.6;
    col = mix(col, skyAt(normalize(vec3(vWorld.x - uCamPos.x, 0.0, vWorld.z - uCamPos.z))), pow(smoothstep(uHaze.x, uHaze.y, dist), 1.6));
    col += (hash2(gl_FragCoord.xy) - 0.5) / 255.0;
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
  uniform vec3 uSun;
  uniform float uNight;
  varying vec3 vDir;

  ${SKY_GLSL}

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    vec3 dir = normalize(vDir);
    float sd = max(dot(dir, uSunDir), 0.0);
    vec3 col = skyAt(dir);
    col += uSun * (pow(sd, 300.0) * 0.5 + pow(sd, 24.0) * 0.2);
    col = mix(col, uSun, smoothstep(0.9990, 0.9994, sd));

    vec3 cell = floor(dir * 90.0);
    float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.4, dir.y) * uNight;
    col += vec3(star) * (1.0 - smoothstep(0.0, 0.5, sd));

    col += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 128.0;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const ridgeVertex = /* glsl */ `
  varying float vY;
  void main() {
    vY = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ridgeFragment = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uLayer;
  varying float vY;
  void main() {
    gl_FragColor = vec4(mix(uHorizon, uLayer, smoothstep(-1.0, 2.0, vY)), 1.0);
    #include <colorspace_fragment>
  }
`;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const white = new Color(0xffffff);
const RIDGES = [
  { r: 86, hmax: 7, mix: 0.1, shift: 0.7 },
  { r: 82, hmax: 5.5, mix: 0.2, shift: 2.1 },
  { r: 78, hmax: 4, mix: 0.32, shift: 4.3 },
];
const CLOUDS = 7;

const ridgeGeometry = (r: number, hmax: number, shift: number, sunAngle: number) => {
  const geo = new CylinderGeometry(r, r, 1, 128, 1, true);
  const pos = geo.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) {
      pos.setY(i, -3);
      continue;
    }
    const th = Math.atan2(pos.getZ(i), pos.getX(i));
    const profile = Math.max(0, 0.5 * Math.sin(3 * th + shift) + 0.3 * Math.sin(7.3 * th + 2 * shift) + 0.15 * Math.sin(13.1 * th + shift));
    const away = Math.abs(Math.atan2(Math.sin(th - sunAngle), Math.cos(th - sunAngle)));
    pos.setY(i, profile * hmax * smoothstep(0.44, 0.7, away));
  }
  return geo;
};

const cloudGeometry = () => {
  const puffs = [
    [0, 0, 0, 1],
    [1.1, -0.1, 0.2, 0.8],
    [-1.1, -0.15, -0.1, 0.75],
    [0.4, 0.3, 0.1, 0.7],
    [-0.5, 0.2, 0.3, 0.6],
  ].map(([x, y, z, r]) => {
    const g = new IcosahedronGeometry(r, 3);
    g.scale(1, 1, 0.8);
    g.translate(x, y, z);
    const p = g.getAttribute("position") as BufferAttribute;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const under = p.getY(i) < 0;
      if (under) p.setY(i, p.getY(i) * 0.15);
      c.fill(under ? 0.82 : 0.9 + 0.1 * Math.min(1, p.getY(i) + 0.5), i * 3, i * 3 + 3);
    }
    g.setAttribute("color", new BufferAttribute(c, 3));
    return g;
  });
  return mergeGeometries(puffs)!;
};

export function createEnvironment(tier: Tier, heading: Vector3) {
  const scene = new Scene();
  const fog = new Fog(0x000000, 18, 95);
  scene.fog = fog;

  const flat = new Vector3(heading.x, 0, heading.z).normalize();
  const sunAngle = Math.atan2(flat.z, flat.x);

  const skyUniforms = {
    uTop: { value: new Color() },
    uHorizon: { value: new Color() },
    uSun: { value: new Color() },
    uGlow: { value: new Color() },
    uSunDir: { value: new Vector3() },
    uNight: { value: 0 },
  };
  const seaUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new Color() },
    uShallow: { value: new Color() },
    uFoam: { value: new Color() },
    uSun: skyUniforms.uSun,
    uSunDir: skyUniforms.uSunDir,
    uHorizon: skyUniforms.uHorizon,
    uTop: skyUniforms.uTop,
    uGlow: skyUniforms.uGlow,
    uCamPos: { value: new Vector3() },
    uHaze: { value: new Vector2(16, tier.seaSize * 0.46) },
    uFade: { value: new Vector2(0.55, 0.95).multiplyScalar(tier.seaSize / 2) },
    uFlow: { value: new Vector2() },
    uBoard: { value: new Vector2() },
    uBoardFwd: { value: new Vector2(0, -1) },
    uWake: { value: 0 },
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

  const sky = new Mesh(
    new SphereGeometry(90, 32, 16),
    new ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, uniforms: skyUniforms, side: BackSide, depthWrite: false, fog: false }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const ridges = RIDGES.map(({ r, hmax, shift }) => {
    const layer = { value: new Color() };
    const mesh = new Mesh(
      ridgeGeometry(r, hmax, shift, sunAngle),
      new ShaderMaterial({
        vertexShader: ridgeVertex,
        fragmentShader: ridgeFragment,
        uniforms: { uHorizon: skyUniforms.uHorizon, uLayer: layer },
        side: DoubleSide,
        fog: false,
      }),
    );
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, layer };
  });

  const cloudMaterial = new MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.9 });
  const clouds = new InstancedMesh(cloudGeometry(), cloudMaterial, CLOUDS);
  clouds.frustumCulled = false;
  const m4 = new Matrix4();
  for (let i = 0; i < CLOUDS; i++) {
    const th = (i / CLOUDS) * Math.PI * 2 + Math.sin(i * 12.9) * 0.3;
    const r = 60 + ((i * 37) % 17);
    const sc = 3 + ((i * 53) % 4);
    m4.makeRotationY(Math.PI / 2 - th).setPosition(Math.cos(th) * r, 14 + ((i * 29) % 13), Math.sin(th) * r).scale(new Vector3(sc * 3, sc * 0.4, sc * 0.8));
    clouds.setMatrixAt(i, m4);
  }
  scene.add(clouds);

  const hemi = new HemisphereLight(0xffffff, 0x0b4558, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  const rim = new DirectionalLight(0xfff4e2, 0.9);
  scene.add(hemi, sun, sun.target, rim, rim.target);

  const sunDir = new Vector3();
  const cell = tier.seaSize / tier.seaSegments;
  const tint = new Color();

  const applyMood = (m: Mood) => {
    const el = (m.elevation * Math.PI) / 180;
    sunDir.copy(flat).multiplyScalar(Math.cos(el)).setY(Math.sin(el));

    seaUniforms.uDeep.value.setHex(m.seaDeep);
    seaUniforms.uShallow.value.setHex(m.seaShallow);
    seaUniforms.uFoam.value.setHex(0xf6f1e6).lerp(tint.setHex(m.horizon), 0.25).multiplyScalar(1 - 0.4 * m.night);
    skyUniforms.uSun.value.setHex(m.sun);
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uHorizon.value.setHex(m.horizon);
    skyUniforms.uTop.value.setHex(m.skyTop);
    skyUniforms.uGlow.value.setHex(m.glow);
    skyUniforms.uNight.value = m.night;

    ridges.forEach(({ layer }, i) => layer.value.setHex(m.horizon).lerp(tint.setHex(m.skyTop), RIDGES[i].mix));
    cloudMaterial.color
      .setHex(m.horizon)
      .lerp(white, 0.55)
      .lerp(tint.setHex(m.glow), 0.35 * (1 - smoothstep(10, 30, m.elevation)));

    fog.color.setHex(m.horizon);
    hemi.color.setHex(m.skyTop).lerp(white, 0.5);
    hemi.groundColor.setHex(m.seaShallow).lerp(white, 0.15);
    hemi.intensity = 1.1 - 0.5 * m.night;
    sun.color.setHex(m.sun);
    sun.intensity = Math.max(0.6, (0.5 + 0.9 * smoothstep(0, 25, m.elevation)) * (1 - 0.5 * m.night));
    rim.color.setHex(m.glow).lerp(white, 0.4);
  };

  const update = (camera: PerspectiveCamera, focus: Vector3, time: number, contact: Contact, flow: Vector2, turn: number, speed: number) => {
    seaUniforms.uTime.value = time;
    seaUniforms.uCamPos.value.copy(camera.position);
    seaUniforms.uFlow.value.copy(flow);
    seaUniforms.uBoard.value.set(contact.position.x, contact.position.z);
    seaUniforms.uBoardFwd.value.copy(contact.forward).normalize();
    seaUniforms.uWake.value = contact.wake * Math.min(1, 0.5 + speed + Math.abs(turn));
    sea.position.set(Math.round(camera.position.x / cell) * cell, 0, Math.round(camera.position.z / cell) * cell);
    sky.position.copy(camera.position);
    for (const { mesh } of ridges) mesh.position.set(camera.position.x * 0.94, 0, camera.position.z * 0.94);
    clouds.position.set(camera.position.x, 0, camera.position.z);
    clouds.rotation.y = 0.004 * time;
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
