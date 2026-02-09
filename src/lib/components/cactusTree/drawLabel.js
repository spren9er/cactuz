/**
 * Label drawing utilities for CactusTree component
 *
 * - Use measured font metrics (via ctx.measureText and actualBoundingBox*)
 * - Style-driven values and per-depth overrides
 *
 * Exports:
 * - getLabelStyle
 * - shouldShowLeafLabel
 * - calculateFontSize
 * - truncateText
 * - drawCenteredLabel
 * - shouldShowLabel
 * - drawLabelConnectors
 * - drawPositionedLabel
 * - computeLabelLayout
 * - drawLabels
 */

import { setCanvasStyles } from './canvasUtils.js';
import { calculateLabelPositions } from './labelPositions.js';

/**
 * @typedef {Object} LabelLinkStyle
 * @property {string} [strokeColor]
 * @property {number} [strokeOpacity]
 * @property {number} [strokeWidth]
 * @property {number} [padding]
 * @property {number} [length]
 */

/**
 * @typedef {Object} HighlightStyle
 * @property {string} [textColor]
 * @property {number} [textOpacity]
 * @property {string} [fontWeight]
 *
 * Optional nested highlight groups for label rendering:
 * - `inner` applies to labels rendered inside nodes (centered labels)
 * - `outer` applies to outside-positioned labels
 *
 * Each nested group mirrors the flat highlight properties and may override them.
 *
 * @property {Object} [inner] - inner label highlight overrides
 * @property {string} [inner.textColor]
 * @property {number} [inner.textOpacity]
 * @property {string} [inner.fontWeight]
 *
 * @property {Object} [outer] - outer label highlight overrides
 * @property {string} [outer.textColor]
 * @property {number} [outer.textOpacity]
 * @property {string} [outer.fontWeight]
 */

/**
 * @typedef {Object} LabelStyle
 * @property {string} [textColor] - convenience top-level color (prefers outer then inner)
 * @property {number} [textOpacity] - convenience top-level opacity
 * @property {string} [fontFamily] - convenience top-level fontFamily
 * @property {number} [minFontSize] - legacy/compat: min font size used for inner labels
 * @property {number} [maxFontSize] - legacy/compat: max font size used for inner labels
 * @property {string} [fontWeight]
 * @property {number} [padding]
 * @property {LabelLinkStyle} [link]
 * @property {HighlightStyle} [highlight]
 * @property {number} [insideFitFactor]
 * @property {number} [estimatedCharWidth]
 *
 * @property {Object} [inner] - settings for labels rendered inside circles
 * @property {string} [inner.textColor]
 * @property {number} [inner.textOpacity]
 * @property {string} [inner.fontFamily]
 * @property {number} [inner.minFontSize]
 * @property {number} [inner.maxFontSize]
 * @property {string} [inner.fontWeight]
 * @property {number} [inner.padding]
 * @property {LabelLinkStyle} [inner.link]
 * @property {HighlightStyle} [inner.highlight]
 * @property {number} [inner.insideFitFactor]
 * @property {number} [inner.estimatedCharWidth]
 *
 * @property {Object} [outer] - settings for labels rendered outside circles
 * @property {string} [outer.textColor]
 * @property {number} [outer.textOpacity]
 * @property {string} [outer.fontFamily]
 * @property {number} [outer.fontSize]
 * @property {string} [outer.fontWeight]
 * @property {number} [outer.padding]
 * @property {LabelLinkStyle} [outer.link]
 * @property {HighlightStyle} [outer.highlight]
 */

/**
 * Resolve label style for a node (consider per-depth override first, negative depth mapping, then global)
 *
 * @param {number} depth
 * @param {string} nodeId
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 * @returns {LabelStyle}
 */
