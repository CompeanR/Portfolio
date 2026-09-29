import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from "three";

const GRAVITY = -5.5;
const LIFE = { min: 0.6, max: 0.9 };

const vertex = /* glsl */ `
  uniform float uHeight;
  attribute float aLife;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 0.07 * projectionMatrix[1][1] * uHeight * 0.5 / -mv.z * (0.6 + 0.6 * aLife);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  varying float vLife;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.4, 1.0, d)) * vLife * 0.7;
    if (a < 0.01) discard;
    gl_FragColor = vec4(1.0, 0.98, 0.94, a);
  }
`;

export function createSpray(count: number) {
  const position = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const alpha = new Float32Array(count);
  for (let i = 0; i < count; i++) position[i * 3 + 1] = -100;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aLife", new BufferAttribute(alpha, 1));
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { uHeight: { value: 800 } },
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;

  let head = 0;
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const emit = (origin: Vector3, vel: Vector3, n: number) => {
    for (let k = 0; k < n; k++) {
      const i = head;
      head = (head + 1) % count;
      const s = 0.7 + 0.6 * rand();
      position[i * 3] = origin.x + (rand() - 0.5) * 0.2;
      position[i * 3 + 1] = origin.y;
      position[i * 3 + 2] = origin.z + (rand() - 0.5) * 0.2;
      velocity[i * 3] = vel.x * s + (rand() - 0.5) * 0.6;
      velocity[i * 3 + 1] = vel.y * s;
      velocity[i * 3 + 2] = vel.z * s + (rand() - 0.5) * 0.6;
      life[i] = LIFE.min + (LIFE.max - LIFE.min) * rand();
    }
  };

  const update = (dt: number) => {
    for (let i = 0; i < count; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        position[i * 3 + 1] = -100;
        alpha[i] = 0;
        continue;
      }
      velocity[i * 3 + 1] += GRAVITY * dt;
      position[i * 3] += velocity[i * 3] * dt;
      position[i * 3 + 1] += velocity[i * 3 + 1] * dt;
      position[i * 3 + 2] += velocity[i * 3 + 2] * dt;
      alpha[i] = Math.min(1, life[i] / LIFE.max);
    }
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("aLife").needsUpdate = true;
  };

  const resize = (height: number) => {
    material.uniforms.uHeight.value = height;
  };

  return { points, emit, update, resize };
}
