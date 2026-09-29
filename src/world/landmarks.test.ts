import { describe, expect, it } from "vitest";
import { Mesh, Vector3 } from "three";
import { anchorFor, buoyPositions, createLandmarks } from "./landmarks";
import { createPath } from "./ride";

const curve = createPath();
const samples = Array.from({ length: 400 }, (_, i) => curve.getPoint(i / 399));
const minDist = (p: Vector3) => Math.min(...samples.map((s) => Math.hypot(s.x - p.x, s.z - p.z)));

describe("landmarks", () => {
  it("keep clear of the ride path", () => {
    for (const [stop, dist, lat] of [
      [1, 36, 4],
      [2, 26, -3],
      [3, 32, 3],
    ]) expect(minDist(anchorFor(curve, stop, dist, lat).position)).toBeGreaterThanOrEqual(8);
    for (const b of buoyPositions(curve)) expect(minDist(b)).toBeGreaterThanOrEqual(2.5);
  });

  it("stay inside the draw and triangle budget", () => {
    const { group } = createLandmarks(curve, false);
    expect(group.children.length).toBeLessThanOrEqual(7);
    let tris = 0;
    for (const m of group.children as Mesh[]) {
      const g = m.geometry;
      const count = (g.index ? g.index.count : g.getAttribute("position").count) / 3;
      tris += count * ("count" in m ? (m as unknown as { count: number }).count : 1);
    }
    expect(tris).toBeLessThanOrEqual(9000);
  });
});