export function getLabelStyle(
  depth,
  nodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  let depthStyle = null;
  if (depthStyleCache && depthStyleCache.has(depth)) {
    depthStyle = depthStyleCache.get(depth);
  } else if (mergedStyle?.depths) {
    for (const ds of mergedStyle.depths) {
      if (ds.depth === depth) {
        depthStyle = ds;
        break;
      } else if (ds.depth < 0) {
        const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
        if (nodesAtThisNegativeDepth && nodesAtThisNegativeDepth.has(nodeId)) {
          depthStyle = ds;
          break;
        }
      }
    }
  }

  // Support new label schema with `inner` and `outer` groups while remaining
  // backwards-compatible with older flat label definitions.
  const globalLabel = mergedStyle?.label ?? {};
  const labelFromDepth = depthStyle?.label ?? null;

  const globalInner = globalLabel.inner ?? {};
  const globalOuter = globalLabel.outer ?? {};
  const depthInner = labelFromDepth?.inner ?? {};
  const depthOuter = labelFromDepth?.outer ?? {};

  // Top-level visual defaults (prefer inner settings, then outer, then any flat legacy keys)
  const textColor =
    depthInner?.textColor ??
    depthOuter?.textColor ??
    globalInner?.textColor ??
    globalOuter?.textColor ??
    globalLabel?.textColor ??
    '#333333';
  const textOpacity =
    depthInner?.textOpacity ??
    depthOuter?.textOpacity ??
    globalInner?.textOpacity ??
    globalOuter?.textOpacity ??
    globalLabel?.textOpacity ??
    1.0;

  const fontFamily =
    depthInner?.fontFamily ??
    depthOuter?.fontFamily ??
    globalInner?.fontFamily ??
    globalOuter?.fontFamily ??
    globalLabel?.fontFamily ??
    'monospace';

  const fontWeight =
    depthInner?.fontWeight ??
    depthOuter?.fontWeight ??
    globalInner?.fontWeight ??
    globalOuter?.fontWeight ??
    globalLabel?.fontWeight;

  // Inner (inside-circle) font sizing (linear transformation)
  const innerMinFontSize =
    depthInner?.minFontSize ??
    globalInner?.minFontSize ??
    globalLabel?.minFontSize ??
    8;
  const innerMaxFontSize =
    depthInner?.maxFontSize ??
    globalInner?.maxFontSize ??
    globalLabel?.maxFontSize ??
    14;

  // Outer (outside-circle) uses a static font size if provided
  const outerFontSize =
    depthOuter?.fontSize ?? globalOuter?.fontSize ?? globalLabel?.fontSize;

  // Padding / fitting defaults: padding and link settings live under `outer` in the new schema
  const padding =
    depthOuter?.padding ?? globalOuter?.padding ?? globalLabel?.padding ?? 4;
  const insideFitFactor =
    depthInner?.insideFitFactor ??
    globalInner?.insideFitFactor ??
    globalLabel?.insideFitFactor ??
    0.9;

  const linkFromDepth = depthOuter?.link ?? labelFromDepth?.link ?? null;
  const globalLink = globalOuter?.link ?? globalLabel?.link ?? {};

  const link = {
    strokeColor:
      linkFromDepth?.strokeColor ?? globalLink?.strokeColor ?? '#333333',
    strokeOpacity:
      linkFromDepth?.strokeOpacity ?? globalLink?.strokeOpacity ?? 1.0,
    strokeWidth: linkFromDepth?.strokeWidth ?? globalLink?.strokeWidth ?? 0.5,
    padding: linkFromDepth?.padding ?? globalLink?.padding ?? 0,
    length: linkFromDepth?.length ?? globalLink?.length ?? 5,
  };

  // Highlight resolution:
  // - Depth-specific highlights live under depth.label.inner/outer.highlight and are preferred.
  // - Global highlights are read only from top-level `mergedStyle.highlight.label`.
  // Legacy nested `label.highlight` under global label or other legacy locations are no longer supported.
  const highlightFromDepth =
    depthInner?.highlight ?? depthOuter?.highlight ?? null;
  const globalHighlight = mergedStyle?.highlight?.label ?? {};
  const highlight = {
    textColor:
      highlightFromDepth?.textColor ?? globalHighlight?.textColor ?? undefined,
    textOpacity:
      highlightFromDepth?.textOpacity ??
      globalHighlight?.textOpacity ??
      undefined,
    fontWeight:
      highlightFromDepth?.fontWeight ??
      globalHighlight?.fontWeight ??
      undefined,
  };

  // Return both merged top-level properties (for backwards compatibility) and
  // explicit `inner` / `outer` groups so callers can choose sizing rules.
  //
  // Expose `outer` group's common visual properties so callers can explicitly
  // use `label.outer.*` (textColor, textOpacity, fontFamily, fontWeight,
  // padding, link, fontSize) when rendering outside labels.
  return {
    textColor,
    textOpacity,
    fontFamily,
    fontWeight,
    padding,
    link,
    highlight,
    insideFitFactor,
    inner: {
      minFontSize: innerMinFontSize,
      maxFontSize: innerMaxFontSize,
    },
    outer: {
      // Expose rendering-related properties for outside labels.
      textColor:
        depthOuter?.textColor ??
        globalOuter?.textColor ??
        globalLabel?.textColor ??
        undefined,
      textOpacity:
        depthOuter?.textOpacity ??
        globalOuter?.textOpacity ??
        globalLabel?.textOpacity ??
        undefined,
      fontFamily:
        depthOuter?.fontFamily ??
        globalOuter?.fontFamily ??
        globalLabel?.fontFamily ??
        undefined,
      fontWeight:
        depthOuter?.fontWeight ??
        globalOuter?.fontWeight ??
        globalLabel?.fontWeight ??
        undefined,
      padding:
        depthOuter?.padding ??
        globalOuter?.padding ??
        globalLabel?.padding ??
        undefined,
      // Centralize link defaults for outer labels
      link: {
        strokeColor: link.strokeColor,
        strokeOpacity: link.strokeOpacity,
        strokeWidth: link.strokeWidth,
        padding: link.padding,
        length: link.length,
      },
      // expose font size (still computed above)
      fontSize: outerFontSize,
    },
  };
}

