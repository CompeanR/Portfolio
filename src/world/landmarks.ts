import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  RedFormat,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import type { CatmullRomCurve3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STOPS, pathAt } from "./ride";
import { swellAt } from "./swell";

const UP = new Vector3(0, 1, 0);
const PALETTE = { ink: 0x0c2a33, sand: 0xfff4e2, amber: 0xf5a31a, rust: 0xb23a0b, blue: 0x1f4e8c, red: 0xb7131a, green: 0x1f9d6a, rock: 0x35535c, white: 0xffffff };

export function anchorFor(curve: CatmullRomCurve3, i: number, dist: number, lat: number) {
  const pos = pathAt(curve, i);
  const tangent = curve.getTangent(i / (STOPS.length - 1)).setY(0).normalize();
  const right = new Vector3().crossVectors(tangent, UP).normalize();
  const { back, side } = STOPS[i].shot;
  const dir = tangent.multiplyScalar(back).addScaledVector(right, -side).normalize();
  const perp = new Vector3(-dir.z, 0, dir.x);
  return { position: pos.addScaledVector(dir, dist).addScaledVector(perp, lat), perp };
}

const part = (geo: BufferGeometry, hex: number | ((y: number) => number), matrix?: Matrix4) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  if (matrix) g.applyMatrix4(matrix);
  const p = g.getAttribute("position");
  const c = new Float32Array(p.count * 3);
  const color = new Color();
  for (let i = 0; i < p.count; i++) {
    color.setHex(typeof hex === "number" ? hex : hex(p.getY(i)));
    c.set([color.r, color.g, color.b], i * 3);
  }
  g.setAttribute("color", new (p.constructor as typeof import("three").BufferAttribute)(c, 3));
  return g;
};

const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => new Matrix4().makeTranslation(x, y, z).scale(new Vector3(sx, sy, sz));
const merge = (parts: BufferGeometry[]) => mergeGeometries(parts)!;

const platform = () => {
  const legs = [-2.6, 2.6].flatMap((x) => [-1.8, 1.8].map((z) => part(new CylinderGeometry(0.2, 0.32, 8, 6), PALETTE.ink, at(x, 3, z))));
  return merge([
    ...legs,
    part(new BoxGeometry(7, 0.8, 5), PALETTE.rust, at(0, 6, 0)),
    part(new ConeGeometry(1.2, 6, 4), PALETTE.sand, at(-1, 9.4, 0)),
    part(new BoxGeometry(0.3, 3, 0.3), PALETTE.ink, at(2, 7.9, 0.5)),
    part(new BoxGeometry(0.3, 0.3, 4), PALETTE.ink, at(2, 9.3, 1.5)),
    part(new CylinderGeometry(0.12, 0.12, 5, 6), PALETTE.ink, at(3, 8.9, -1.8)),
    part(new SphereGeometry(0.3, 8, 6), PALETTE.amber, at(3, 11.5, -1.8)),
  ]);
};

