import * as THREE from "three";
import { surferSvg } from "./surfer-svg";

type Waypoint = { x: number; y: number };

const glslNoise = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

const ribbonVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLen;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  varying vec2 vUv;
  ${glslNoise}
  void main() {
    float along = vUv.y * uLen / 140.0;
    float n = noise(vec2(vUv.x * 2.5, along - uTime * 0.35)) * 0.6 + noise(vec2(vUv.x * 6.0 + 3.0, along * 2.0 - uTime * 0.6)) * 0.4;
    vec3 col = mix(uDeep, uShallow, n);
    float edgeDist = min(vUv.x, 1.0 - vUv.x);
    float foam = smoothstep(0.16, 0.0, edgeDist) * (0.55 + 0.45 * noise(vec2(along * 3.0, vUv.x * 4.0 + uTime * 0.2)));
    col = mix(col, uFoam, foam * 0.9);
    float shape = smoothstep(0.0, 0.08, edgeDist);
    float ends = smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
    gl_FragColor = vec4(col, shape * ends * 0.85);
    #include <colorspace_fragment>
  }
`;

const wakeVertex = /* glsl */ `
  attribute float aAge;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    float life = 1.0 - aAge;
    vAlpha = life * life * 0.9;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (6.0 + aSeed * 14.0) * (0.4 + life * 0.6);
    gl_Position = projectionMatrix * mv;
  }