/**
 * Whether a leaf node's label should be shown (consider edge-bundling hover behavior)
 *
 * @param {string} nodeId
 * @param {Set<string>} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any[]|Set<string>} visibleNodeIds
 * @returns {boolean}
 */
export function shouldShowLeafLabel(
  nodeId,
  leafNodes,
  hoveredNodeId,
  visibleNodeIds,
) {
  const isActualLeaf = leafNodes.has(nodeId);
  if (!isActualLeaf) return false;
  const isHoveringLeafNode =
    hoveredNodeId !== null && leafNodes.has(hoveredNodeId);
  if (isHoveringLeafNode) {
    // Always show the label for the currently hovered leaf node itself.
    if (nodeId === hoveredNodeId) return true;
    // When hovering a leaf, for other leaves only show labels that are part of visibleNodeIds
    return Array.isArray(visibleNodeIds)
      ? visibleNodeIds.includes(nodeId)
      : visibleNodeIds.has(nodeId);
  }
  return true;
}

/**
 * Choose font size based on radius.
 * Uses min/max font sizes from label config.
 *
 * @param {number} radius
 * @param {number} [minFontSize=8]
 * @param {number} [maxFontSize=14]
 * @returns {number}
 */
export function calculateFontSize(radius, minFontSize = 8, maxFontSize = 14) {
  return Math.min(maxFontSize, Math.max(minFontSize, radius * 0.25));
}

/**
 * Truncate text to fit within max width using measured text width.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
export function truncateText(ctx, text, maxWidth) {
  if (!ctx) return text;
  const textWidth = ctx.measureText(text).width;
  if (textWidth <= maxWidth || text.length <= 3) return text;
  const ratio = maxWidth / textWidth;
  const truncateLength = Math.floor(text.length * ratio);
  return text.substring(0, Math.max(1, truncateLength - 3)) + '…';
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {LabelStyle} labelStyle
 * @param {number} [minFontSize]
 * @param {number} [maxFontSize]
 * @param {boolean} [highlightActive]
 * @param {HighlightStyle} [highlightStyle]
 * @returns {void}
 */