const pier = (seg: number) => {
  const pilings = [-0.7, 0.7].flatMap((x) =>
    Array.from({ length: 7 }, (_, k) => part(new CylinderGeometry(0.12, 0.12, 2.4, 6), PALETTE.ink, at(x, 0.4, 7 - k * 2.4))),
  );
  const flags = [2, 6, 10].flatMap((z) => [
    part(new CylinderGeometry(0.03, 0.03, 1.8, 4), PALETTE.sand, at(0.8, 2.1, z - 3)),
    part(new BoxGeometry(0.03, 0.3, 0.55), PALETTE.blue, at(0.8, 2.8, z - 2.7)),
  ]);
  return merge([
    ...pilings,
    ...flags,
    part(new BoxGeometry(1.6, 0.15, 16), PALETTE.sand, at(0, 1.2, 0)),
    part(new SphereGeometry(4, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.sand, at(0, 0, -10, 1.3, 0.3, 1)),
  ]);
};

const lighthouse = (seg: number) => {
  const tower = new LatheGeometry([new Vector2(1.1, 0), new Vector2(0.7, 7)], seg);
  const band = (y: number) => (Math.floor((y / 7.001) * 4) % 2 === 0 ? PALETTE.red : PALETTE.sand);
  return {
    body: merge([
      part(tower, band, at(0, 0.6, 0)),
      part(new CylinderGeometry(1, 1, 0.2, seg), PALETTE.ink, at(0, 7.7, 0)),
      part(new ConeGeometry(0.75, 1, seg), PALETTE.red, at(0, 9.1, 0)),
      part(new IcosahedronGeometry(3, 1), PALETTE.rock, at(0, 0, 0, 1, 0.4, 1)),
    ]),
    lamp: new CylinderGeometry(0.5, 0.5, 0.8, seg).translate(0, 8.2, 0),
  };
};

const buoyGeometry = () =>
  merge([
    part(new SphereGeometry(0.35, 8, 6), PALETTE.white, at(0, 0.1, 0)),
    part(new ConeGeometry(0.25, 0.6, 8), PALETTE.white, at(0, 0.7, 0)),
    part(new CylinderGeometry(0.03, 0.03, 1, 4), PALETTE.ink, at(0, 1.3, 0)),
    part(new BoxGeometry(0.03, 0.25, 0.4), PALETTE.amber, at(0, 1.7, 0.2)),
  ]);

const BUOYS = [4, 5].flatMap((stop) =>
  [
    [4, 3.5],
    [6.5, -3.5],
    [9, 3.5],
  ].map(([ahead, side]) => ({ stop, ahead, side })),
);

export function buoyPositions(curve: CatmullRomCurve3) {
  return BUOYS.map(({ stop, ahead, side }) => {
    const tangent = curve.getTangent(stop / (STOPS.length - 1)).setY(0).normalize();
    const right = new Vector3().crossVectors(tangent, UP).normalize();
    return pathAt(curve, stop).addScaledVector(tangent, ahead).addScaledVector(right, side);
  });
}

export function createLandmarks(curve: CatmullRomCurve3, low: boolean) {
  const seg = low ? 8 : 16;
  const group = new Group();
  const gradient = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
  gradient.minFilter = gradient.magFilter = NearestFilter;
  gradient.needsUpdate = true;
  const material = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient });

  const place = (mesh: Object3D, stop: number, dist: number, lat: number, yaw = 0) => {
    const { position, perp } = anchorFor(curve, stop, dist, lat);
    mesh.position.copy(position);
    mesh.rotation.y = yaw + Math.atan2(perp.x, perp.z);
    group.add(mesh);
  };

  place(new Mesh(platform(), material), 1, 36, 4);
  place(new Mesh(pier(seg), material), 2, 26, -3);
  const light = lighthouse(seg);
  const lampMaterial = new MeshBasicMaterial({ color: 0x7a6a50 });
  const tower = new Mesh(light.body, material);
  place(tower, 3, 32, 3);
  const lamp = new Mesh(light.lamp, lampMaterial);
  lamp.position.copy(tower.position);
  group.add(lamp);

  const bases = buoyPositions(curve);
  const buoys = new InstancedMesh(buoyGeometry(), material, bases.length);
  bases.forEach((_, i) => buoys.setColorAt(i, new Color(i % 2 === 0 ? PALETTE.rust : PALETTE.green)));
  buoys.frustumCulled = false;
  group.add(buoys);

  const dark = new Color(0x7a6a50);
  const bright = new Color(0xffd27a);
  const m4 = new Matrix4();
  const update = (time: number, flow: Vector2, night: number) => {
    lampMaterial.color.copy(dark).lerp(bright, night);
    bases.forEach((b, i) => {
      m4.makeTranslation(b.x, swellAt(b.x + flow.x, b.z + flow.y, time) - 0.1, b.z);
      buoys.setMatrixAt(i, m4);
    });
    buoys.instanceMatrix.needsUpdate = true;
  };

  return { group, update };
}
