import { CatmullRomCurve3, Vector3 } from "three";

const UP = new Vector3(0, 1, 0);

export type StopRect = { id: string; top: number; bottom: number };
export type Hold = { a: number; b: number };

export type Shot = { back: number; up: number; side: number; lookUp: number; fov: number };
export type Mood = {
  skyTop: number;
  horizon: number;
  sun: number;
  elevation: number;
  night: number;
  seaDeep: number;
  seaShallow: number;
  glow: number;
};
export type Stop = { id: string; shot: Shot; mood: Mood };

const shot = (back: number, up: number, side: number, lookUp: number, fov: number): Shot => ({ back, up, side, lookUp, fov });

export const STOPS: Stop[] = [
  { id: "hero", shot: shot(7.0, 1.4, -6.5, 0.35, 34), mood: { skyTop: 0x163f5a, horizon: 0xd99a73, sun: 0xffc27a, elevation: 5, night: 0.25, seaDeep: 0x0b3f52, seaShallow: 0x2f8595, glow: 0xe07a4a } },
  { id: "pemex", shot: shot(9.0, 2.0, 4.5, 0.85, 36), mood: { skyTop: 0x1b5a7a, horizon: 0xeec9a2, sun: 0xffe2b4, elevation: 14, night: 0.05, seaDeep: 0x0d4a60, seaShallow: 0x3a98a8, glow: 0xeaa066 } },
  { id: "remine", shot: shot(8.5, 1.7, 5.5, 0.85, 36), mood: { skyTop: 0x1f6f93, horizon: 0xf0d6b0, sun: 0xfff1d6, elevation: 30, night: 0, seaDeep: 0x125a73, seaShallow: 0x45aab8, glow: 0xf2d2a0 } },
  { id: "verseguard", shot: shot(8.0, 0.8, 6.0, 0.9, 38), mood: { skyTop: 0x2379a6, horizon: 0xf6e4c6, sun: 0xfff6e0, elevation: 58, night: 0, seaDeep: 0x1f6a80, seaShallow: 0x4fb3bf, glow: 0xfff1d0 } },
  { id: "puertoloqueron", shot: shot(9.5, 1.4, -3.0, 0.85, 36), mood: { skyTop: 0x2a7c9c, horizon: 0xf3c88c, sun: 0xfff0cc, elevation: 38, night: 0, seaDeep: 0x1a6178, seaShallow: 0x49a7b2, glow: 0xf6c98a } },
  { id: "recibidor", shot: shot(9.5, 3.6, -3.5, 0.75, 36), mood: { skyTop: 0x25607a, horizon: 0xf5c27a, sun: 0xf5a31a, elevation: 18, night: 0, seaDeep: 0x14506a, seaShallow: 0x3d8f9c, glow: 0xf0a050 } },
  { id: "earlier", shot: shot(11.5, 4.2, 2.5, 0.8, 38), mood: { skyTop: 0x1b4a60, horizon: 0xf0a45a, sun: 0xf5a31a, elevation: 8, night: 0.1, seaDeep: 0x103f55, seaShallow: 0x357f8c, glow: 0xc8541e } },
  { id: "contact", shot: shot(9.0, 1.2, -1.5, 0.55, 36), mood: { skyTop: 0x16283f, horizon: 0xc6481a, sun: 0xffb070, elevation: 1, night: 0.6, seaDeep: 0x0a2f3d, seaShallow: 0x1f5a66, glow: 0xc8541e } },
];

const READING_LINE = 0.6;
const STOP_SPACING = 26;
const MID_OFFSET = 5;

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, f: number) => a * (1 - f) + b * f;

const lerpHex = (a: number, b: number, f: number) => {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    out = (out << 8) | Math.round(lerp((a >> shift) & 255, (b >> shift) & 255, f));
  }
  return out;
};

const segment = (P: number, n: number) => {
  const p = Math.min(n - 1, Math.max(0, Number.isFinite(P) ? P : 0));
  const i = Math.min(Math.floor(p), n - 2);
  return { i, f: p - i };
};

export function mergeStops(rects: StopRect[]): StopRect[] {
  const merged = new Map<string, StopRect>();
  for (const r of rects) {
    const m = merged.get(r.id);
    if (!m) merged.set(r.id, { ...r });
    else {
      m.top = Math.min(m.top, r.top);
      m.bottom = Math.max(m.bottom, r.bottom);
    }
  }
  return [...merged.values()];
}

