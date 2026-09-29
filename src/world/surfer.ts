import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshToonMaterial,
  NearestFilter,
  Quaternion,
  RedFormat,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STOPS } from "./ride";
import { swellAt } from "./swell";

export type SurferInput = { P: number; turn: number; speed: number; time: number; dt: number; cut: boolean; flow: Vector2 };
export type Contact = { position: Vector3; forward: Vector2; rail: Vector3; roll: number; wake: number };

const KEYS = [
  "pelvisX", "pelvisY", "pelvisYaw", "pelvisPitch", "pelvisRoll",
  "torsoLean", "torsoTwist", "torsoSide", "headYaw", "headPitch",
  "frontShoulderX", "frontShoulderZ", "frontElbow", "backShoulderX", "backShoulderZ", "backElbow",
  "frontFootX", "frontFootY", "frontFootZ", "backFootX", "backFootY", "backFootZ",
  "frontFootYaw", "backFootYaw", "boardPitch", "boardRoll", "boardY",
] as const;
export type Pose = Record<(typeof KEYS)[number], number>;

const N = STOPS.length;
const ANKLE = 0.065;
const L1 = 0.42;
const L2 = 0.42;
const HIP = new Vector3(0.1, -0.04, 0);
const PALETTE = {
  skin: 0xc98a5e,
  hair: 0x2a1a14,
  amber: 0xf5a31a,
  sand: 0xfff4e2,
  shorts: 0x173a66,
  rust: 0xb23a0b,
  teal: 0x2e7b90,
  ink: 0x0c2a33,
};

