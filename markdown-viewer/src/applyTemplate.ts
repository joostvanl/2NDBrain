import type { FontSpec } from "./templateTypes";
import type { ViewerTemplate } from "./templateTypes";

function fontVars(prefix: string, f?: FontSpec): Record<string, string> {
  if (!f) return {};
  const out: Record<string, string> = {};
  if (f.family !== undefined) out[`--${prefix}-ff`] = f.family;
  if (f.size !== undefined) out[`--${prefix}-size`] = f.size;
  if (f.weight !== undefined) out[`--${prefix}-weight`] = f.weight;
  if (f.style !== undefined) out[`--${prefix}-style`] = f.style;
  if (f.lineHeight !== undefined) out[`--${prefix}-lh`] = f.lineHeight;
  if (f.letterSpacing !== undefined) out[`--${prefix}-track`] = f.letterSpacing;
  if (f.color !== undefined) out[`--${prefix}-color`] = f.color;
  if (f.marginTop !== undefined) out[`--${prefix}-mt`] = f.marginTop;
  if (f.marginBottom !== undefined) out[`--${prefix}-mb`] = f.marginBottom;
  return out;
}

export function templateToCssVars(t: ViewerTemplate): Record<string, string> {
  const d = t.document || {};
  const cover = t.cover || {};
  const end = t.endPage || {};
  const toc = t.toc || {};
  const prose = t.prose || {};
  const h = t.headings || {};
  const bq = t.blockquote || {};
  const ul = t.lists?.ul || {};
  const ol = t.lists?.ol || {};
  const table = t.table || {};
  const hr = t.hr || {};
  const code = t.code || {};
  const link = t.link || {};
  const strong = t.strong || {};
  const em = t.em || {};
  const print = t.print || {};
  const screen = t.screen || {};

  return {
    ...fontVars("mv-cover-title", cover.title),
    ...fontVars("mv-cover-subtitle", cover.subtitle),
    ...fontVars("mv-cover-meta", cover.meta),
    ...fontVars("mv-end-title", end.title),
    ...fontVars("mv-end-body", end.body),
    ...fontVars("mv-toc-heading", toc.headingStyle),
    ...fontVars("mv-toc-item", toc.itemStyle),
    ...fontVars("mv-h1", h.h1),
    ...fontVars("mv-h2", h.h2),
    ...fontVars("mv-h3", h.h3),
    ...fontVars("mv-h4", h.h4),
    ...fontVars("mv-h5", h.h5),
    ...fontVars("mv-h6", h.h6),

    ...(d.shellBackground !== undefined ? { "--mv-shell-bg": d.shellBackground } : {}),
    ...(d.pageBackground !== undefined ? { "--mv-page-bg": d.pageBackground } : {}),
    ...(d.pageMaxWidth !== undefined ? { "--mv-page-max": d.pageMaxWidth } : {}),
    ...(d.pagePadding !== undefined ? { "--mv-page-pad": d.pagePadding } : {}),
    ...(d.pageMarginY !== undefined ? { "--mv-page-my": d.pageMarginY } : {}),
    ...(d.pageRadius !== undefined ? { "--mv-page-radius": d.pageRadius } : {}),
    ...(d.pageShadow !== undefined ? { "--mv-page-shadow": d.pageShadow } : {}),
    ...(d.pageBorder !== undefined ? { "--mv-page-border": d.pageBorder } : {}),

    ...(cover.background !== undefined ? { "--mv-cover-bg": cover.background } : {}),
    ...(cover.color !== undefined ? { "--mv-cover-fg": cover.color } : {}),
    ...(cover.minHeight !== undefined ? { "--mv-cover-minh": cover.minHeight } : {}),
    ...(cover.padding !== undefined ? { "--mv-cover-pad": cover.padding } : {}),

    ...(end.background !== undefined ? { "--mv-end-bg": end.background } : {}),
    ...(end.color !== undefined ? { "--mv-end-fg": end.color } : {}),
    ...(end.minHeight !== undefined ? { "--mv-end-minh": end.minHeight } : {}),
    ...(end.padding !== undefined ? { "--mv-end-pad": end.padding } : {}),

    ...(toc.containerPadding !== undefined ? { "--mv-toc-pad": toc.containerPadding } : {}),
    ...(toc.maxWidth !== undefined ? { "--mv-toc-max": toc.maxWidth } : {}),
    ...(toc.borderBottom !== undefined ? { "--mv-toc-border": toc.borderBottom } : {}),
    ...(toc.linkColor !== undefined ? { "--mv-toc-link": toc.linkColor } : {}),

    ...(prose.fontFamily !== undefined ? { "--mv-prose-ff": prose.fontFamily } : {}),
    ...(prose.fontSize !== undefined ? { "--mv-prose-size": prose.fontSize } : {}),
    ...(prose.lineHeight !== undefined ? { "--mv-prose-lh": prose.lineHeight } : {}),
    ...(prose.color !== undefined ? { "--mv-prose-color": prose.color } : {}),
    ...(prose.maxWidth !== undefined ? { "--mv-prose-max": prose.maxWidth } : {}),
    ...(prose.paragraphMargin !== undefined ? { "--mv-prose-p-mb": prose.paragraphMargin } : {}),

    ...(bq.marginTop !== undefined ? { "--mv-bq-mt": bq.marginTop } : {}),
    ...(bq.marginBottom !== undefined ? { "--mv-bq-mb": bq.marginBottom } : {}),
    ...(bq.padding !== undefined ? { "--mv-bq-pad": bq.padding } : {}),
    ...(bq.borderLeft !== undefined ? { "--mv-bq-border": bq.borderLeft } : {}),
    ...(bq.background !== undefined ? { "--mv-bq-bg": bq.background } : {}),
    ...(bq.color !== undefined ? { "--mv-bq-color": bq.color } : {}),
    ...(bq.fontStyle !== undefined ? { "--mv-bq-style": bq.fontStyle } : {}),

    ...(ul.marginTop !== undefined ? { "--mv-ul-mt": ul.marginTop } : {}),
    ...(ul.marginBottom !== undefined ? { "--mv-ul-mb": ul.marginBottom } : {}),
    ...(ul.paddingLeft !== undefined ? { "--mv-ul-pl": ul.paddingLeft } : {}),
    ...(ul.itemMargin !== undefined ? { "--mv-ul-li-my": ul.itemMargin } : {}),
    ...(ul.markerColor !== undefined ? { "--mv-ul-marker": ul.markerColor } : {}),
    ...(ul.nestedMarginTop !== undefined ? { "--mv-ul-nested-mt": ul.nestedMarginTop } : {}),

    ...(ol.marginTop !== undefined ? { "--mv-ol-mt": ol.marginTop } : {}),
    ...(ol.marginBottom !== undefined ? { "--mv-ol-mb": ol.marginBottom } : {}),
    ...(ol.paddingLeft !== undefined ? { "--mv-ol-pl": ol.paddingLeft } : {}),
    ...(ol.itemMargin !== undefined ? { "--mv-ol-li-my": ol.itemMargin } : {}),
    ...(ol.nestedMarginTop !== undefined ? { "--mv-ol-nested-mt": ol.nestedMarginTop } : {}),

    ...(table.width !== undefined ? { "--mv-tbl-width": table.width } : {}),
    ...(table.borderCollapse !== undefined ? { "--mv-tbl-collapse": table.borderCollapse } : {}),
    ...(table.marginTop !== undefined ? { "--mv-tbl-mt": table.marginTop } : {}),
    ...(table.marginBottom !== undefined ? { "--mv-tbl-mb": table.marginBottom } : {}),
    ...(table.borderColor !== undefined ? { "--mv-tbl-border": table.borderColor } : {}),
    ...(table.headerBackground !== undefined ? { "--mv-tbl-th-bg": table.headerBackground } : {}),
    ...(table.headerColor !== undefined ? { "--mv-tbl-th-fg": table.headerColor } : {}),
    ...(table.headerFontWeight !== undefined ? { "--mv-tbl-th-weight": table.headerFontWeight } : {}),
    ...(table.cellPadding !== undefined ? { "--mv-tbl-cell-pad": table.cellPadding } : {}),
    ...(table.rowAlternateBackground !== undefined
      ? { "--mv-tbl-row-alt": table.rowAlternateBackground }
      : {}),
    ...(table.fontSize !== undefined ? { "--mv-tbl-size": table.fontSize } : {}),

    ...(hr.border !== undefined ? { "--mv-hr-border": hr.border } : {}),
    ...(hr.borderTop !== undefined ? { "--mv-hr-border-top": hr.borderTop } : {}),
    ...(hr.marginTop !== undefined ? { "--mv-hr-mt": hr.marginTop } : {}),
    ...(hr.marginBottom !== undefined ? { "--mv-hr-mb": hr.marginBottom } : {}),

    ...(code.fontFamily !== undefined ? { "--mv-code-ff": code.fontFamily } : {}),
    ...(code.fontSize !== undefined ? { "--mv-code-size": code.fontSize } : {}),
    ...(code.background !== undefined ? { "--mv-code-bg": code.background } : {}),
    ...(code.color !== undefined ? { "--mv-code-fg": code.color } : {}),
    ...(code.padding !== undefined ? { "--mv-code-pad": code.padding } : {}),
    ...(code.borderRadius !== undefined ? { "--mv-code-radius": code.borderRadius } : {}),
    ...(code.blockPadding !== undefined ? { "--mv-code-block-pad": code.blockPadding } : {}),
    ...(code.blockBorder !== undefined ? { "--mv-code-block-border": code.blockBorder } : {}),

    ...(link.color !== undefined ? { "--mv-link-color": link.color } : {}),
    ...(link.textDecoration !== undefined ? { "--mv-link-decor": link.textDecoration } : {}),
    ...(link.textUnderlineOffset !== undefined
      ? { "--mv-link-under-offset": link.textUnderlineOffset }
      : {}),

    ...(strong.fontWeight !== undefined ? { "--mv-strong-weight": strong.fontWeight } : {}),
    ...(strong.color !== undefined ? { "--mv-strong-color": strong.color } : {}),

    ...(em.fontStyle !== undefined ? { "--mv-em-style": em.fontStyle } : {}),

    ...(screen.chapterDividerBeforeH1 !== undefined
      ? { "--mv-screen-h1-divider": screen.chapterDividerBeforeH1 ? "1" : "0" }
      : {}),
    ...(screen.chapterDividerBeforeH2 !== undefined
      ? { "--mv-screen-h2-divider": screen.chapterDividerBeforeH2 ? "1" : "0" }
      : {}),

    ...(print.h1PageBreakBefore !== undefined
      ? {
          "--mv-print-h1-break-before": print.h1PageBreakBefore ? "page" : "auto",
          "--mv-print-h1-page-break-before": print.h1PageBreakBefore ? "always" : "auto",
        }
      : {}),
    ...(print.h2PageBreakBefore !== undefined
      ? {
          "--mv-print-h2-break-before": print.h2PageBreakBefore ? "page" : "auto",
          "--mv-print-h2-page-break-before": print.h2PageBreakBefore ? "always" : "auto",
        }
      : {}),

    ...(screen.visualPageMinHeight !== undefined
      ? { "--mv-screen-visual-page-min": screen.visualPageMinHeight }
      : {}),
  };
}

export function applyCssVars(el: HTMLElement, vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
  }
}