export function drawCenteredLabel(
  ctx,
  text,
  x,
  y,
  radius,
  labelStyle,
  minFontSize = 8,
  maxFontSize = 14,
  highlightActive = false,
  highlightStyle = {},
) {
  if (!ctx || !text) return;

  const fontSize = calculateFontSize(radius, minFontSize, maxFontSize);
  const h = highlightStyle || {};
  const ls = labelStyle || {};
  // For inside (centered) labels prefer `inner` group highlight values first.
  // Support both flat highlight objects and nested { inner: { ... } } shape.
  const hInner = highlightActive ? h && (h.inner ?? h) : null;
  // Fill color: prefer active highlight inner/textColor, then inner label value, then fallback
  const fillColor =
    hInner && hInner.textColor !== undefined
      ? hInner.textColor
      : (ls.inner?.textColor ?? ls.textColor);
  // Opacity: prefer active highlight inner/textOpacity, then inner label opacity, then 1
  const alpha =
    hInner && hInner.textOpacity !== undefined
      ? hInner.textOpacity
      : (ls.inner?.textOpacity ?? ls.textOpacity ?? 1);
  // Font weight: prefer active highlight inner/fontWeight, then inner label weight, then none
  const fontWeightPrefix =
    hInner && hInner.fontWeight
      ? `${hInner.fontWeight} `
      : (ls.inner?.fontWeight ?? ls.fontWeight)
        ? `${ls.inner?.fontWeight ?? ls.fontWeight} `
        : '';

  const fontFamily = ls.inner?.fontFamily ?? ls.fontFamily ?? 'monospace';
  setCanvasStyles(ctx, {
    fillStyle: fillColor,
    globalAlpha: alpha,
    font: `${fontWeightPrefix}${fontSize}px ${fontFamily}`,
    textAlign: 'center',
    textBaseline: 'middle',
  });

  const maxWidth = radius * 1.8;
  const displayText = truncateText(ctx, text, maxWidth);

  ctx.fillText(displayText, x, y);

  if (ctx.globalAlpha !== 1.0) ctx.globalAlpha = 1.0;
}

/**
 * Basic eligibility for showing a label for a node (non-leaf)
 *
 * @param {any} node
 * @param {number} radius
 * @param {string} nodeId
 * @param {Set<string>} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any[]|Set<string>} visibleNodeIds
 * @param {{textColor?: string}} labelStyleWrapper
 * @returns {boolean}
 */
export function shouldShowLabel(
  node,
  radius,
  nodeId,
  leafNodes,
  hoveredNodeId,
  visibleNodeIds,
  labelStyleWrapper,
) {
  if (radius < 1) return false;
  const isActualLeaf = leafNodes.has(nodeId);
  if (isActualLeaf)
    return shouldShowLeafLabel(
      nodeId,
      leafNodes,
      hoveredNodeId,
      visibleNodeIds,
    );
  const col = labelStyleWrapper && labelStyleWrapper.textColor;
  return col !== undefined && col !== 'none' && col !== 'transparent';
}

/**
 * Draw connectors (leader lines) between node anchor and outside label positions.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x1:number,y1:number,x2:number,y2:number,nodeId:string}>} links
 * @param {any} mergedStyle
 * @param {Array<any>} nodesWithLabels
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 * @returns {void}
 */
