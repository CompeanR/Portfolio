/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SWELL, SWELL_GLSL, swellAt } from "./swell";
import { Color, PerspectiveCamera, Vector3 } from "three";
import { STOPS, createPath, framingFor, holdsFrom, mergeStops, moodAt, pathAt, progressAt, shotAt, shotPose, tierFor } from "./ride";

const VH = 800;
const rects = [
  { id: "a", top: 0, bottom: 600 },
  { id: "b", top: 1000, bottom: 1500 },
  { id: "c", top: 2000, bottom: 2400 },
];
const MAX = 2400;
const holds = holdsFrom(rects, VH, MAX);

describe("progressAt", () => {
  it("spans 0 to N-1", () => {
    expect(progressAt(0, holds, VH)).toBe(0);
    expect(progressAt(MAX, holds, VH)).toBe(2);
  });

  it("is exact inside a hold", () => {
    expect(progressAt(1200 - 0.6 * VH, holds, VH)).toBe(1);
    expect(progressAt(100, holds, VH)).toBe(0);
  });

  it("is halfway at the middle of a gap", () => {
    expect(progressAt(800 - 0.6 * VH, holds, VH)).toBeCloseTo(0.5, 10);
  });

  it("never decreases, is finite and stays in range", () => {
    let prev = 0;
    for (let y = 0; y <= MAX; y++) {
      const p = progressAt(y, holds, VH);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeLessThanOrEqual(2);
      prev = p;
    }
  });

  it("steps cleanly across overlapping or zero gaps", () => {
    const h = holdsFrom(
      [
        { id: "a", top: 0, bottom: 700 },
        { id: "b", top: 500, bottom: 900 },
        { id: "c", top: 900, bottom: 1200 },
      ],
      VH,
      1200,
    );
    let prev = 0;
    for (let y = 0; y <= 1200; y++) {
      const p = progressAt(y, h, VH);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(prev).toBe(2);
  });

  it("reaches N-1 when the last stop is unreachable", () => {
    const h = holdsFrom([...rects.slice(0, 2), { id: "c", top: 5000, bottom: 5400 }], VH, 1000);
    expect(progressAt(1000, h, VH)).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(progressAt(500, [], VH)).toBe(0);
  });

  it("merges elements with the same id into one hold", () => {
    const merged = mergeStops([
      { id: "earlier", top: 3000, bottom: 3400 },
      { id: "earlier", top: 3400, bottom: 4000 },
    ]);
    expect(merged).toEqual([{ id: "earlier", top: 3000, bottom: 4000 }]);
  });
});

describe("shots and moods", () => {
  it("are exact at whole numbers and continuous around them", () => {
    STOPS.forEach((stop, i) => {
      expect(shotAt(i)).toEqual(stop.shot);
      expect(moodAt(i)).toEqual(stop.mood);
      for (const d of [-1e-6, 1e-6]) {
        const s = shotAt(i + d);
        for (const [k, v] of Object.entries(stop.shot)) expect(s[k as keyof typeof s]).toBeCloseTo(v as number, 4);
        const m = moodAt(i + d);
        for (const [k, v] of Object.entries(stop.mood)) {
          if (typeof v === "number") expect(m[k as keyof typeof m]).toBeCloseTo(v, 4);
        }
      }
    });
  });
});

describe("moods", () => {
  it("keep the sea saturated and the deep water darker", () => {
    for (const stop of STOPS) {
      const shallow = new Color(stop.mood.seaShallow).getHSL({ h: 0, s: 0, l: 0 });
      const deep = new Color(stop.mood.seaDeep).getHSL({ h: 0, s: 0, l: 0 });
      expect(shallow.s).toBeGreaterThanOrEqual(0.35);
      expect(deep.l).toBeLessThan(shallow.l);
    }
  });
});

describe("framing", () => {
  const curve = createPath();
  const measure = (w: number, h: number, i: number) => {
    const out = { position: new Vector3(), target: new Vector3(), fov: 0 };
    shotPose(curve, i, w / h, out);
    const camera = new PerspectiveCamera(out.fov, w / h, 0.1, 200);
    camera.position.copy(out.position);
    camera.lookAt(out.target);
    const f = framingFor(w, h);
    camera.setViewOffset(w, h, -(f.x - 0.5) * w, -(f.y - 0.5) * h, w, h);
    camera.updateMatrixWorld();
    const feet = pathAt(curve, i);
    const a = feet.clone().project(camera);
    const b = feet.clone().add(new Vector3(0, 1.6, 0)).project(camera);
    return { height: Math.abs(b.y - a.y) / 2, centerY: 1 - ((a.y + b.y) / 4 + 0.5) };
  };

  it("keeps the surfer 17-30% of the desktop frame on ride stops", () => {
    for (let i = 1; i <= 6; i++) {
      const { height } = measure(1440, 900, i);
      expect(height).toBeGreaterThanOrEqual(0.17);
      expect(height).toBeLessThanOrEqual(0.3);
    }
  });

  it("keeps the surfer 10-19% of the phone frame, low in the frame", () => {
    STOPS.forEach((_, i) => {
      const { height, centerY } = measure(390, 844, i);
      expect(height).toBeGreaterThanOrEqual(0.1);
      expect(height).toBeLessThanOrEqual(0.19);
      expect(centerY).toBeGreaterThanOrEqual(0.74);
      expect(centerY).toBeLessThanOrEqual(0.86);
    });
  });
});

describe("path", () => {
  it("passes through each stop", () => {
    const curve = createPath();
    const points = curve.points;
    STOPS.forEach((_, i) => {
      expect(pathAt(curve, i).distanceTo(points[2 * i])).toBeLessThan(1e-6);
    });
  });
});

describe("tierFor", () => {
  it("is low on a phone", () => {
    const t = tierFor({ width: 390, dpr: 3 });
    expect(t.low).toBe(true);
    expect(t.dpr).toBe(1.5);
  });

  it("is high on an 8-core desktop", () => {
    expect(tierFor({ width: 1440, dpr: 2, cores: 8, memory: 8 }).low).toBe(false);
  });
});

describe("swell", () => {
  it("shares its constants with the shader", () => {
    for (const v of Object.values(SWELL)) expect(SWELL_GLSL).toMatch(new RegExp(`(?<![\\d.])${v.toFixed(2).replace(".", "\\.")}(?![\\d])`));
  });

  it("is deterministic", () => {
    expect(swellAt(1.5, -2, 3)).toBe(swellAt(1.5, -2, 3));
  });
});

describe("index.html", () => {
  it("lists the stops in ride order", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const ids = [...html.matchAll(/data-stop="([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set(ids)]).toEqual([
      "hero",
      "pemex",
      "remine",
      "verseguard",
      "puertoloqueron",
      "recibidor",
      "earlier",
      "contact",
    ]);
    expect([...new Set(ids)]).toEqual(STOPS.map((s) => s.id));
  });

  it("wraps section titles in a span", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const main = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
    const h2s = [...main.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(h2s).toHaveLength(4);
    for (const h of h2s) expect(h).toMatch(/^<span>[^<]+<\/span>$/);
  });
});
