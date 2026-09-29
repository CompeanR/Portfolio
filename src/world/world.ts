import { Mesh, PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import { createEnvironment } from "./environment";
import { createSurfer } from "./surfer";
import { STOPS, createPath, holdsFrom, mergeStops, moodAt, pathAt, progressAt, shotAt, tierFor } from "./ride";
import type { Hold, StopRect } from "./ride";

const UP = new Vector3(0, 1, 0);
const N = STOPS.length;
const LANE_MIN_WIDTH = 1024;
const LANE_SURFER_X = 0.72;
const PORTRAIT_SURFER_Y = 0.78;
const FORCE_MS = 2500;

type WorldOptions = { onFail: () => void };
export type World = { setPaused: (paused: boolean) => void; dispose: () => void };

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
  const surfer = createSurfer();
  env.scene.add(surfer.rig);

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
    const lane = w >= LANE_MIN_WIDTH && w / h > 1.1;
    if (lane) camera.setViewOffset(w, h, -(LANE_SURFER_X - 0.5) * w, 0, w, h);
    else camera.setViewOffset(w, h, 0, -(PORTRAIT_SURFER_Y - 0.5) * h, w, h);
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
  const wantPos = new Vector3();
  const wantTarget = new Vector3();
  const wantTangent = new Vector3();
  const right = new Vector3();
  const focus = new Vector3();

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

    const shot = shotAt(p);
    const beat = Math.sin(Math.PI * (p - Math.floor(p)));
    const portrait = camera.aspect < 1;
    const back = (shot.back - 2 * beat) * (portrait ? 1.25 : 1);
    const fov = portrait ? 55 : shot.fov;

    wantPos.copy(pos).addScaledVector(tangent, -back).addScaledVector(right, shot.side).addScaledVector(UP, shot.up - 0.8 * beat);
    wantTarget.copy(pos).addScaledVector(UP, shot.lookUp);
    if (cut) {
      camPos.copy(wantPos);
      camTarget.copy(wantTarget);
    } else {
      const k = 1 - Math.exp(-4 * rdt);
      camPos.lerp(wantPos, k);
      camTarget.lerp(wantTarget, k);
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    camera.fov = fov;
    camera.updateProjectionMatrix();

    surfer.place(pos, tangent, time);
    focus.copy(surfer.rig.position);
    env.applyMood(moodAt(p));
    env.update(camera, focus, time);
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
        if (!(o instanceof Mesh)) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
