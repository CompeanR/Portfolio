import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createSpray } from "./spray";

describe("spray", () => {
  it("keeps a fixed buffer and finite positions", () => {
    const spray = createSpray(96);
    for (let i = 0; i < 20; i++) {
      spray.emit(new Vector3(1, 0, 2), new Vector3(0, 2, -1), 50);
      spray.update(0.016);
    }
    const pos = spray.points.geometry.getAttribute("position");
    expect(pos.count).toBe(96);
    for (const v of pos.array) expect(Number.isFinite(v)).toBe(true);
  });
});