export function drawLabelConnectors(
  ctx,
  links,
  mergedStyle,
  nodesWithLabels = [],
  depthStyleCache = new Map(),
  negativeDepthNodes = new Map(),
) {
  if (!ctx || !links || links.length === 0) return;

  ctx.save();
  const prevComposite = ctx.globalCompositeOperation;
  try {
    ctx.globalCompositeOperation = 'destination-over';

    for (const linkSeg of links) {
      const nodeId = linkSeg.nodeId;
      const globalLabel = mergedStyle?.label ?? {};
      const globalOuter = globalLabel.outer ?? {};
      const globalLink = globalOuter.link ?? globalLabel.link ?? {};

      const nodeData =
        nodesWithLabels &&
        nodesWithLabels.find((n) => n && n.node && n.node.id === nodeId);

      let linkStyle = null;
      if (nodeData && nodeData.linkStyle) {
        linkStyle = nodeData.linkStyle;
      } else {
        let depthLink = {};
        if (nodeData) {
          const depth = nodeData.depth;
          const labelStyle = getLabelStyle(
            depth,
            nodeId,
            mergedStyle,
            depthStyleCache,
            negativeDepthNodes,
          );
          depthLink = (labelStyle && labelStyle.link) || {};
        }
        const nodeLink =
          nodeData &&
          nodeData.node &&
          nodeData.node.label &&
          nodeData.node.label.link
            ? nodeData.node.label.link
            : {};
        linkStyle = {
          ...(globalLink || {}),
          ...(depthLink || {}),
          ...(nodeLink || {}),
        };
      }

      const color =
        linkStyle.strokeColor ??
        globalOuter.textColor ??
        globalLabel.textColor ??
        '#333333';
      const width =
        typeof linkStyle.strokeWidth === 'number'
          ? linkStyle.strokeWidth
          : (globalLink.strokeWidth ?? 1);
      const alpha =
        typeof linkStyle.strokeOpacity === 'number'
          ? linkStyle.strokeOpacity
          : (globalLink.strokeOpacity ?? 1);

      setCanvasStyles(ctx, {
        strokeStyle: color,
        lineWidth: width,
        globalAlpha: alpha,
      });
      ctx.beginPath();
      ctx.moveTo(linkSeg.x1, linkSeg.y1);
      ctx.lineTo(linkSeg.x2, linkSeg.y2);
      ctx.stroke();
      if (ctx.globalAlpha !== 1.0) ctx.globalAlpha = 1.0;
    }
  } finally {
    ctx.globalCompositeOperation = prevComposite;
    ctx.restore();
  }
}

/**
 * Draw a single outside positioned label (with optional connector)
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} labelData
 * @param {any} nodeData
 * @param {Set<string>} leafNodes
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 /**
  * @returns {void}
  */
export function drawPositionedLabel(
  ctx,
  labelData,
  nodeData,
  leafNodes,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
  highlightActive = false,
) {
  const { node, depth } = nodeData;
  const { text, x, y } = labelData;
  const nodeId = node.id;

  const labelStyle =
    getLabelStyle(
      depth,
      nodeId,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
    ) || {};
  // Outside-positioned labels use a static font size if provided via outer.fontSize.
  // Use `outer.fontSize` exclusively for outside labels; fallback to 8 when missing.
  const fontSize = labelStyle.outer?.fontSize ?? 8;

  // Determine if a per-node highlightStyle exists (computeLabelLayout attaches it to nodeData)
  // Only apply per-node highlight overrides when this node is actively highlighted.
  const nodeHighlight =
    highlightActive && nodeData && nodeData.highlightStyle
      ? nodeData.highlightStyle
      : null;

  // For outside-positioned labels: prefer highlight.outer values when present,
  // but also support flat highlight objects for backward compatibility.
  const nhOuter = nodeHighlight ? (nodeHighlight.outer ?? nodeHighlight) : null;

  // For outside labels, strictly prefer `outer` group values for visual properties
  // (textColor, textOpacity, fontFamily, fontWeight, fontSize). Node-level highlight overrides
  // (nodeData.highlightStyle / nodeData.highlightStyle.outer) take precedence when provided.
  const resolvedTextColor =
    nhOuter?.textColor ??
    (labelStyle.outer && labelStyle.outer.textColor !== undefined
      ? labelStyle.outer.textColor
      : labelStyle.textColor !== undefined
        ? labelStyle.textColor
        : '#333333');
  const resolvedTextOpacity =
    nhOuter?.textOpacity ??
    (labelStyle.outer && labelStyle.outer.textOpacity !== undefined
      ? labelStyle.outer.textOpacity
      : labelStyle.textOpacity !== undefined
        ? labelStyle.textOpacity
        : 1);
  const resolvedFontWeight =
    nhOuter?.fontWeight ??
    (labelStyle.outer && labelStyle.outer.fontWeight !== undefined
      ? labelStyle.outer.fontWeight
      : labelStyle.fontWeight);

  const fontWeightPrefix = resolvedFontWeight ? `${resolvedFontWeight} ` : '';

  const fontFamily =
    (labelStyle.outer && labelStyle.outer.fontFamily) ??
    labelStyle.fontFamily ??
    'monospace';

  setCanvasStyles(ctx, {
    fillStyle: resolvedTextColor,
    globalAlpha: resolvedTextOpacity,
    font: `${fontWeightPrefix}${fontSize}px ${fontFamily}`,
    textAlign: labelData.isInside ? 'center' : 'left',
    textBaseline: labelData.isInside ? 'middle' : 'top',
  });

  if (labelData.isInside) {
    // Inside labels keep the same behavior and still pass highlight flags elsewhere (drawCenteredLabel)
    ctx.fillText(text, x + labelData.width / 2, y + labelData.height / 2);
  } else {
    // Prefer outer.padding for outside labels, fall back to top-level padding, then to a default.
    const labelPadding =
      typeof labelStyle.outer?.padding === 'number'
        ? labelStyle.outer.padding
        : typeof labelStyle.padding === 'number'
          ? labelStyle.padding
          : 4;
    ctx.fillText(text, x + labelPadding, y + labelPadding);
  }

  if (ctx.globalAlpha !== 1.0) ctx.globalAlpha = 1.0;
}

