import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const wantsMotion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isWide = window.matchMedia("(min-width: 768px)").matches;

const sea = document.querySelector<HTMLCanvasElement>("#sea");
if (canvas && wantsMotion && isWide) {
  import("./scene").then(({ mountScene }) => {
    mountScene(canvas);
    canvas.classList.add("is-live");
    if (sea) {
      mountScene(sea, { mood: "sunset" });
      sea.classList.add("is-live");
    }
  });
}

document.querySelector<HTMLAnchorElement>("[data-email]")?.addEventListener("click", (e) => {
  const a = e.currentTarget as HTMLAnchorElement;
  const user = a.dataset.email ?? "";
  const host = a.dataset.host ?? "";
  a.href = `mailto:${user}@${host}`;
});

document.querySelector("#year")!.textContent = String(new Date().getFullYear());

import { renderSkills } from "./skills";
renderSkills(document.querySelector("#skill-strip")!);

if (wantsMotion && window.matchMedia("(min-width: 860px)").matches) {
  import("./journey").then(({ mountJourney }) => {
    const highlights = Array.from(document.querySelectorAll<HTMLElement>(".highlight"));
    const hero = document.querySelector<HTMLElement>(".hero")!;
    const contact = document.querySelector<HTMLElement>("#contact")!;
    mountJourney(highlights, hero, contact);
  });
}
