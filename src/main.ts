import "./style.css";
import { renderSkills } from "./skills";
import type { World } from "./world/world";

const root = document.documentElement;
const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)");

if (location.hash && root.classList.contains("ride")) {
  root.style.scrollBehavior = "auto";
  document.querySelector(location.hash)?.scrollIntoView();
  root.style.scrollBehavior = "";
}

let world: World | null = null;
let unmounted = false;

const failWorld = () => {
  unmounted = true;
  world?.dispose();
  world = null;
  sessionStorage.setItem("world-off", "1");
  canvas.classList.remove("is-live");
  root.classList.remove("ride");
};

const startWorld = async () => {
  const { mountWorld } = await import("./world/world");
  if (unmounted) return;
  world = mountWorld(canvas, { onFail: failWorld });
  if (!world) failWorld();
};

if (root.classList.contains("ride")) {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
  idle(startWorld, { timeout: 1500 });

  motionOk.addEventListener("change", () => {
    if (motionOk.matches) return;
    unmounted = true;
    world?.dispose();
    world = null;
    canvas.classList.remove("is-live");
    root.classList.remove("ride");
  });
}

document.querySelector<HTMLAnchorElement>("[data-email]")?.addEventListener("click", (e) => {
  const a = e.currentTarget as HTMLAnchorElement;
  const user = a.dataset.email ?? "";
  const host = a.dataset.host ?? "";
  a.href = `mailto:${user}@${host}`;
});

renderSkills(document.querySelector("#skill-strip")!);