/**
 * Compute label layout (labels + connector segments + nodesWithLabels) but do not draw anything.
 *
 * Behavior changes applied:
 * - If numLabels === 0 -> no labels (return null)
 * - When hovered (hoveredNodeId !== null): only consider nodes that are in highlightedNodeIds
 *   and limit total shown to numLabels largest nodes. Do NOT special-case inside-fitting labels.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {any[]} renderedNodes
 * @param {Set<string>} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any[]|Set<string>} highlightedNodeIds - Set/array of node IDs that are considered highlighted due to link association (direct neighbors of hovered node)
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 * @param {number} [numLabels=30]
 * @param {number} [panX=0]
 * @param {number} [panY=0]
 * @returns {{labels:any[],links:any[],nodesWithLabels:any[],labelMinFontSize:number,labelMaxFontSize:number}|null}
 */
export function computeLabelLayout(
  ctx,
  renderedNodes,
  leafNodes,
  hoveredNodeId,
  highlightedNodeIds,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
  numLabels = 30,
  panX = 0,
  panY = 0,
) {
  if (!ctx || !renderedNodes || renderedNodes.length === 0) return null;

  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = ctx.canvas.width / devicePixelRatio;
  const height = ctx.canvas.height / devicePixelRatio;

  /**
   * @param {{x:number,y:number,radius:number}} nodeData
   * @returns {boolean}
   */
  function isInViewport(nodeData) {
    const { x, y, radius } = nodeData;
    const screenX = x + panX;
    const screenY = y + panY;
    return (
      screenX + radius >= 0 &&
      screenX - radius <= width &&
      screenY + radius >= 0 &&
      screenY - radius <= height
    );
  }

  const nodesInViewport = renderedNodes.filter(isInViewport);

  // filter by basic label eligibility
  const eligibleNodes = nodesInViewport.filter((nodeData) => {
    const { radius, node, depth } = nodeData;
    const nodeId = node.id;
    const labelStyle = getLabelStyle(
      depth,
      nodeId,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
    );
    // For outside-label eligibility checks prefer outer.textColor when present
    return shouldShowLabel(
      node,
      radius,
      nodeId,
      leafNodes,
      hoveredNodeId,
      highlightedNodeIds,
      { textColor: labelStyle.outer?.textColor ?? labelStyle.textColor },
    );
  });

  // If numLabels == 0, show no labels at all
  const labelLimit = Number(numLabels ?? 30);
  if (labelLimit === 0) return null;

  // Determine nodes to show labels for (hover vs normal)
  let nodesWithLabels;

  // When hovering a leaf node, restrict to nodes that are associated via highlightedNodeIds.
  // Limit total to labelLimit largest by radius. Ensure the currently hovered node's label
  // is always included if it is eligible and in the viewport.
  if (hoveredNodeId !== null && leafNodes.has(hoveredNodeId)) {
    const visibleSet = Array.isArray(highlightedNodeIds)
      ? new Set(highlightedNodeIds)
      : highlightedNodeIds || new Set();

    // Candidates directly connected to hovered node.
    let connectedCandidates = eligibleNodes.filter((nd) =>
      visibleSet.has(nd.node.id),
    );

    // Ensure the hovered node itself is present if eligible (may not be in visibleSet)
    const hoveredCandidate = eligibleNodes.find(
      (nd) => nd.node.id === hoveredNodeId,
    );
    if (
      hoveredCandidate &&
      !connectedCandidates.some((nd) => nd.node.id === hoveredNodeId)
    ) {
      connectedCandidates.push(hoveredCandidate);
    }

    if (!connectedCandidates || connectedCandidates.length === 0) return null;

    const sorted = connectedCandidates
      .slice()
      .sort((a, b) => b.radius - a.radius);
    nodesWithLabels = sorted.slice(0, labelLimit);
  } else {
    const sortedByRadius = eligibleNodes
      .slice()
      .sort((a, b) => b.radius - a.radius);
    nodesWithLabels = sortedByRadius.slice(0, labelLimit);
  }

  if (!nodesWithLabels || nodesWithLabels.length === 0) return null;

  const globalLabel = mergedStyle?.label ?? {};
  const globalInner = globalLabel.inner ?? {};
  const globalOuter = globalLabel.outer ?? {};
  // Prefer outer font settings for outside labels when computing layout defaults
  const labelFontFamily =
    globalOuter.fontFamily ??
    globalInner.fontFamily ??
    globalLabel.fontFamily ??
    'monospace';
  const labelMinFontSize =
    globalInner.minFontSize ?? globalLabel.minFontSize ?? 8;
  const labelMaxFontSize =
    globalInner.maxFontSize ?? globalLabel.maxFontSize ?? 14;
  const globalLabelPadding = globalOuter.padding ?? globalLabel.padding ?? 4;
  const globalLinkPadding =
    globalOuter.link && typeof globalOuter.link.padding === 'number'
      ? globalOuter.link.padding
      : globalLabel.link && typeof globalLabel.link.padding === 'number'
        ? globalLabel.link.padding
        : 0;
  const globalLinkLength =
    globalOuter.link && typeof globalOuter.link.length === 'number'
      ? globalOuter.link.length
      : globalLabel.link && typeof globalLabel.link.length === 'number'
        ? globalLabel.link.length
        : 5;

  // Attach per-node resolved properties for the positioner
  nodesWithLabels.forEach((nodeData) => {
    const node = nodeData.node;
    const depth = nodeData.depth;
    const perNodeStyle = getLabelStyle(
      depth,
      node.id,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
    );

    node.label = node.label ?? {};
    node.label.padding =
      perNodeStyle?.padding ??
      (typeof node.label.padding === 'number'
        ? node.label.padding
        : undefined) ??
      globalLabelPadding;

    node.label.link = node.label.link ?? {};
    node.label.link.padding =
      perNodeStyle?.link?.padding ??
      (typeof node.label.link.padding === 'number'
        ? node.label.link.padding
        : undefined) ??
      globalLinkPadding;
    node.label.link.length =
      perNodeStyle?.link?.length ??
      (typeof node.label.link.length === 'number'
        ? node.label.link.length
        : undefined) ??
      globalLinkLength;

    nodeData.labelPadding = node.label.padding;
    nodeData.linkPadding = node.label.link.padding;
    nodeData.linkLength = node.label.link.length;

    const globalLink =
      mergedStyle?.label?.outer?.link ?? mergedStyle?.label?.link ?? {};
    const depthLink = perNodeStyle?.link ?? {};
    const nodeLink = node.label && node.label.link ? node.label.link : {};
    nodeData.linkStyle = {
      ...(globalLink || {}),
      ...(depthLink || {}),
      ...(nodeLink || {}),
    };

    // Global label highlight is now at the top-level `mergedStyle.highlight.label`.
    // Depth-based highlights remain under per-depth `label.highlight`.
    const globalHighlight = mergedStyle?.highlight?.label ?? {};
    const depthHighlight = perNodeStyle?.highlight ?? {};
    nodeData.highlightStyle = {
      ...(globalHighlight || {}),
      ...(depthHighlight || {}),
    };
  });

  const { labels, links } = calculateLabelPositions(
    nodesWithLabels,
    width,
    height,
    {
      fontFamily: labelFontFamily,
      // Prefer an explicit outer.fontSize for outside label layout when present;
      // otherwise fall back to the inner/default min font size for layout.
      fontSize: globalOuter?.fontSize ?? labelMinFontSize,
      minRadius: 2,
      labelPadding: globalLabelPadding,
      linkPadding: globalLinkPadding,
      linkLength: globalLinkLength,
      allNodes: renderedNodes,
    },
  );

  return {
    labels,
    links,
    nodesWithLabels,
    labelMinFontSize,
    labelMaxFontSize,
  };
}