export function holdsFrom(stops: StopRect[], vh: number, maxScroll: number): Hold[] {
  const limit = maxScroll + READING_LINE * vh;
  const holds = stops.map((s) => {
    const a = Math.min(s.top, limit);
    return { a, b: Math.min(Math.max(s.bottom, a), limit) };
  });
  for (let i = 0; i < holds.length - 1; i++) {
    holds[i].b = Math.max(holds[i].a, Math.min(holds[i].b, holds[i + 1].a));
  }
  return holds;
}

export function progressAt(scrollY: number, holds: Hold[], vh: number): number {
  if (holds.length === 0) return 0;
  const L = scrollY + READING_LINE * vh;
  for (let i = 0; i < holds.length; i++) {
    if (L < holds[i].a) {
      if (i === 0) return 0;
      const prev = holds[i - 1].b;
      return i - 1 + smoothstep((L - prev) / (holds[i].a - prev));
    }
    if (L < holds[i].b || i === holds.length - 1) return i;
  }
  return holds.length - 1;
}

export function pathPoints(n: number): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    points.push(new Vector3(0, 0, -i * STOP_SPACING));
    if (i < n - 1) points.push(new Vector3(i % 2 === 0 ? MID_OFFSET : -MID_OFFSET, 0, -(i + 0.5) * STOP_SPACING));
  }
  return points;
}

export function createPath(n: number = STOPS.length): CatmullRomCurve3 {
  return new CatmullRomCurve3(pathPoints(n), false, "centripetal");
}

export function pathAt(curve: CatmullRomCurve3, P: number, n: number = STOPS.length): Vector3 {
  return curve.getPoint(Math.min(1, Math.max(0, P / (n - 1))));
}

export function shotAt(P: number): Shot {
  const { i, f } = segment(P, STOPS.length);
  const e = smoothstep(f);
  const a = STOPS[i].shot;
  const b = STOPS[i + 1].shot;
  return {
    back: lerp(a.back, b.back, e),
    up: lerp(a.up, b.up, e),
    side: lerp(a.side, b.side, e),
    lookUp: lerp(a.lookUp, b.lookUp, e),
    fov: lerp(a.fov, b.fov, e),
  };
}

export function moodAt(P: number): Mood {
  const { i, f } = segment(P, STOPS.length);
  const a = STOPS[i].mood;
  const b = STOPS[i + 1].mood;
  return {
    skyTop: lerpHex(a.skyTop, b.skyTop, f),
    horizon: lerpHex(a.horizon, b.horizon, f),
    sun: lerpHex(a.sun, b.sun, f),
    elevation: lerp(a.elevation, b.elevation, f),
    night: lerp(a.night, b.night, f),
    seaDeep: lerpHex(a.seaDeep, b.seaDeep, f),
    seaShallow: lerpHex(a.seaShallow, b.seaShallow, f),
    glow: lerpHex(a.glow, b.glow, f),
  };
}

export function framingFor(w: number, h: number) {
  const lane = w >= 1024 && w / h > 1.1;
  return lane ? { x: 0.7, y: 0.52 } : { x: 0.5, y: h > w ? 0.8 : 0.72 };
}

export function shotPose(curve: CatmullRomCurve3, P: number, aspect: number, out: { position: Vector3; target: Vector3; fov: number }): void {
  const p = Math.min(STOPS.length - 1, Math.max(0, P));
  const pos = pathAt(curve, p);
  const tangent = curve.getTangent(p / (STOPS.length - 1)).setY(0).normalize();
  const right = new Vector3().crossVectors(tangent, UP).normalize();
  const shot = shotAt(p);
  const beat = Math.sin(Math.PI * (p - Math.floor(p)));
  const portrait = aspect < 1;
  const back = (shot.back - 1.5 * beat) * (portrait ? 1.1 : 1);
  out.position.copy(pos).addScaledVector(tangent, -back).addScaledVector(right, shot.side).addScaledVector(UP, shot.up - 0.6 * beat);
  out.target.copy(pos).addScaledVector(UP, shot.lookUp);
  out.fov = portrait ? 50 : shot.fov;
}

export type Tier = ReturnType<typeof tierFor>;
export type TierInput = { width: number; dpr: number; coarse?: boolean; cores?: number; memory?: number };

export function tierFor({ width, dpr, coarse = false, cores = 8, memory = 8 }: TierInput) {
  const low = coarse || width < 768 || cores <= 4 || memory <= 4;
  return low
    ? { low, dpr: Math.min(dpr, 1.5), antialias: false, seaSize: 50, seaSegments: 72, octaves: 1, wakePoints: 64, idleFps: 30 }
    : { low, dpr: Math.min(dpr, 1.75), antialias: true, seaSize: 70, seaSegments: 128, octaves: 3, wakePoints: 160, idleFps: 60 };
}
