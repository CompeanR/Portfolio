import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  Shape,
  SphereGeometry,
  Vector3,
} from "three";
import { swellAt } from "./swell";

export type Joint =
  | "hipY"
  | "torsoLean"
  | "torsoTwist"
  | "headYaw"
  | "frontShoulderX"
  | "frontShoulderZ"
  | "backShoulderX"
  | "backShoulderZ"
  | "elbow"
  | "hip"
  | "knee";
export type Pose = Record<Joint, number>;

export const POSES = {
  ride: {
    hipY: 0.72,
    torsoLean: 0.35,
    torsoTwist: 0.5,
    headYaw: 0.3,
    frontShoulderX: 0.2,
    frontShoulderZ: 1.2,
    backShoulderX: -0.1,
    backShoulderZ: -1.1,
    elbow: 0.3,
    hip: 0.7,
    knee: 1.4,
  },
} satisfies Record<string, Pose>;

const DECK_TOP = 0.075;
const STANCE = 0.32;
const SHOULDER_Y = 0.55;

const material = (color: number) => new MeshLambertMaterial({ color, flatShading: true });

const boardShape = () => {
  const s = new Shape();
  s.moveTo(-1.05, -0.2);
  s.lineTo(-1.05, 0.2);
  s.quadraticCurveTo(-0.3, 0.3, 0.55, 0.26);
  s.quadraticCurveTo(1.0, 0.15, 1.05, 0);
  s.quadraticCurveTo(1.0, -0.15, 0.55, -0.26);
  s.quadraticCurveTo(-0.3, -0.3, -1.05, -0.2);
  return s;
};

const at = (mesh: Mesh, x: number, y: number, z: number) => {
  mesh.position.set(x, y, z);
  return mesh;
};

export function createSurfer() {
  const body = material(0x0c2a33);
  const sand = material(0xfff4e2);
  const deck = material(0xf5a31a);
  const rust = material(0xb23a0b);

  const rig = new Group();
  rig.rotation.order = "YXZ";

  const board = new Group();
  const deckGeometry = new ExtrudeGeometry(boardShape(), { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 5 });
  deckGeometry.rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
  board.add(new Mesh(deckGeometry, deck));
  board.add(at(new Mesh(new BoxGeometry(0.02, 0.01, 1.9), rust), 0, DECK_TOP, 0));
  const finShape = new Shape().moveTo(0, 0).lineTo(0.22, 0).lineTo(0, -0.22).closePath();
  const finGeometry = new ExtrudeGeometry(finShape, { depth: 0.02, bevelEnabled: false });
  finGeometry.rotateY(Math.PI / 2).translate(-0.01, 0, 0.7);
  board.add(new Mesh(finGeometry, rust));
  rig.add(board);

  const legGeometry = new CylinderGeometry(0.08, 0.065, 0.44, 5).translate(0, -0.22, 0);
  const armGeometry = new CylinderGeometry(0.055, 0.05, 0.34, 5).translate(0, -0.17, 0);
  const footGeometry = new BoxGeometry(0.12, 0.06, 0.26);

  const makeLeg = (x: number) => {
    const hip = new Group();
    hip.position.x = x;
    hip.add(new Mesh(legGeometry, body));
    const knee = new Group();
    knee.position.y = -0.44;
    knee.add(new Mesh(legGeometry, body));
    knee.add(at(new Mesh(footGeometry, body), 0, -0.47, 0.06));
    hip.add(knee);
    return { hip, knee };
  };
  const makeArm = (x: number) => {
    const shoulder = new Group();
    shoulder.position.set(x, SHOULDER_Y, 0);
    shoulder.add(new Mesh(armGeometry, body));
    const elbow = new Group();
    elbow.position.y = -0.34;
    elbow.add(new Mesh(armGeometry, body));
    shoulder.add(elbow);
    return { shoulder, elbow };
  };

  const stand = new Group();
  stand.position.y = DECK_TOP;
  stand.rotation.y = Math.PI / 2;
  const hips = new Group();
  hips.add(new Mesh(new BoxGeometry(0.5, 0.16, 0.26), body));
  const front = makeLeg(STANCE);
  const back = makeLeg(-STANCE);
  hips.add(front.hip, back.hip);

  const torso = new Group();
  torso.add(at(new Mesh(new CylinderGeometry(0.18, 0.24, 0.6, 6), body), 0, 0.3, 0));
  torso.add(at(new Mesh(new CylinderGeometry(0.205, 0.215, 0.14, 6), sand), 0, 0.3, 0));
  const head = new Group();
  head.position.y = 0.78;
  head.add(new Mesh(new IcosahedronGeometry(0.16, 0), body));
  head.add(at(new Mesh(new SphereGeometry(0.17, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), sand), 0, 0.02, 0));
  torso.add(head);
  const frontArm = makeArm(0.2);
  const backArm = makeArm(-0.2);
  torso.add(frontArm.shoulder, backArm.shoulder);
  hips.add(torso);
  stand.add(hips);
  rig.add(stand);

  const applyPose = (p: Pose) => {
    hips.position.y = p.hipY;
    torso.rotation.set(p.torsoLean, p.torsoTwist, 0);
    head.rotation.y = p.headYaw;
    frontArm.shoulder.rotation.set(p.frontShoulderX, 0, p.frontShoulderZ);
    backArm.shoulder.rotation.set(p.backShoulderX, 0, p.backShoulderZ);
    frontArm.elbow.rotation.x = p.elbow;
    backArm.elbow.rotation.x = p.elbow;
    for (const leg of [front, back]) {
      leg.hip.rotation.x = -p.hip;
      leg.knee.rotation.x = p.knee;
    }
  };
  applyPose(POSES.ride);

  const probe = new Vector3();
  const slope = (x: number, z: number, dx: number, dz: number, t: number) => {
    const e = 0.4;
    return (swellAt(x + dx * e, z + dz * e, t) - swellAt(x - dx * e, z - dz * e, t)) / (2 * e);
  };

  const place = (pos: Vector3, tangent: Vector3, t: number) => {
    probe.copy(tangent).setY(0).normalize();
    const { x, z } = pos;
    rig.position.set(x, swellAt(x, z, t) + 0.05, z);
    rig.rotation.set(Math.atan(slope(x, z, probe.x, probe.z, t)), Math.atan2(-probe.x, -probe.z), Math.atan(slope(x, z, -probe.z, probe.x, t)));
  };

  return { rig, place };
}
