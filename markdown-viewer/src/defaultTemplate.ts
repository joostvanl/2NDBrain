import type { ViewerTemplate } from "./templateTypes";

export const defaultTemplate: ViewerTemplate = {
  version: 1,
  displayName: "Rustig dossier",
  document: {
    shellBackground: "#e8e6e1",
    pageBackground: "#fdfcfa",
    pageMaxWidth: "820px",
    pagePadding: "64px 72px",
    pageMarginY: "32px",
    pageRadius: "2px",
    pageShadow: "0 12px 40px rgba(15, 23, 42, 0.08)",
    pageBorder: "1px solid rgba(15, 23, 42, 0.06)",
  },
  cover: {
    enabled: true,
    background: "linear-gradient(165deg, #1e293b 0%, #334155 55%, #475569 100%)",
    color: "#f8fafc",
    minHeight: "75vh",
    padding: "64px 56px",
    showDocumentTitle: true,
    subtitleText: "",
    metaText: "",
    title: {
      family: "'Crimson Pro', Georgia, serif",
      size: "2.75rem",
      weight: "600",
      lineHeight: "1.15",
      marginBottom: "16px",
    },
    subtitle: {
      family: "'Inter', system-ui, sans-serif",
      size: "0.95rem",
      weight: "500",
      letterSpacing: "0.12em",
      color: "rgba(248,250,252,0.82)",
      marginBottom: "8px",
    },
    meta: {
      family: "'Inter', system-ui, sans-serif",
      size: "0.9rem",
      color: "rgba(248,250,252,0.65)",
    },
  },
  endPage: {
    enabled: true,
    background: "#f1f5f9",
    color: "#334155",
    minHeight: "40vh",
    padding: "48px 56px",
    titleText: "Einde document",
    bodyText: "",
    title: {
      family: "'Crimson Pro', Georgia, serif",
      size: "1.75rem",
      weight: "600",
      marginBottom: "12px",
    },
    body: {
      family: "'Source Sans 3', system-ui, sans-serif",
      size: "1rem",
      lineHeight: "1.65",
    },
  },
  toc: {
    enabled: true,
    heading: "Inhoudsopgave",
    headingStyle: {
      family: "'Crimson Pro', Georgia, serif",
      size: "1.65rem",
      weight: "600",
      marginBottom: "20px",
      color: "#0f172a",
    },
    itemStyle: {
      family: "'Source Sans 3', system-ui, sans-serif",
      size: "0.98rem",
      lineHeight: "1.5",
    },
    containerPadding: "0 0 40px",
    maxWidth: "100%",
    borderBottom: "1px solid rgba(15,23,42,0.08)",
    linkColor: "#1d4ed8",
  },
  prose: {
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    fontSize: "1.0625rem",
    lineHeight: "1.75",
    color: "#1e293b",
    maxWidth: "100%",
    paragraphMargin: "0 0 1.1em",
  },
  headings: {
    h1: {
      family: "'Crimson Pro', Georgia, serif",
      size: "2rem",
      weight: "650",
      marginTop: "2.25rem",
      marginBottom: "0.85rem",
      color: "#0f172a",
    },
    h2: {
      family: "'Crimson Pro', Georgia, serif",
      size: "1.55rem",
      weight: "650",
      marginTop: "2rem",
      marginBottom: "0.65rem",
      color: "#0f172a",
    },
    h3: {
      family: "'Crimson Pro', Georgia, serif",
      size: "1.28rem",
      weight: "600",
      marginTop: "1.6rem",
      marginBottom: "0.45rem",
      color: "#1e293b",
    },
    h4: {
      family: "'Source Sans 3', system-ui, sans-serif",
      size: "1.12rem",
      weight: "700",
      marginTop: "1.35rem",
      marginBottom: "0.35rem",
      color: "#334155",
    },
    h5: {
      family: "'Source Sans 3', system-ui, sans-serif",
      size: "1.03rem",
      weight: "700",
      marginTop: "1.2rem",
      marginBottom: "0.28rem",
    },
    h6: {
      family: "'Source Sans 3', system-ui, sans-serif",
      size: "0.98rem",
      weight: "700",
      marginTop: "1rem",
      marginBottom: "0.22rem",
      color: "#64748b",
    },
  },
  blockquote: {
    marginTop: "1rem",
    marginBottom: "1rem",
    padding: "14px 20px",
    borderLeft: "4px solid #cbd5f5",
    background: "rgba(241,245,249,0.95)",
    color: "#475569",
    fontStyle: "italic",
  },
  lists: {
    ul: {
      marginTop: "0.4em",
      marginBottom: "1em",
      paddingLeft: "1.35rem",
      itemMargin: "0.35em 0",
      markerColor: "#64748b",
      nestedMarginTop: "0.35em",
    },
    ol: {
      marginTop: "0.4em",
      marginBottom: "1em",
      paddingLeft: "1.35rem",
      itemMargin: "0.35em 0",
      nestedMarginTop: "0.35em",
    },
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "1.25rem",
    marginBottom: "1.5rem",
    borderColor: "rgba(15,23,42,0.12)",
    headerBackground: "#f1f5f9",
    headerColor: "#0f172a",
    headerFontWeight: "600",
    cellPadding: "12px 14px",
    rowAlternateBackground: "rgba(248,250,252,0.9)",
    fontSize: "0.98rem",
  },
  hr: {
    border: "none",
    borderTop: "1px solid rgba(15,23,42,0.16)",
    marginTop: "2rem",
    marginBottom: "2rem",
  },
  code: {
    fontFamily: "ui-monospace, 'Cascadia Code', monospace",
    fontSize: "0.9em",
    background: "#f1f5f9",
    color: "#0f172a",
    padding: "2px 6px",
    borderRadius: "4px",
    blockPadding: "16px 18px",
    blockBorder: "1px solid rgba(15,23,42,0.08)",
  },
  link: {
    color: "#1d4ed8",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  strong: {
    fontWeight: "650",
    color: "#0f172a",
  },
  em: {
    fontStyle: "italic",
  },
  print: {
    h1PageBreakBefore: true,
    h2PageBreakBefore: true,
  },
  screen: {
    chapterDividerBeforeH1: false,
    chapterDividerBeforeH2: false,
    visualPageBreaks: true,
    visualPageSplit: "h1",
    visualPageMinHeight: "72vh",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeTemplate(base: ViewerTemplate, override: ViewerTemplate): ViewerTemplate {
  const result: ViewerTemplate = { ...base };
  for (const key of Object.keys(override) as (keyof ViewerTemplate)[]) {
    const ov = override[key];
    if (ov === undefined) continue;
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(ov)) {
      (result as Record<string, unknown>)[key] = deepMerge(
        existing as Record<string, unknown>,
        ov as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = ov as unknown;
    }
  }
  return result;
}

function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const k of Object.keys(b)) {
    const bv = b[k];
    if (bv === undefined) continue;
    const av = out[k];
    if (isPlainObject(av) && isPlainObject(bv)) {
      out[k] = deepMerge(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}
