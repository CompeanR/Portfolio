import { Box3, Mesh, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { STOPS } from "./ride";
import { BOARD, createSurfer, deckY, poseFor, rideWeight } from "./surfer";

const N = STOPS.length;
const KEYS = Object.keys(poseFor(0, N, 0, 0, 0)) as (keyof ReturnType<typeof poseFor>)[];

const place = (P: number, turn: number) => {
  const s = createSurfer();
  s.update(new Vector3(), new Vector3(0, 0, -1), { P, turn, speed: 0, time: 0, dt: 0.016, cut: true, flow: new Vector2() });
  return s;
};

describe("poseFor", () => {
  it("goes from prone to riding to seated", () => {
    expect(poseFor(0, N, 0, 0, 0).pelvisPitch).toBeCloseTo(Math.PI / 2, 5);
    expect(Math.abs(poseFor(2, N, 0, 0, 0).pelvisPitch)).toBeLessThan(0.3);
    const end = poseFor(N - 1, N, 0, 0, 0);
    expect(end.pelvisYaw).toBeCloseTo(Math.PI / 2, 5);
    expect(end.boardPitch).toBeCloseTo(0.15, 5);
    expect(end.frontFootY).toBeLessThan(0);
    expect(end.backFootY).toBeLessThan(0);
  });

  it("changes continuously and stays finite", () => {
    let prev = poseFor(0, N, 0.4, 0.5, 3);
    for (let P = 0.001; P <= N - 1; P += 0.001) {
      const next = poseFor(P, N, 0.4, 0.5, 3);
      for (const k of KEYS) {
        expect(Number.isFinite(next[k])).toBe(true);
        expect(Math.abs(next[k] - prev[k])).toBeLessThan(0.05);
      }
      prev = next;
    }
  });

  it("leans into the turn and clamps the roll", () => {
    for (const turn of [-0.5, 0.5]) expect(Math.sign(poseFor(3, N, turn, 0, 0).boardRoll)).toBe(Math.sign(turn));
    for (const turn of [-10, 10]) expect(Math.abs(poseFor(3, N, turn, 0, 0).boardRoll)).toBeLessThanOrEqual(0.45);
  });

  it("is deterministic", () => {
    expect(poseFor(2.3, N, 0.7, 0.4, 5)).toEqual(poseFor(2.3, N, 0.7, 0.4, 5));
  });

  it("weighs the ride only mid-scroll", () => {
    expect(rideWeight(0)).toBe(0);
    expect(rideWeight(3)).toBe(1);
    expect(rideWeight(N - 1)).toBe(0);
  });
});

describe("createSurfer", () => {
  it("keeps both feet on the deck", () => {
    for (const P of [1, 2, 3, 4, 5, 6])
      for (const turn of [-1, 0, 1]) {
        const s = place(P, turn);
        const board = s.rig.getObjectByName("boardMesh")!.parent!;
        for (const name of ["footFront", "footBack"]) {
          const foot = s.rig.getObjectByName(name)!;
          const sole = board.worldToLocal(foot.localToWorld(new Vector3(0, -0.06, 0.06)));
          expect(Math.abs(sole.y - deckY(-sole.z))).toBeLessThan(0.02);
        }
      }
  });

  it("has a human scale and a small budget", () => {
    const s = place(2, 0);
    const boardMesh = s.rig.getObjectByName("boardMesh")!;
    const boardBox = new Box3().setFromObject(boardMesh);
    const size = boardBox.getSize(new Vector3());
    expect(size.z).toBeGreaterThan(1.8);
    expect(size.z).toBeLessThan(2.0);
    expect(BOARD.length).toBeGreaterThan(1.8);
    const box = new Box3().setFromObject(s.rig);
    const height = box.max.y - deckY(0);
    expect(height).toBeGreaterThan(1.45);
    expect(height).toBeLessThan(1.75);

    let meshes = 0;
    let tris = 0;
    const materials = new Set();
    s.rig.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      meshes++;
      materials.add(o.material);
      tris += o.geometry.attributes.position.count / 3;
    });
    expect(meshes).toBeLessThanOrEqual(16);
    expect(materials.size).toBe(1);
    expect(tris).toBeLessThanOrEqual(6000);
  });
});
