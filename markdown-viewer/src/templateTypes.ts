export type FontSpec = {
  family?: string;
  size?: string;
  weight?: string;
  style?: string;
  lineHeight?: string;
  letterSpacing?: string;
  color?: string;
  marginTop?: string;
  marginBottom?: string;
};

export type BlockStyle = {
  marginTop?: string;
  marginBottom?: string;
  padding?: string;
  borderLeft?: string;
  background?: string;
  color?: string;
  fontStyle?: string;
};

export type ListStyle = {
  marginTop?: string;
  marginBottom?: string;
  paddingLeft?: string;
  itemMargin?: string;
  markerColor?: string;
  nestedMarginTop?: string;
};

export type TableStyle = {
  width?: string;
  borderCollapse?: string;
  marginTop?: string;
  marginBottom?: string;
  borderColor?: string;
  headerBackground?: string;
  headerColor?: string;
  headerFontWeight?: string;
  cellPadding?: string;
  rowAlternateBackground?: string;
  fontSize?: string;
};

export type CodeStyle = {
  fontFamily?: string;
  fontSize?: string;
  background?: string;
  color?: string;
  padding?: string;
  borderRadius?: string;
  blockPadding?: string;
  blockBorder?: string;
};

export type LinkStyle = {
  color?: string;
  textDecoration?: string;
  textUnderlineOffset?: string;
};

export type HrStyle = {
  border?: string;
  borderTop?: string;
  marginTop?: string;
  marginBottom?: string;
};

export type ViewerTemplate = {
  version?: number;
  displayName?: string;
  document?: {
    shellBackground?: string;
    pageBackground?: string;
    pageMaxWidth?: string;
    pagePadding?: string;
    pageMarginY?: string;
    pageRadius?: string;
    pageShadow?: string;
    pageBorder?: string;
  };
  cover?: {
    enabled?: boolean;
    background?: string;
    color?: string;
    minHeight?: string;
    padding?: string;
    title?: FontSpec;
    subtitle?: FontSpec;
    meta?: FontSpec;
    showDocumentTitle?: boolean;
    subtitleText?: string;
    metaText?: string;
  };
  endPage?: {
    enabled?: boolean;
    background?: string;
    color?: string;
    minHeight?: string;
    padding?: string;
    title?: FontSpec;
    body?: FontSpec;
    titleText?: string;
    bodyText?: string;
  };
  toc?: {
    enabled?: boolean;
    heading?: string;
    headingStyle?: FontSpec;
    itemStyle?: FontSpec;
    containerPadding?: string;
    maxWidth?: string;
    borderBottom?: string;
    linkColor?: string;
  };
  prose?: {
    fontFamily?: string;
    fontSize?: string;
    lineHeight?: string;
    color?: string;
    maxWidth?: string;
    paragraphMargin?: string;
  };
  headings?: {
    h1?: FontSpec;
    h2?: FontSpec;
    h3?: FontSpec;
    h4?: FontSpec;
    h5?: FontSpec;
    h6?: FontSpec;
  };
  blockquote?: BlockStyle;
  lists?: {
    ul?: ListStyle;
    ol?: ListStyle;
  };
  table?: TableStyle;
  hr?: HrStyle;
  code?: CodeStyle;
  link?: LinkStyle;
  strong?: { fontWeight?: string; color?: string };
  em?: { fontStyle?: string };
  /** Print / PDF (browser afdrukken). */
  print?: {
    /** Elke `#`-kop (H1) begint op een nieuwe pagina bij afdrukken/PDF. */
    h1PageBreakBefore?: boolean;
    /** Elke `##`-kop (H2) begint op een nieuwe pagina bij afdrukken/PDF. */
    h2PageBreakBefore?: boolean;
  };
  /**
   * Scherm (geen echte papierpagina’s): subtiele hoofdstuk-scheiding vóór H1/H2
   * zodat koppen beter als afzonderlijke blokken leesbaar zijn.
   */
  screen?: {
    chapterDividerBeforeH1?: boolean;
    chapterDividerBeforeH2?: boolean;
    /** Meerdere witte “tekstdozen” met grijze tussenruimte — denk pagina-overgang. */
    visualPageBreaks?: boolean;
    /** Waar te splitsen: `h1` (#), `h2` (##), of beide (elk blok op eigen blad waar split optreedt). */
    visualPageSplit?: "h1" | "h2" | "both";
    /** Minimale hoogte van zo’n wit blad scherm op scherm, bijv. `75vh` of `840px`. */
    visualPageMinHeight?: string;
  };
};