/**
 * Draw labels for visible/rendered nodes
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {any[]} renderedNodes
 * @param {Set<string>} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any[]|Set<string>} highlightedNodeIds - Set/array of node IDs that are considered highlighted due to link association (direct neighbors of hovered node)
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 * @param {number} [numLabels=30]
 * @param {number} [panX=0]
 * @param {number} [panY=0]
 * @returns {void}
 */
export function drawLabels(
  ctx,
  renderedNodes,
  leafNodes,
  hoveredNodeId,
  highlightedNodeIds,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
  numLabels = 30,
  panX = 0,
  panY = 0,
) {
  if (!ctx || !renderedNodes || renderedNodes.length === 0) return;

  const layout = computeLabelLayout(
    ctx,
    renderedNodes,
    leafNodes,
    hoveredNodeId,
    highlightedNodeIds,
    mergedStyle,
    depthStyleCache,
    negativeDepthNodes,
    numLabels,
    panX,
    panY,
  );
  if (!layout) return;

  const { labels, links, nodesWithLabels, labelMinFontSize, labelMaxFontSize } =
    layout;

  if (links && links.length > 0) {
    drawLabelConnectors(
      ctx,
      links,
      mergedStyle,
      nodesWithLabels,
      depthStyleCache,
      negativeDepthNodes,
    );
  }

  // draw labels on top
  for (const labelData of labels) {
    const nodeData = nodesWithLabels.find(
      (n) => n.node.id === labelData.nodeId,
    );
    if (!nodeData) continue;

    // Determine highlight state for this node (used by both inner and outer label rendering)
    const { node } = nodeData;
    const isHighlighted =
      (hoveredNodeId !== null && hoveredNodeId === node.id) ||
      (highlightedNodeIds &&
        (Array.isArray(highlightedNodeIds)
          ? highlightedNodeIds.includes(node.id)
          : highlightedNodeIds.has(node.id)));

    if (labelData.isInside) {
      const { depth, radius } = nodeData;
      const labelStyle = getLabelStyle(
        depth,
        node.id,
        mergedStyle,
        depthStyleCache,
        negativeDepthNodes,
      );
      const text = String(node.name || node.id);
      const minFS = labelStyle.inner?.minFontSize ?? labelMinFontSize;
      const maxFS = labelStyle.inner?.maxFontSize ?? labelMaxFontSize;
      // For inner labels we continue to pass highlightStyle (it will be applied only when highlighted)
      drawCenteredLabel(
        ctx,
        text,
        nodeData.x,
        nodeData.y,
        radius,
        labelStyle,
        minFS,
        maxFS,
        isHighlighted,
        isHighlighted ? nodeData.highlightStyle : {},
      );
    } else {
      // For outside labels only use per-node highlight overrides when the node is highlighted.
      drawPositionedLabel(
        ctx,
        labelData,
        nodeData,
        leafNodes,
        mergedStyle,
        depthStyleCache,
        negativeDepthNodes,
        isHighlighted,
      );
    }
  }
}
