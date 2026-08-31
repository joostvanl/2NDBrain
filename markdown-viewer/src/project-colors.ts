/** Stable project palette — reusable in Kanban, e-mail and documents later. */
export type ProjectColor = {
  accent: string;
  bg: string;
  text: string;
};

const PROJECT_PALETTE: readonly ProjectColor[] = [
  { accent: "#2563eb", bg: "#dbeafe", text: "#1e40af" },
  { accent: "#7c3aed", bg: "#ede9fe", text: "#5b21b6" },
  { accent: "#0891b2", bg: "#cffafe", text: "#0e7490" },
  { accent: "#059669", bg: "#d1fae5", text: "#047857" },
  { accent: "#d97706", bg: "#fef3c7", text: "#b45309" },
  { accent: "#dc2626", bg: "#fee2e2", text: "#b91c1c" },
  { accent: "#db2777", bg: "#fce7f3", text: "#be185d" },
  { accent: "#4f46e5", bg: "#e0e7ff", text: "#3730a3" },
  { accent: "#0d9488", bg: "#ccfbf1", text: "#0f766e" },
  { accent: "#ca8a04", bg: "#fef9c3", text: "#a16207" },
  { accent: "#9333ea", bg: "#f3e8ff", text: "#7e22ce" },
  { accent: "#ea580c", bg: "#ffedd5", text: "#c2410c" },
];

function hashProjectName(name: string): number {
  let hash = 0;
  const normalized = name.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function projectColorForName(project: string): ProjectColor | null {
  const key = project.trim();
  if (!key) return null;
  return PROJECT_PALETTE[hashProjectName(key) % PROJECT_PALETTE.length] ?? PROJECT_PALETTE[0];
}

export function applyProjectColorToElement(element: HTMLElement, project: string): void {
  const color = projectColorForName(project);
  if (!color) {
    element.style.removeProperty("--mv-project-accent");
    element.style.removeProperty("--mv-project-bg");
    element.style.removeProperty("--mv-project-text");
    element.removeAttribute("data-project-color");
    return;
  }
  element.style.setProperty("--mv-project-accent", color.accent);
  element.style.setProperty("--mv-project-bg", color.bg);
  element.style.setProperty("--mv-project-text", color.text);
  element.dataset.projectColor = "1";
}