export const BOARD = { length: 1.9, thick: 0.07 };
const halfWidth = (u: number) => 0.27 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.16 + 0.84 * u))), 0.55);
const rocker = (u: number) => (u > 0.42 ? 0.14 * ((u - 0.42) / 0.58) ** 2 : 0.05 * ((0.42 - u) / 0.42) ** 2);
const thickness = (u: number) => BOARD.thick * (0.35 + 0.65 * Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, u)))));
export const deckY = (x: number) => {
  const u = x / BOARD.length + 0.5;
  return rocker(u) + 0.6 * thickness(u);
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function rideWeight(P: number, n: number = N) {
  return smoothstep(0.3, 0.6, P) * (1 - smoothstep(n - 1.65, n - 1.1, P));
}

const pose = (v: Partial<Pose>): Pose => {
  const p = {} as Pose;
  for (const k of KEYS) p[k] = v[k] ?? 0;
  return p;
};

const mixPose = (a: Pose, b: Pose, t: number) => {
  const p = {} as Pose;
  for (const k of KEYS) p[k] = lerp(a[k], b[k], t);
  return p;
};

const RIDE = pose({
  pelvisX: 0.03, pelvisY: 0.78, pelvisYaw: 1.2, pelvisPitch: 0.12,
  torsoLean: 0.18, torsoTwist: -0.55, headYaw: 0.9, headPitch: 0.12,
  frontShoulderX: -0.5, frontShoulderZ: 0.3, frontElbow: -0.9,
  backShoulderX: 0.25, backShoulderZ: -0.35, backElbow: -0.8,
  frontFootX: 0.42, frontFootY: deckY(0.42) + ANKLE, frontFootZ: 0.02,
  backFootX: -0.4, backFootY: deckY(-0.4) + ANKLE, backFootZ: -0.02,
  frontFootYaw: 0.6, backFootYaw: 0.15, boardY: -0.02,
});

const paddle = (t: number) =>
  pose({
    pelvisX: -0.2, pelvisY: 0.16, pelvisYaw: Math.PI / 2, pelvisPitch: Math.PI / 2,
    torsoLean: -0.25, headPitch: -0.15, pelvisRoll: 0.06 * Math.sin(3 * t), boardPitch: 0.02 * Math.sin(3 * t),
    frontShoulderX: -Math.PI / 2 + 1.1 * Math.sin(3 * t), frontShoulderZ: 0.4, frontElbow: -0.5 - 0.5 * Math.max(0, Math.sin(3 * t)),
    backShoulderX: -Math.PI / 2 + 1.1 * Math.sin(3 * t + Math.PI), backShoulderZ: -0.4, backElbow: -0.5 - 0.5 * Math.max(0, -Math.sin(3 * t)),
    frontFootX: -0.85, frontFootY: 0.1 + 0.03 * Math.sin(3 * t), frontFootZ: -0.05,
    backFootX: -0.85, backFootY: 0.1 - 0.03 * Math.sin(3 * t), backFootZ: 0.05,
    frontFootYaw: -Math.PI / 2, backFootYaw: -Math.PI / 2, boardY: -0.03,
  });

const SIT = pose({
  pelvisX: -0.15, pelvisY: 0.14, pelvisYaw: Math.PI / 2, pelvisPitch: -0.1,
  torsoLean: 0.1, headPitch: -0.15,
  frontShoulderX: -0.2, frontShoulderZ: 0.15, frontElbow: -1.1,
  backShoulderX: -0.2, backShoulderZ: -0.15, backElbow: -1.1,
  frontFootX: 0.15, frontFootY: -0.4, frontFootZ: -0.33,
  backFootX: 0.15, backFootY: -0.4, backFootZ: 0.33,
  frontFootYaw: Math.PI / 2, backFootYaw: Math.PI / 2, boardPitch: 0.15, boardY: -0.06,
});

const STYLE = [0, 0.1, 0.18, 0.2, 0.2, 0.15, 0, 0];
const LEAD = [0, 1, 0.3, 0.6, 0.2, 0.5, 0, 0];

export function poseFor(P: number, n: number, turn: number, speed: number, t: number): Pose {
  const w = rideWeight(P, n);
  const a = smoothstep(0.3, 0.6, P);
  const r = smoothstep(n - 1.65, n - 1.1, P);
  const p = mixPose(paddle(t), RIDE, a);
  p.pelvisY -= 0.25 * Math.sin(Math.PI * a);

  const pc = clamp(P, 0, STYLE.length - 1);
  const i = Math.min(Math.floor(pc), STYLE.length - 2);
  const f = pc - i;
  const e = smoothstep(0, 1, f);
  const crouch = w * (lerp(STYLE[i], STYLE[i + 1], e) + 0.35 * Math.sin(Math.PI * f) + 0.25 * Math.min(Math.abs(turn), 2) + 0.1 * Math.min(speed, 1));
  p.pelvisY -= 0.12 * crouch;
  p.torsoLean += 0.25 * crouch;
  p.frontShoulderZ += 0.3 * crouch;
  p.backShoulderZ -= 0.3 * crouch;
  const lead = w * lerp(LEAD[i], LEAD[i + 1], e);
  p.frontShoulderX -= 0.6 * lead;
  p.frontElbow += 0.3 * lead;

  p.boardRoll = w * clamp(0.5 * turn, -0.45, 0.45);
  p.pelvisRoll = -0.5 * p.boardRoll;
  p.torsoSide = w * clamp(0.2 * turn, -0.2, 0.2);

  p.pelvisY += w * 0.018 * Math.sin(2.2 * t);
  p.pelvisX += w * 0.035 * Math.sin(0.7 * t);
  p.headYaw += w * 0.3 * Math.sin(0.37 * t) * Math.sin(0.11 * t);
  p.frontShoulderZ += w * 0.08 * Math.sin(1.3 * t);
  p.backShoulderZ -= w * 0.08 * Math.sin(1.3 * t + 1.1);

  p.pelvisY += 0.02 * Math.sin(3 * t) * (1 - a);
  const out = mixPose(p, SIT, r);
  const wave = Math.max(0, Math.sin(0.9 * t)) ** 2;
  out.backShoulderZ -= 1.6 * r * wave;
  out.backElbow -= 0.4 * r * wave * Math.sin(5 * t);
  const swing = 0.35 * Math.sin(Math.PI * r);
  out.frontFootZ -= swing;
  out.backFootZ += swing;
  return out;
}

const toonMaterial = () => {
  const gradientMap = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
  gradientMap.minFilter = NearestFilter;
  gradientMap.magFilter = NearestFilter;
  gradientMap.needsUpdate = true;
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "outgoingLight += vec3(1.0, 0.82, 0.55) * pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0) * 0.32;\n#include <opaque_fragment>",
    );
  };
  return m;
};

