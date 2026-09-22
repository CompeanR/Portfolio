type Point = { x: number; y: number };

const svg = `
<svg viewBox="0 0 180 130" width="180" height="130" aria-hidden="true">
  <g class="surfer-bob">
    <path d="M18 112 C 14 92, 34 70, 66 62 C 92 56, 112 66, 124 80 C 132 90, 146 94, 158 100 C 168 105, 168 116, 156 118 L 34 118 C 24 118, 19 116, 18 112 Z" fill="#2e7b90"/>
    <path d="M30 100 C 40 82, 58 72, 80 70 C 70 78, 62 90, 60 104 C 50 102, 40 102, 30 100 Z" fill="#fff4e2" opacity="0.8"/>
    <path d="M120 78 C 128 76, 134 76, 138 80 C 132 82, 128 88, 126 96 C 124 88, 122 82, 120 78 Z" fill="#fff4e2" opacity="0.85"/>
    <circle cx="46" cy="70" r="3" fill="#fff4e2" opacity="0.8"/>
    <circle cx="36" cy="80" r="2" fill="#fff4e2" opacity="0.7"/>
    <circle cx="142" cy="94" r="2.5" fill="#fff4e2" opacity="0.75"/>
    <g transform="rotate(-16 96 84)">
      <path d="M44 88 Q 96 72 152 84 Q 96 96 44 88 Z" fill="#f5a31a"/>
      <path d="M52 88 Q 96 78 146 84 Q 96 90 52 88 Z" fill="#b23a0b" opacity="0.55"/>
    </g>
    <g fill="#0c2a33">
      <path d="M84 82 L 92 64 L 102 60 L 108 66 L 114 78 L 120 82 L 113 84 L 108 74 L 103 72 L 97 82 Z"/>
      <path d="M92 64 C 82 60, 76 54, 78 44 C 80 38, 90 36, 96 40 C 102 44, 103 56, 97 62 Z"/>
      <circle cx="93" cy="31" r="8"/>
      <path d="M78 44 L 58 36 L 56 40 L 76 50 Z"/>
      <path d="M99 46 L 122 54 L 120 58 L 97 52 Z"/>
    </g>
    <path d="M81 43 C 83 39, 87 37, 92 37 L 93 43 Z" fill="#fff4e2"/>
  </g>
</svg>`;

export function mountSurfer(highlights: HTMLElement[], exitAnchor: HTMLElement): () => void {
  const el = document.createElement("div");
  el.className = "surfer";
  el.innerHTML = svg;
  document.body.appendChild(el);

  const width = 180;
  let docks: Point[] = [];
  let holds: Array<[number, number]> = [];
  let sky: Point = { x: 0, y: -400 };
  let exit: Point = { x: 0, y: 0 };
  let exitAt = 0;

  const measure = () => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    docks = highlights.map((h) => {
      const media = h.querySelector<HTMLElement>(".highlight-media")!;
      const r = media.getBoundingClientRect();
      const flipped = h.classList.contains("highlight-flip");
      const x = flipped ? r.right - width - 24 : r.left + 8;
      return { x, y: r.top + window.scrollY - 70 };
    });
    holds = highlights.map((h) => {
      const r = h.getBoundingClientRect();
      const center = r.top + window.scrollY + r.height / 2;
      return [center - vh * 0.78, center - vh * 0.36];
    });
    sky = { x: vw * 0.62, y: -300 };
    const exitTop = exitAnchor.getBoundingClientRect().top + window.scrollY;
    exit = { x: vw * 0.85, y: exitTop + vh * 0.6 };
    exitAt = exitTop - vh * 0.25;
  };

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const between = (a: Point, b: Point, t: number): Point => {
    const k = ease(Math.min(1, Math.max(0, t)));
    return { x: a.x + (b.x - a.x) * k + Math.sin(k * Math.PI) * 60, y: a.y + (b.y - a.y) * k };
  };

  const targetFor = (s: number): Point | null => {
    if (s < holds[0][0]) return between(sky, docks[0], (s - 0) / Math.max(1, holds[0][0]));
    for (let i = 0; i < holds.length; i++) {
      const [arrive, leave] = holds[i];
      if (s >= arrive && s <= leave) return docks[i];
      const next = holds[i + 1];
      if (next && s > leave && s < next[0]) return between(docks[i], docks[i + 1], (s - leave) / (next[0] - leave));
    }
    const lastLeave = holds[holds.length - 1][1];
    if (s > exitAt + window.innerHeight) return null;
    return between(docks[docks.length - 1], exit, (s - lastLeave) / Math.max(1, exitAt - lastLeave));
  };

  const current: Point = { x: 0, y: 0 };
  let tilt = 0;
  let raf = 0;
  let started = false;

  const frame = () => {
    const target = targetFor(window.scrollY);
    if (!target) {
      el.style.opacity = "0";
      raf = 0;
      return;
    }
    if (!started) {
      current.x = target.x;
      current.y = target.y;
      started = true;
    }
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    current.x += dx * 0.1;
    current.y += dy * 0.1;
    tilt += (Math.max(-18, Math.min(18, dy * 0.06 + dx * 0.04)) - tilt) * 0.12;
    el.style.opacity = "1";
    el.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) rotate(${tilt.toFixed(2)}deg)`;
    const settled = Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3 && Math.abs(tilt) < 0.2;
    raf = settled ? 0 : requestAnimationFrame(frame);
  };

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const relayout = () => {
    measure();
    kick();
  };

  measure();
  kick();
  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener("resize", relayout);
  const ro = new ResizeObserver(relayout);
  ro.observe(document.body);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("scroll", kick);
    window.removeEventListener("resize", relayout);
    ro.disconnect();
    el.remove();
  };
}
