import { siExpo, siNodedotjs, siPostgresql, siReact, siSupabase, siThreedotjs, siTypescript } from "simple-icons";

const skills = [
  { name: "TypeScript", icon: siTypescript },
  { name: "React Native / Expo", icon: siExpo },
  { name: "React", icon: siReact },
  { name: "Node.js", icon: siNodedotjs },
  { name: "Supabase", icon: siSupabase },
  { name: "PostgreSQL", icon: siPostgresql },
  { name: "Three.js", icon: siThreedotjs },
];

export function renderSkills(list: HTMLElement): void {
  list.innerHTML = skills
    .map(
      ({ name, icon }) => `<li>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${icon.path}" fill="currentColor"/></svg>
        <span>${name}</span>
      </li>`,
    )
    .join("");
}