`;

const wakeFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.2, d) * vAlpha;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

const SURFER_W = 180;
const BOARD = { x: 96, y: 96 };
const RIBBON_W = 120;
const WAKE_MAX = 160;
const WAKE_LIFE = 1.3;

export function mountJourney(highlights: HTMLElement[], hero: HTMLElement, exitAnchor: HTMLElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.id = "stage";
  document.body.appendChild(canvas);

  const surfer = document.createElement("div");
  surfer.className = "surfer";
  surfer.innerHTML = surferSvg;
  document.body.appendChild(surfer);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);

  const ribbonUniforms = {
    uTime: { value: 0 },
    uLen: { value: 1 },
    uDeep: { value: new THREE.Color("#2e7b90") },
    uShallow: { value: new THREE.Color("#7fbcc8") },
    uFoam: { value: new THREE.Color("#fff4e2") },
  };
  const ribbon = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({ vertexShader: ribbonVertex, fragmentShader: ribbonFragment, uniforms: ribbonUniforms, transparent: true, depthWrite: false }),
  );
  scene.add(ribbon);

  const wakePositions = new Float32Array(WAKE_MAX * 3);
  const wakeAges = new Float32Array(WAKE_MAX).fill(1);
  const wakeSeeds = new Float32Array(WAKE_MAX);
  const wakeBorn = new Float32Array(WAKE_MAX).fill(-1e9);
  const wakeGeometry = new THREE.BufferGeometry();
  wakeGeometry.setAttribute("position", new THREE.BufferAttribute(wakePositions, 3));
  wakeGeometry.setAttribute("aAge", new THREE.BufferAttribute(wakeAges, 1));
  wakeGeometry.setAttribute("aSeed", new THREE.BufferAttribute(wakeSeeds, 1));
  const wake = new THREE.Points(
    wakeGeometry,
    new THREE.ShaderMaterial({ vertexShader: wakeVertex, fragmentShader: wakeFragment, uniforms: { uColor: { value: new THREE.Color("#fff4e2") } }, transparent: true, depthWrite: false }),
  );
  wake.position.z = 1;
  wake.frustumCulled = false;
  scene.add(wake);
  let wakeHead = 0;

  let curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
  let dockU: number[] = [];
  let holds: Array<[number, number]> = [];
  let endScroll = 0;

  const docY = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

  const measure = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    renderer.setSize(vw, vh, false);
    camera.right = vw;
    camera.bottom = -vh;
    camera.updateProjectionMatrix();

    const docks: Waypoint[] = highlights.map((h) => {
      const r = h.querySelector<HTMLElement>(".highlight-media")!.getBoundingClientRect();
      const flipped = h.classList.contains("highlight-flip");
      const x = flipped ? r.right - SURFER_W - 24 : r.left + 8;
      return { x: x + BOARD.x, y: r.top + window.scrollY - 70 + BOARD.y };
    });
    holds = highlights.map((h) => {
      const r = h.getBoundingClientRect();
      const center = r.top + window.scrollY + r.height / 2;
      return [center - vh * 0.78, center - vh * 0.36];
    });
    const heroBottom = docY(hero) + hero.getBoundingClientRect().height;
    const exitTop = docY(exitAnchor);
    const maxScroll = document.documentElement.scrollHeight - vh;
    endScroll = Math.min(exitTop - vh * 0.1, maxScroll - 40);
    const points: Waypoint[] = [
      { x: vw * 0.6, y: heroBottom - 40 },
      { x: vw * 0.56, y: heroBottom + 230 },
    ];
    docks.forEach((d, i) => {
      const flipped = highlights[i].classList.contains("highlight-flip");
      const side = flipped ? -1 : 1;
      if (i > 0) points.push({ x: d.x - side * 10, y: d.y - 240 });
      points.push(d);
      points.push({ x: d.x + side * 70, y: d.y + 300 });
      const next = docks[i + 1];
      if (next) points.push({ x: vw * 0.5, y: (d.y + 300 + next.y - 240) / 2 });
    });
    points.push({ x: vw * 0.9, y: (docks[docks.length - 1].y + 300 + exitTop) / 2 });
    points.push({ x: vw * 0.86, y: exitTop + vh * 0.55 });
    curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, -p.y, 0)), false, "centripetal");
    buildRibbon();
    const spaced = curve.getSpacedPoints(600);
    dockU = docks.map((d) => {
      let best = 0;
      let bestDist = Infinity;
      spaced.forEach((p, i) => {
        const dist = (p.x - d.x) ** 2 + (p.y + d.y) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      return best / 600;
    });
  };

  const buildRibbon = () => {
    const n = 400;
    const pts = curve.getSpacedPoints(n);
    const tangents: Array<[number, number]> = [];
    for (let i = 0; i <= n; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n, i + 1)];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tangents.push([tx / len, ty / len]);
    }
    const verts = new Float32Array((n + 1) * 2 * 3);
    const uvs = new Float32Array((n + 1) * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const p = pts[i];
      const [tx, ty] = tangents[i];
      const nx = -ty;
      const ny = tx;
      const half = RIBBON_W / 2;
      verts.set([p.x + nx * half, p.y + ny * half, 0, p.x - nx * half, p.y - ny * half, 0], i * 6);
      uvs.set([0, i / n, 1, i / n], i * 4);
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    ribbon.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    ribbon.geometry = g;
    ribbonUniforms.uLen.value = curve.getLength();
  };

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

  const progressFor = (s: number): number | null => {
    if (s < holds[0][0]) return ease(clamp01(s / holds[0][0])) * dockU[0];
    for (let i = 0; i < holds.length; i++) {
      const [arrive, leave] = holds[i];
      if (s >= arrive && s <= leave) return dockU[i];
      const next = holds[i + 1];
      if (next && s > leave && s < next[0]) return dockU[i] + (dockU[i + 1] - dockU[i]) * clamp01((s - leave) / (next[0] - leave));
    }
    const lastLeave = holds[holds.length - 1][1];
    if (s > endScroll + window.innerHeight * 0.5) return null;
    return dockU[dockU.length - 1] + (1 - dockU[dockU.length - 1]) * clamp01((s - lastLeave) / (endScroll - lastLeave));
  };

  const t0 = performance.now();
  let u = 0;
  let tilt = 0;
  let started = false;
  const last = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();

  const emit = (x: number, y: number, t: number) => {
    const i = wakeHead++ % WAKE_MAX;
    wakePositions.set([x + (Math.random() - 0.5) * 30, -y + (Math.random() - 0.5) * 14, 0], i * 3);
    wakeSeeds[i] = Math.random();
    wakeBorn[i] = t;
  };

  let raf = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const t = (performance.now() - t0) / 1000;
    const s = window.scrollY;
    camera.position.y = -s;
    ribbonUniforms.uTime.value = t;

    const target = progressFor(s);
    if (target === null) {
      surfer.style.opacity = "0";
    } else {
      if (!started) {
        u = target;
        started = true;
      }
      u += (target - u) * 0.16;
      curve.getPointAt(clamp01(u), pos);
      curve.getTangentAt(clamp01(u), tan);
      const moving = pos.distanceTo(last) > 1.2;
      const angle = (Math.atan2(-tan.y, tan.x) * 180) / Math.PI;
      const wantTilt = moving ? Math.max(-22, Math.min(22, angle * 0.35)) : 0;
      tilt += (wantTilt - tilt) * 0.1;
      if (moving) {
        emit(pos.x - 40, -pos.y + 8, t);
        if (Math.random() < 0.5) emit(pos.x - 20, -pos.y + 18, t);
      }
      last.copy(pos);
      surfer.style.opacity = "1";
      surfer.style.transform = `translate3d(${(pos.x - BOARD.x).toFixed(1)}px, ${(-pos.y - BOARD.y - s).toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
    }

    for (let i = 0; i < WAKE_MAX; i++) wakeAges[i] = clamp01((t - wakeBorn[i]) / WAKE_LIFE);
    (wakeGeometry.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
    (wakeGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (wakeGeometry.attributes.aSeed as THREE.BufferAttribute).needsUpdate = true;

    renderer.render(scene, camera);
  };

  measure();
  frame();
  const ro = new ResizeObserver(measure);
  ro.observe(document.body);
  window.addEventListener("resize", measure);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("resize", measure);
    renderer.dispose();
    canvas.remove();
    surfer.remove();
  };
}
