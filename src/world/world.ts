import { Mesh, PerspectiveCamera, Texture, Vector2, Vector3, WebGLRenderer } from "three";
import { createEnvironment } from "./environment";
import { createSurfer, rideWeight } from "./surfer";
import { createLandmarks } from "./landmarks";
import { createSpray } from "./spray";
import { STOPS, createPath, framingFor, holdsFrom, mergeStops, moodAt, pathAt, progressAt, shotPose, tierFor } from "./ride";
import { swellAt } from "./swell";
import type { Hold, StopRect } from "./ride";

const UP = new Vector3(0, 1, 0);
const N = STOPS.length;
const FORCE_MS = 2500;

type WorldOptions = { onFail: () => void };
export type World = { setPaused: (paused: boolean) => void; dispose: () => void };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function mountWorld(canvas: HTMLCanvasElement, { onFail }: WorldOptions): World | null {
  const tier = tierFor({
    width: window.innerWidth,
    dpr: window.devicePixelRatio,
    coarse: window.matchMedia("(pointer: coarse)").matches,
    cores: navigator.hardwareConcurrency,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  });

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: tier.antialias, alpha: false });
  } catch {
    return null;
  }
  renderer.setPixelRatio(tier.dpr);

  const curve = createPath();
  const heading = curve.getTangent(1);
  const env = createEnvironment(tier, heading);
  const camera = new PerspectiveCamera(38, 1, 0.1, 200);
  const surfer = createSurfer({ low: tier.low });
  const spray = createSpray(tier.low ? 32 : 96);
  const landmarks = createLandmarks(curve, tier.low);
  env.scene.add(surfer.rig, spray.points, landmarks.group);

  let holds: Hold[] = [];
  let vh = 1;
  let measureRaf = 0;
  let lastWidth = window.innerWidth;

  const measure = () => {
    measureRaf = 0;
    const rects: StopRect[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-stop]")) {
      const id = el.dataset.stop!;
      if (!STOPS.some((s) => s.id === id)) {
        console.warn(`Unknown stop "${id}"`);
        continue;
      }
      const r = el.getBoundingClientRect();
      const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
      rects.push({ id, top: r.top + window.scrollY + padTop, bottom: r.bottom + window.scrollY });
    }
    const stops = mergeStops(rects);
    if (stops.length) stops[0].top = 0;
    const root = document.documentElement;
    vh = root.clientHeight;
    holds = holdsFrom(stops, vh, root.scrollHeight - vh);
    dirty = true;
  };
  const scheduleMeasure = () => {
    if (!measureRaf && !disposed) measureRaf = requestAnimationFrame(measure);
  };

  const applyView = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const f = framingFor(w, h);
    camera.setViewOffset(w, h, -(f.x - 0.5) * w, -(f.y - 0.5) * h, w, h);
    spray.resize(h * tier.dpr);
    dirty = true;
  };

  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    scheduleMeasure();
  };

  const bodyObserver = new ResizeObserver(scheduleMeasure);
  const canvasObserver = new ResizeObserver(applyView);
  const onLost = (e: Event) => {
    e.preventDefault();
    fail();
  };

  let disposed = false;
  let failed = false;
  let paused = false;
  let dirty = true;
  let raf = 0;
  let live = false;

  const fail = () => {
    if (failed || disposed) return;
    failed = true;
    onFail();
  };

  let P = 0;
  let time = 0;
  let last = 0;
  let lastRender = 0;
  let sinceRender = 0;
  let first = true;
  const tangent = new Vector3(0, 0, -1);
  const camPos = new Vector3();
  const camTarget = new Vector3();
  const want = { position: new Vector3(), target: new Vector3(), fov: 38 };
  const outward = new Vector3();
  const sprayVel = new Vector3();
  let sprayAcc = 0;
  const wantTangent = new Vector3();
  const right = new Vector3();
  const focus = new Vector3();
  const surferPos = new Vector3();
  const surferTangent = new Vector3();
  const flow = new Vector2();
  let yawPrev = 0;
  let turnS = 0;
  let speedS = 0;
  let lastRenderP = 0;

  let forceUntil = 0;
  let sampleFrom = 0;
  let stage = 0;
  let samples: number[] = [];

  const guard = (now: number, dt: number) => {
    if (stage > 1 || now < sampleFrom || now >= forceUntil || dt > 0.25 || dt <= 0) return;
    samples.push(dt * 1000);
    if (samples.length < 90) return;
    const m = median(samples);
    samples = [];
    if (stage === 0 && m > 24) {
      stage = 1;
      tier.dpr = 1;
      renderer.setPixelRatio(1);
      env.setOctaves(1);
      applyView();
      sampleFrom = now + 500;
      forceUntil = now + 4000;
    } else if (stage === 1 && m > 28) {
      fail();
    } else {
      stage = 2;
    }
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (first) {
      forceUntil = now + FORCE_MS;
      sampleFrom = now + 1000;
    }
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    const rawDt = last ? (now - last) / 1000 : 0;
    last = now;

    const target = progressAt(window.scrollY, holds, vh);
    const cut = first || Math.abs(target - P) > 1.5;
    const prevP = P;
    if (cut) P = target;
    else {
      P += (target - P) * (1 - Math.exp(-8 * dt));
      if (Math.abs(target - P) < 1e-4) P = target;
    }
    if (!paused) time += dt;
    sinceRender += dt;

    const moving = P !== prevP;
    const idleDue = !paused && now - lastRender >= 1000 / tier.idleFps - 2;
    if (!(cut || moving || dirty || idleDue || now < forceUntil)) return;
    dirty = false;
    lastRender = now;
    const rdt = sinceRender;
    sinceRender = 0;

    const p = Math.min(N - 1, Math.max(0, P));
    const pos = pathAt(curve, p);
    wantTangent.copy(curve.getTangent(p / (N - 1))).setY(0).normalize();
    if (cut) tangent.copy(wantTangent);
    else tangent.lerp(wantTangent, 1 - Math.exp(-4 * rdt)).normalize();
    right.crossVectors(tangent, UP).normalize();

    const beat = Math.sin(Math.PI * (p - Math.floor(p)));
    shotPose(curve, p, camera.aspect, want);
    if (cut) {
      camPos.copy(want.position);
      camTarget.copy(want.target);
    } else {
      const k = 1 - Math.exp(-4 * rdt);
      camPos.lerp(want.position, k);
      camTarget.lerp(want.target, k);
    }

    const yaw = Math.atan2(-tangent.x, -tangent.z);
    if (cut || rdt <= 0) {
      turnS = 0;
      speedS = 0;
    } else {
      const k = 1 - Math.exp(-6 * rdt);
      turnS += (wrap(yaw - yawPrev) / rdt - turnS) * k;
      speedS += (Math.abs(P - lastRenderP) / rdt - speedS) * k;
    }
    yawPrev = yaw;
    lastRenderP = P;

    if (!paused) {
      const step = Math.min(rdt, 0.1);
      flow.x += tangent.x * (0.35 + 0.95 * rideWeight(p)) * step;
      flow.y += tangent.z * (0.35 + 0.95 * rideWeight(p)) * step;
    }

    const wv = rideWeight(p) * (1 - beat);
    const lateral = 0.6 * Math.sin(0.5 * time) * wv;
    const weaveYaw = Math.atan2(0.3 * Math.cos(0.5 * time) * wv, 1.2);
    surferPos.copy(pos).addScaledVector(right, lateral);
    surferTangent.copy(tangent).applyAxisAngle(UP, -weaveYaw);
    surfer.update(surferPos, surferTangent, { P, turn: turnS, speed: speedS, time, dt: rdt, cut, flow });
    const { contact } = surfer;
    focus.copy(surfer.rig.position);

    const sprayDt = paused || cut ? 0 : Math.min(rdt, 0.1);
    sprayAcc += (8 + 50 * Math.abs(turnS) + 20 * Math.min(speedS, 1)) * Math.max(0, contact.wake - 0.4) * 1.6 * sprayDt;
    const n = Math.floor(sprayAcc);
    sprayAcc -= n;
    if (n > 0) {
      outward.copy(contact.rail).sub(contact.position).setY(0).normalize();
      sprayVel.copy(outward).multiplyScalar(0.9).addScaledVector(UP, 1.8);
      sprayVel.x -= contact.forward.x * 1.5;
      sprayVel.z -= contact.forward.y * 1.5;
      spray.emit(contact.rail, sprayVel, n);
    }
    spray.update(sprayDt);

    const mood = moodAt(p);
    camera.position.copy(camPos);
    camera.position.y += 0.2 * swellAt(camPos.x + flow.x, camPos.z + flow.y, time);
    focus.copy(camTarget)
      .addScaledVector(right, 0.25 * Math.sin(0.23 * time) + 0.3 * lateral)
      .addScaledVector(UP, 0.08 * Math.sin(0.31 * time));
    camera.lookAt(focus);
    camera.fov = want.fov;
    camera.updateProjectionMatrix();

    focus.copy(surfer.rig.position);
    landmarks.update(time, flow, mood.night);
    env.applyMood(mood);
    env.update(camera, focus, time, contact, flow, turnS, speedS);
    renderer.render(env.scene, camera);

    if (first) first = false;
    if (!live) {
      live = true;
      canvas.classList.add("is-live");
    }
    guard(now, rawDt);
  };

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf && !disposed) {
      last = 0;
      dirty = true;
      raf = requestAnimationFrame(frame);
    }
  };

  canvas.addEventListener("webglcontextlost", onLost);
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  bodyObserver.observe(document.body);
  canvasObserver.observe(canvas);
  applyView();
  measure();
  raf = requestAnimationFrame(frame);

  return {
    setPaused: (value) => {
      paused = value;
      dirty = true;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(measureRaf);
      canvas.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      bodyObserver.disconnect();
      canvasObserver.disconnect();
      env.scene.traverse((o) => {
        const m = o as Mesh;
        if (!m.geometry) return;
        m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          for (const v of Object.values(mat)) if (v instanceof Texture) v.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
