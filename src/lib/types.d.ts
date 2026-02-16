export interface EdgeOptions {
  bundlingStrength?: number;
  filterMode?: 'hide' | 'mute';
  muteOpacity?: number;
}

export interface Options {
  overlap?: number;
  arcSpan?: number;
  sizeGrowthRate?: number;
  orientation?: number;
  zoom?: number;
  numLabels?: number;
  edges?: EdgeOptions;
}

export interface ColorScale {
  scale: string;
  reverse?: boolean;
}

export interface NodeStyle {
  fillColor?: string | ColorScale;
  fillOpacity?: number;
  strokeColor?: string | ColorScale;
  strokeOpacity?: number;
  strokeWidth?: number;
}

export interface EdgeStyle {
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

export interface LabelLinkStyle {
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  padding?: number;
  length?: number;
}

export interface InnerLabelStyle {
  textColor?: string;
  textOpacity?: number;
  fontFamily?: string;
  fontWeight?: string;
  minFontSize?: number;
  maxFontSize?: number;
}

export interface OuterLabelStyle {
  textColor?: string;
  textOpacity?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontSize?: number;
  padding?: number;
  link?: LabelLinkStyle;
}

export interface HighlightLabelStyle {
  inner?: HighlightInnerLabelStyle;
  outer?: HighlightOuterLabelStyle;
}

export interface LabelStyle {
  inner?: InnerLabelStyle;
  outer?: OuterLabelStyle;
}

export interface LinkStyle {
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

export interface HighlightInnerLabelStyle {
  textColor?: string;
  textOpacity?: number;
  fontWeight?: string;
}

export interface HighlightLabelLinkStyle {
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

export interface HighlightOuterLabelStyle {
  textColor?: string;
  textOpacity?: number;
  fontWeight?: string;
  link?: HighlightLabelLinkStyle;
}

export interface HighlightStyle {
  node?: NodeStyle;
  edge?: EdgeStyle;
  edgeNode?: NodeStyle;
  label?: {
    inner?: HighlightInnerLabelStyle;
    outer?: HighlightOuterLabelStyle;
  };
}

export interface DepthStyle {
  depth: number | '*';
  node?: NodeStyle;
  label?: LabelStyle;
  link?: LinkStyle;
  highlight?: {
    node?: NodeStyle;
    label?: {
      inner?: HighlightInnerLabelStyle;
      outer?: HighlightOuterLabelStyle;
    };
  };
}

export interface Styles {
  node?: NodeStyle;
  edge?: EdgeStyle;
  edgeNode?: NodeStyle;
  label?: LabelStyle;
  link?: LinkStyle;
  highlight?: HighlightStyle;
  depths?: DepthStyle[];
}

export interface TreeNode {
  id: string | number;
  name?: string;
  parent?: string | number | null;
  weight?: number;
  children?: TreeNode[];
  parentRef?: TreeNode | null;
  label?: {
    padding?: number;
    link?: {
      padding?: number;
      length?: number;
    } | null;
  } | null;
}

export interface NodeData {
  x: number;
  y: number;
  radius: number;
  node: TreeNode;
  isLeaf: boolean;
  depth: number;
  angle: number;
  label?: any;
  linkStyle?: LinkStyle;
  highlightStyle?: HighlightLabelStyle;
  /**
   * Runtime convenience fields set by layout/label code to avoid ad-hoc property
   * lookups at call sites. These are intentionally explicit so missing or
   * mistyped fields are detected by static checks.
   */
  labelPadding?: number;
  linkPadding?: number;
  linkLength?: number;
}

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ChildNode {
  child: TreeNode;
  weight: number;
  radius: number;
}

export interface VoronoiLeafEntry {
  x: number;
  y: number;
  radius: number;
  nodeId: string;
}

export interface VoronoiData {
  delaunay: import('d3-delaunay').Delaunay;
  leafEntries: VoronoiLeafEntry[];
}
