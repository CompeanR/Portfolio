import { type SimpleIcon, siExpo, siNodedotjs, siPhp, siPostgresql, siPython, siReact, siSupabase, siTypescript } from "simple-icons";

const skills: { name: string; icon?: SimpleIcon }[] = [
  { name: "TypeScript", icon: siTypescript },
  { name: "React", icon: siReact },
  { name: "Node.js", icon: siNodedotjs },
  { name: "PostgreSQL", icon: siPostgresql },
  { name: "PHP", icon: siPhp },
  { name: "AWS" },
  { name: "Supabase", icon: siSupabase },
  { name: "Python", icon: siPython },
  { name: "React Native / Expo", icon: siExpo },
];

export function renderSkills(list: HTMLElement): void {
  list.innerHTML = skills
    .map(
      ({ name, icon }) => `<li>
        ${icon ? `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${icon.path}" fill="currentColor"/></svg>` : ""}
        <span>${name}</span>
      </li>`,
    )
    .join("");
}
