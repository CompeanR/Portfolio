import { CatmullRomCurve3, Vector3 } from "three";

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

const DAY = { seaDeep: 0x0b4558, seaShallow: 0x3a8ea1 };
const DUSK = { seaDeep: 0x0a2f3d, seaShallow: 0x1f5a66 };
const EMBER = 0xc8541e;

export const STOPS: Stop[] = [
  { id: "hero", shot: shot(9, 2.2, -3, 1.4, 38), mood: { skyTop: 0x0c2a33, horizon: 0x3f8a9a, sun: 0xf2a63a, elevation: 6, night: 0.2, ...DAY, glow: 0xc8541e } },
  { id: "pemex", shot: shot(7, 1.8, 3.5, 1.0, 38), mood: { skyTop: 0x164f63, horizon: 0x7fb6bf, sun: 0xfde3b0, elevation: 14, night: 0.05, ...DAY, glow: 0xc8541e } },
  { id: "remine", shot: shot(6, 1.6, 4, 0.9, 38), mood: { skyTop: 0x1d6b82, horizon: 0xa9d3d6, sun: 0xfff1d0, elevation: 25, night: 0, ...DAY, glow: 0xc8541e } },
  { id: "verseguard", shot: shot(5.5, 1.2, -5.5, 0.9, 36), mood: { skyTop: 0x2a86a0, horizon: 0xcfe7e4, sun: 0xfff1d0, elevation: 55, night: 0, ...DAY, glow: 0xc8541e } },
  { id: "puertoloqueron", shot: shot(4.5, 0.6, 2, 1.2, 42), mood: { skyTop: 0x2e7b90, horizon: 0xf3dcb2, sun: 0xfff1d0, elevation: 35, night: 0, ...DAY, glow: 0xc8541e } },
  { id: "recibidor", shot: shot(7, 3.5, -3, 0.6, 38), mood: { skyTop: 0x25607a, horizon: 0xf5c27a, sun: 0xf5a31a, elevation: 18, night: 0, ...DAY, glow: 0xc8541e } },
  { id: "earlier", shot: shot(10, 4, 2, 0.8, 40), mood: { skyTop: 0x1b4a60, horizon: 0xf0a45a, sun: 0xf5a31a, elevation: 8, night: 0.1, ...DAY, glow: EMBER } },
  { id: "contact", shot: shot(7, 1.4, -2, 1.6, 38), mood: { skyTop: 0x0c2a33, horizon: 0xb23a0b, sun: 0xf28a3a, elevation: 0, night: 0.6, ...DUSK, glow: EMBER } },
];

const READING_LINE = 0.6;
const STOP_SPACING = 26;
const MID_OFFSET = 5;

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

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

export type TierInput = { width: number; dpr: number; coarse?: boolean; cores?: number; memory?: number };

export function tierFor({ width, dpr, coarse = false, cores = 8, memory = 8 }: TierInput) {
  const low = coarse || width < 768 || cores <= 4 || memory <= 4;
  return low
    ? { low, dpr: Math.min(dpr, 1.5), antialias: false, seaSize: 50, seaSegments: 72, octaves: 1, wakePoints: 64, idleFps: 30 }
    : { low, dpr: Math.min(dpr, 1.75), antialias: true, seaSize: 70, seaSegments: 128, octaves: 3, wakePoints: 160, idleFps: 60 };
}