const part = (geo: BufferGeometry, hex: number, m?: Matrix4) => {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute("uv");
  if (m) g.applyMatrix4(m);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new Color(hex);
  for (let i = 0; i < count; i++) c.toArray(colors, i * 3);
  g.setAttribute("color", new BufferAttribute(colors, 3));
  return g;
};

const at = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const scaled = (x: number, y: number, z: number, from?: Matrix4) => {
  const m = new Matrix4().makeScale(x, y, z);
  return from ? from.multiply(m) : m;
};
const merge = (geos: BufferGeometry[]) => mergeGeometries(geos)!;

const limb = (r0: number, r1: number, len: number, seg: number) => {
  const pts: Vector2[] = [];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new Vector2(Math.sin(a) * r1, -len - Math.cos(a) * r1));
  }
  for (let i = 4; i >= 0; i--) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new Vector2(Math.sin(a) * r0, Math.cos(a) * r0));
  }
  return new LatheGeometry(pts, seg);
};

const boardGeometry = () => {
  const S = 30;
  const R = 16;
  const rings: Vector3[][] = [];
  for (let i = 0; i <= S; i++) {
    const u = i / S;
    const w = halfWidth(u);
    const t = thickness(u);
    const ring: Vector3[] = [];
    for (let j = 0; j < R; j++) {
      const th = (j / R) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      ring.push(new Vector3((u - 0.5) * BOARD.length, rocker(u) + (s >= 0 ? 0.6 : 0.4) * t * s, w * Math.sign(c) * Math.abs(c) ** 0.7));
    }
    rings.push(ring);
  }
  const pos: number[] = [];
  const tri = (a: Vector3, b: Vector3, c: Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < S; i++)
    for (let j = 0; j < R; j++) {
      const j1 = (j + 1) % R;
      tri(rings[i][j], rings[i + 1][j], rings[i][j1]);
      tri(rings[i + 1][j], rings[i + 1][j1], rings[i][j1]);
    }
  const center = new Vector3(-BOARD.length / 2, rocker(0), 0);
  for (let j = 0; j < R; j++) tri(center, rings[0][j], rings[0][(j + 1) % R]);

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();

  const colors = new Float32Array(pos.length);
  const c = new Color();
  for (let k = 0; k < pos.length; k += 9) {
    const cx = (pos[k] + pos[k + 3] + pos[k + 6]) / 3;
    const cy = (pos[k + 1] + pos[k + 4] + pos[k + 7]) / 3;
    const u = cx / BOARD.length + 0.5;
    const top = cy - rocker(u) > 0.09 * thickness(u);
    let hex = PALETTE.teal;
    if (top) hex = u < 0.14 ? PALETTE.teal : u >= 0.62 && u <= 0.68 ? PALETTE.amber : u >= 0.2 && u <= 0.24 ? PALETTE.rust : PALETTE.sand;
    c.set(hex);
    for (let v = 0; v < 3; v++) c.toArray(colors, k + v * 3);
  }
  g.setAttribute("color", new BufferAttribute(colors, 3));
  return g;
};

const finGeometry = (u: number, z: number, toe: number) => {
  const shape = new Shape().moveTo(0.055, 0).lineTo(-0.055, 0).lineTo(-0.085, -0.12).closePath();
  const g = new ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  const m = at((u - 0.5) * BOARD.length, rocker(u) - 0.4 * thickness(u) + 0.02, z).multiply(new Matrix4().makeRotationY(toe)).multiply(at(0, 0, -0.006));
  return part(g, PALETTE.rust, m);
};

const buildBoard = () => {
  const g = merge([boardGeometry(), finGeometry(0.07, 0, 0), finGeometry(0.13, 0.16, -0.08), finGeometry(0.13, -0.16, 0.08)]);
  g.rotateY(Math.PI / 2);
  return g;
};

