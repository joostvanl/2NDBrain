import type { Chart, ChartConfiguration } from "chart.js";
import { inheritAgentDiffMarkersFromFencePre } from "./reviewChangeDom";

const chartByWrap = new WeakMap<HTMLElement, Chart>();

let chartMod: typeof import("chart.js") | null = null;
let registerablesApplied = false;

async function loadChartModule(): Promise<typeof import("chart.js")> {
  if (!chartMod) {
    chartMod = await import("chart.js");
    if (!registerablesApplied) {
      chartMod.Chart.register(...chartMod.registerables);
      registerablesApplied = true;
    }
  }
  return chartMod;
}

function isChartJsFenceCode(code: Element): boolean {
  return (
    code.tagName === "CODE" &&
    (code.classList.contains("language-chartjs") ||
      code.classList.contains("lang-chartjs") ||
      code.classList.contains("language-chart") ||
      code.classList.contains("lang-chart"))
  );
}

function parseChartConfiguration(text: string): ChartConfiguration | null {
  try {
    const raw = JSON.parse(text.trim()) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (!o.type || typeof o.type !== "string") return null;
    if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) return null;
    return raw as ChartConfiguration;
  } catch {
    return null;
  }
}

interface WrapTask {
  wrap: HTMLElement;
  canvas: HTMLCanvasElement;
  config: ChartConfiguration;
}

function collectChartJsTransforms(root: ParentNode): WrapTask[] {
  const tasks: WrapTask[] = [];
  const codes = Array.from(root.querySelectorAll("pre > code")).filter(isChartJsFenceCode);

  for (const code of codes) {
    const pre = code.parentElement;
    if (!pre || pre.tagName !== "PRE") continue;
    if (pre.closest(".mv-chartjs-wrap")) continue;

    const source = code.textContent ?? "";
    const config = parseChartConfiguration(source);
    if (!config) continue;

    try {
      const enc = encodeURIComponent(source);
      if (enc.length > 900_000) continue;
    } catch {
      continue;
    }

    const wrap = document.createElement("div");
    wrap.className = "mv-chartjs-wrap";
    wrap.setAttribute("data-mv-chartjs-source", encodeURIComponent(source));

    const canvas = document.createElement("canvas");
    canvas.className = "mv-chartjs-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Grafiek");

    wrap.append(canvas);
    inheritAgentDiffMarkersFromFencePre(pre, wrap);
    pre.replaceWith(wrap);
    tasks.push({ wrap, canvas, config });
  }

  return tasks;
}

/** Vernietigt Chart.js-instanties onder dit root (vóór replaceChildren). */
export function destroyChartsInRoot(root: ParentNode): void {
  root.querySelectorAll(".mv-chartjs-wrap").forEach((el) => {
    const wrap = el as HTMLElement;
    const c = chartByWrap.get(wrap);
    c?.destroy();
    chartByWrap.delete(wrap);
  });
}

function mergeOptions(base: ChartConfiguration): ChartConfiguration {
  const opts = base.options && typeof base.options === "object" && !Array.isArray(base.options) ? base.options : {};
  return {
    ...base,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      ...opts,
    },
  };
}

/** Render Chart.js-blokken (fenced `chartjs` / `chart` met JSON-config). */
export async function runChartJsInRoot(root: ParentNode): Promise<void> {
  const tasks = collectChartJsTransforms(root);
  if (tasks.length === 0) return;

  try {
    const { Chart: ChartCtor } = await loadChartModule();
    for (const { wrap, canvas, config } of tasks) {
      chartByWrap.get(wrap)?.destroy();
      chartByWrap.delete(wrap);
      try {
        const merged = mergeOptions(config);
        const chart = new ChartCtor(canvas, merged);
        chartByWrap.set(wrap, chart);
      } catch {
        wrap.replaceChildren();
        const err = document.createElement("p");
        err.className = "mv-chartjs-error";
        err.textContent = "Grafiek kon niet worden getoond (ongeldige Chart.js-config?).";
        wrap.append(err);
      }
    }
  } catch {
    /* import of API mislukt */
  }
}
