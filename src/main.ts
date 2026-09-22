import "./style.css";
import { renderSkills } from "./skills";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const sea = document.querySelector<HTMLCanvasElement>("#sea");
const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)");
const wideEnoughForSea = window.matchMedia("(min-width: 768px)");
const wideEnoughForJourney = window.matchMedia("(min-width: 860px)");

let unmountSea: (() => void) | null = null;
let unmountJourney: (() => void) | null = null;

const reconcile = () => {
  const wantSea = motionOk.matches && wideEnoughForSea.matches && canvas;
  const wantJourney = motionOk.matches && wideEnoughForJourney.matches;

  if (wantSea && !unmountSea) {
    unmountSea = () => {};
    import("./scene").then(({ mountScene }) => {
      if (!unmountSea) return;
      const stopHero = mountScene(canvas);
      canvas.classList.add("is-live");
      const stopSea = sea ? mountScene(sea, { mood: "dusk" }) : () => {};
      sea?.classList.add("is-live");
      unmountSea = () => {
        stopHero();
        stopSea();
        canvas.classList.remove("is-live");
        sea?.classList.remove("is-live");
      };
    });
  } else if (!wantSea && unmountSea) {
    unmountSea();
    unmountSea = null;
  }

  if (wantJourney && !unmountJourney) {
    unmountJourney = () => {};
    import("./journey").then(({ mountJourney }) => {
      if (!unmountJourney) return;
      const highlights = Array.from(document.querySelectorAll<HTMLElement>(".highlight"));
      const hero = document.querySelector<HTMLElement>(".hero")!;
      const contact = document.querySelector<HTMLElement>("#contact")!;
      unmountJourney = mountJourney(highlights, hero, contact);
    });
  } else if (!wantJourney && unmountJourney) {
    unmountJourney();
    unmountJourney = null;
  }
};

reconcile();
for (const mq of [motionOk, wideEnoughForSea, wideEnoughForJourney]) mq.addEventListener("change", reconcile);

document.querySelector<HTMLAnchorElement>("[data-email]")?.addEventListener("click", (e) => {
  const a = e.currentTarget as HTMLAnchorElement;
  const user = a.dataset.email ?? "";
  const host = a.dataset.host ?? "";
  a.href = `mailto:${user}@${host}`;
});

renderSkills(document.querySelector("#skill-strip")!);