export function createSurfer({ low = false }: { low?: boolean } = {}) {
  const seg = low ? 6 : 8;
  const material = toonMaterial();
  const mesh = (geo: BufferGeometry, name?: string) => {
    const m = new Mesh(geo, material);
    if (name) m.name = name;
    return m;
  };
  const group = (x = 0, y = 0, z = 0) => {
    const g = new Group();
    g.position.set(x, y, z);
    return g;
  };

  const rig = new Group();
  rig.rotation.order = "YXZ";
  const board = group();
  const boardMesh = mesh(buildBoard(), "boardMesh");
  board.add(boardMesh);
  rig.add(board);

  const stand = group();
  stand.rotation.y = Math.PI / 2;
  board.add(stand);

  const pelvis = group();
  pelvis.rotation.order = "YXZ";
  const rotX = new Matrix4().makeRotationX(Math.PI / 2);
  pelvis.add(
    mesh(
      merge([
        part(new SphereGeometry(0.13, 12, 8), PALETTE.shorts, scaled(1.2, 0.8, 0.9)),
        part(new TorusGeometry(0.108, 0.016, 6, 16), PALETTE.rust, at(0, 0.05, 0).multiply(scaled(1.2, 1, 0.9, rotX.clone()))),
      ]),
    ),
  );
  stand.add(pelvis);

  const kneeBall = (r: number, hex: number) => part(new SphereGeometry(r, 8, 6), hex);
  const thighGeo = merge([kneeBall(0.098, PALETTE.shorts), part(limb(0.095, 0.074, L1, seg), PALETTE.shorts), part(new SphereGeometry(0.074, 8, 6), PALETTE.skin, at(0, -L1, 0))]);
  const shinGeo = merge([part(limb(0.075, 0.052, L2, seg), PALETTE.skin), part(new SphereGeometry(0.06, 8, 6), PALETTE.skin, scaled(1, 1.6, 1, at(0, -0.12, -0.02)))]);
  const footGeo = part(new SphereGeometry(0.05, 8, 6), PALETTE.skin, scaled(1.1, 0.6, 2.8, at(0, -0.035, 0.07)));
  const makeLeg = (side: 1 | -1, name: string) => {
    const hip = group(side * HIP.x, HIP.y, 0);
    hip.add(mesh(thighGeo));
    const knee = group(0, -L1, 0);
    knee.add(mesh(shinGeo));
    const ankle = group(0, -L2, 0);
    ankle.add(mesh(footGeo, name));
    knee.add(ankle);
    hip.add(knee);
    pelvis.add(hip);
    return { hip, knee, ankle };
  };
  const front = makeLeg(1, "footFront");
  const back = makeLeg(-1, "footBack");

  const torso = group(0, 0.06, 0);
  torso.rotation.order = "YXZ";
  const profile = [[0, -0.02], [0.12, 0], [0.12, 0.12], [0.14, 0.3], [0.15, 0.42], [0.14, 0.5], [0.08, 0.55], [0, 0.56]].map(([r, y]) => new Vector2(r, y));
  const torsoMesh = mesh(
    merge([
      part(new LatheGeometry(profile, 12), PALETTE.amber, scaled(1, 1, 0.72)),
      part(new TorusGeometry(0.085, 0.02, 6, 12), PALETTE.sand, at(0, 0.55, 0).multiply(rotX)),
    ]),
  );
  torso.add(torsoMesh);
  pelvis.add(torso);

  const upperGeo = merge([part(limb(0.075, 0.062, 0.25, seg), PALETTE.amber), part(new SphereGeometry(0.075, 8, 6), PALETTE.amber), part(new TorusGeometry(0.06, 0.014, 6, 10), PALETTE.rust, at(0, -0.23, 0).multiply(rotX.clone()))]);
  const foreGeo = merge([part(limb(0.06, 0.048, 0.23, seg), PALETTE.skin), part(new SphereGeometry(0.058, 8, 6), PALETTE.skin), part(new SphereGeometry(0.055, 8, 6), PALETTE.skin, scaled(1, 1.3, 0.7, at(0, -0.29, 0)))]);
  const makeArm = (side: 1 | -1) => {
    const shoulder = group(side * 0.19, 0.46, 0);
    shoulder.add(mesh(upperGeo));
    const elbow = group(0, -0.25, 0);
    elbow.add(mesh(foreGeo));
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const frontArm = makeArm(1);
  const backArm = makeArm(-1);

  const head = group(0, 0.54, 0);
  head.rotation.order = "YXZ";
  head.add(
    mesh(
      merge([
        part(limb(0.055, 0.055, 0.11, seg), PALETTE.skin, at(0, 0.03, 0)),
        part(new SphereGeometry(0.15, 14, 10), PALETTE.skin, at(0, 0.21, 0)),
        part(new SphereGeometry(0.1, 10, 8), PALETTE.skin, at(0, 0.14, 0.02).multiply(scaled(1, 0.8, 0.9))),
        part(new SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, 0.5 * Math.PI), PALETTE.hair, at(0, 0.21, 0).multiply(new Matrix4().makeRotationX(-0.6))),
        part(new SphereGeometry(0.06, 8, 6), PALETTE.skin, at(0, 0.27, 0.11).multiply(scaled(1.5, 0.7, 0.8))),
        part(new SphereGeometry(0.07, 8, 6), PALETTE.hair, at(0, 0.31, -0.06).multiply(scaled(1.2, 0.8, 1.3))),
        part(new SphereGeometry(0.03, 6, 4), PALETTE.skin, at(0.15, 0.2, 0).multiply(scaled(0.5, 1, 0.8))),
        part(new SphereGeometry(0.03, 6, 4), PALETTE.skin, at(-0.15, 0.2, 0).multiply(scaled(0.5, 1, 0.8))),
        part(new SphereGeometry(0.028, 6, 4), PALETTE.skin, at(0, 0.19, 0.15)),
        part(new SphereGeometry(0.018, 6, 4), PALETTE.ink, at(0.055, 0.225, 0.14)),
        part(new SphereGeometry(0.018, 6, 4), PALETTE.ink, at(-0.055, 0.225, 0.14)),
      ]),
    ),
  );
  torso.add(head);

  const applied = pose({});
  Object.assign(applied, RIDE);

  const armSpring = { x: 0, v: 0 };
  const heaveSpring = { x: 0, v: 0 };
  const tmp = { yPrev: 0, vyPrev: 0, rollPrev: 0 };
  const contact: Contact = { position: new Vector3(), forward: new Vector2(0, -1), rail: new Vector3(), roll: 0, wake: 0 };

  const inverse = new Matrix4();
  const target = new Vector3();
  const d = new Vector3();
  const axis = new Vector3();
  const down = new Vector3(0, -1, 0);
  const zAxis = new Vector3(0, 0, 1);
  const qa = new Quaternion();
  const qb = new Quaternion();
  const qc = new Quaternion();
  const yawQ = new Quaternion();

  const solveLeg = (leg: typeof front, side: 1 | -1, x: number, y: number, z: number, yaw: number) => {
    target.set(x, y, z).applyMatrix4(inverse);
    d.copy(target).sub(leg.hip.position.set(side * HIP.x, HIP.y, 0));
    const dist = Math.min(d.length(), L1 + L2 - 1e-3);
    d.normalize();
    const a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
    const k = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1));
    axis.crossVectors(d, zAxis);
    if (axis.lengthSq() < 1e-8) axis.set(-1, 0, 0);
    axis.normalize();
    qa.setFromAxisAngle(axis, a).multiply(qb.setFromUnitVectors(down, d));
    leg.hip.quaternion.copy(qa);
    axis.applyQuaternion(qc.copy(qa).invert());
    leg.knee.quaternion.setFromAxisAngle(axis, -k);
    yawQ.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    leg.ankle.quaternion.copy(qa).multiply(leg.knee.quaternion).invert().multiply(qc.copy(pelvis.quaternion).invert()).multiply(yawQ);
  };

  const stepSpring = (s: { x: number; v: number }, goal: number, dt: number) => {
    const c = 2 * 0.5 * Math.sqrt(60);
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 30);
      s.v += (-60 * (s.x - goal) - c * s.v) * h;
      s.x += s.v * h;
      left -= h;
    }
  };

  const right = new Vector3();
  const flat = new Vector3();
  const rail = new Vector3();

  const update = (pos: Vector3, tangent: Vector3, input: SurferInput) => {
    const { P, turn, speed, time: t, dt, cut, flow } = input;
    flat.copy(tangent).setY(0).normalize();
    right.set(-flat.z, 0, flat.x);
    const h = (x: number, z: number) => swellAt(x + flow.x, z + flow.y, t);
    const hC = h(pos.x, pos.z);
    const hN = h(pos.x + flat.x * 0.85, pos.z + flat.z * 0.85);
    const hT = h(pos.x - flat.x * 0.85, pos.z - flat.z * 0.85);
    const hR = h(pos.x + right.x * 0.25, pos.z + right.z * 0.25);
    const hL = h(pos.x - right.x * 0.25, pos.z - right.z * 0.25);

    const goal = poseFor(P, N, turn, speed, t);
    if (cut) Object.assign(applied, goal);
    else {
      const k = 1 - Math.exp(-10 * dt);
      for (const key of KEYS) applied[key] += (goal[key] - applied[key]) * k;
    }

    const roll = Math.atan((hR - hL) / 0.5);
    const y = (hC + hN + hT) / 3 + applied.boardY;
    rig.position.set(pos.x, y, pos.z);
    rig.rotation.set(Math.atan((hN - hT) / 1.7), Math.atan2(-flat.x, -flat.z), roll);

    if (cut || dt <= 0) {
      armSpring.x = armSpring.v = heaveSpring.x = heaveSpring.v = 0;
      if (cut) {
        tmp.yPrev = y;
        tmp.vyPrev = 0;
        tmp.rollPrev = roll;
      }
    } else {
      const vy = (y - tmp.yPrev) / dt;
      const acc = (vy - tmp.vyPrev) / dt;
      stepSpring(armSpring, clamp(2 * ((roll - tmp.rollPrev) / dt), -0.6, 0.6), dt);
      stepSpring(heaveSpring, clamp(-0.01 * acc, -0.08, 0.04), dt);
      tmp.yPrev = y;
      tmp.vyPrev = vy;
      tmp.rollPrev = roll;
    }
    const p = applied;

    board.rotation.set(p.boardPitch, 0, p.boardRoll);
    pelvis.position.set(p.pelvisX, p.pelvisY + heaveSpring.x, 0);
    pelvis.rotation.set(p.pelvisPitch, p.pelvisYaw, p.pelvisRoll);
    pelvis.updateMatrix();
    torso.rotation.set(p.torsoLean, p.torsoTwist, p.torsoSide);
    head.rotation.set(p.headPitch, p.headYaw, 0);
    frontArm.shoulder.rotation.set(p.frontShoulderX, 0, p.frontShoulderZ + armSpring.x);
    backArm.shoulder.rotation.set(p.backShoulderX, 0, p.backShoulderZ - armSpring.x);
    frontArm.elbow.rotation.x = p.frontElbow;
    backArm.elbow.rotation.x = p.backElbow;
    torsoMesh.scale.y = 1 + 0.012 * Math.sin(1.6 * t);

    inverse.copy(pelvis.matrix).invert();
    solveLeg(front, 1, p.frontFootX, p.frontFootY, p.frontFootZ, p.frontFootYaw);
    solveLeg(back, -1, p.backFootX, p.backFootY, p.backFootZ, p.backFootYaw);

    rig.updateMatrixWorld(true);
    const a = smoothstep(0.3, 0.6, P);
    const r = smoothstep(N - 1.65, N - 1.1, P);
    contact.position.set(pos.x, hC, pos.z);
    contact.forward.set(flat.x, flat.z);
    contact.roll = p.boardRoll;
    contact.wake = lerp(lerp(0.35, 1, a), 0.1, r);
    rail.set(p.boardRoll >= 0 ? -0.27 : 0.27, 0.02, 0.35);
    contact.rail.copy(board.localToWorld(rail));
  };

  return { rig, update, contact };
}
