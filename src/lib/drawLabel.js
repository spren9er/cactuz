/**
 * Label drawing utilities for CactusTree
 *
 * - Use measured font metrics (via ctx.measureText and actualBoundingBox*)
 * - Style-driven values and per-depth overrides
 *
 * Exports:
 * - clearLabelLayoutCache
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
import { resolveDepthStyle } from './drawNode.js';
import { calculateLabelPositions } from './labelPositions.js';

// Label layout cache — avoids expensive simulated annealing on every frame
/** @type {any} */
let _labelLayoutCache = null;
/** @type {string|null} */
let _labelCacheKey = null;

// Previous label positions — survives cache invalidation to preserve labels across zoom/pan.
// Stores angle from anchor to label center and distance from circle *edge* to label center.
// This representation is zoom-invariant: when zoom changes, node radius scales but label
// dimensions (fixed font size) do not, so we recompute position = anchor + direction * (radius + edgeDist).
/** @type {Map<string, {angle: number, edgeDist: number, width: number, height: number, isInside: boolean}>} */
let _previousLabelPositions = new Map();

/**
 * Generate a cache key for label layout inputs.
 * Recompute only when hover state or viewport changes meaningfully.
 * @param {any[]} renderedNodes
 * @param {string|null} hoveredNodeId
 * @param {number} numLabels
 * @param {number} panX
 * @param {number} panY
 * @returns {string}
 */
function labelLayoutCacheKey(
  renderedNodes,
  hoveredNodeId,
  numLabels,
  panX,
  panY,
) {
  const nodeCount = renderedNodes ? renderedNodes.length : 0;
  const firstNode = renderedNodes && renderedNodes[0];
  const lastNode = renderedNodes && renderedNodes[nodeCount - 1];
  return `${nodeCount}-${hoveredNodeId}-${numLabels}-${Math.round(panX)}-${Math.round(panY)}-${firstNode?.x?.toFixed(1)}-${lastNode?.x?.toFixed(1)}`;
}

/**
 * Clear the label layout cache. Call when data or styles change.
 */
export function clearLabelLayoutCache() {
  _labelLayoutCache = null;
  _labelCacheKey = null;
}

/**
 *
 * @typedef {import('$lib/types.js').LabelStyle} LabelStyle
 * @typedef {import('$lib/types.js').LabelLinkStyle} LabelLinkStyle
 * @typedef {import('$lib/types.js').HighlightLabelStyle} HighlightLabelStyle
 * @typedef {import('$lib/types.js').HighlightLabelLinkStyle} HighlightLabelLinkStyle
 */

/**
 * Resolve label style for a node (consider per-depth override first, negative depth mapping, then global)
 *
 * @param {number} depth
 * @param {string} nodeId
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 * @returns {any}
 */
export function getLabelStyle(
  depth,
  nodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  const depthStyle = resolveDepthStyle(
    depth,
    nodeId,
    mergedStyle,
    depthStyleCache,
    negativeDepthNodes,
  );

  const globalLabel = mergedStyle?.label ?? {};
  const labelFromDepth = depthStyle?.label ?? null;

  const globalInner = globalLabel.inner ?? {};
  const globalOuter = globalLabel.outer ?? {};
  const depthInner = labelFromDepth?.inner ?? {};
  const depthOuter = labelFromDepth?.outer ?? {};

  const innerTextColor =
    depthInner?.textColor ?? globalInner?.textColor ?? '#333333';
  const innerTextOpacity =
    depthInner?.textOpacity ?? globalInner?.textOpacity ?? 1.0;
  const innerFontFamily =
    depthInner?.fontFamily ?? globalInner?.fontFamily ?? 'monospace';
  const innerFontWeight =
    depthInner?.fontWeight ?? globalInner?.fontWeight ?? undefined;

  const outerTextColor =
    depthOuter?.textColor ?? globalOuter?.textColor ?? '#333333';
  const outerTextOpacity =
    depthOuter?.textOpacity ?? globalOuter?.textOpacity ?? 1.0;
  const outerFontFamily =
    depthOuter?.fontFamily ?? globalOuter?.fontFamily ?? 'monospace';
  const outerFontWeight =
    depthOuter?.fontWeight ?? globalOuter?.fontWeight ?? undefined;

  const innerMinFontSize =
    depthInner?.minFontSize ?? globalInner?.minFontSize ?? 8;
  const innerMaxFontSize =
    depthInner?.maxFontSize ?? globalInner?.maxFontSize ?? 14;

  const outerFontSize = depthOuter?.fontSize ?? globalOuter?.fontSize;

  const linkFromDepth = depthOuter?.link ?? null;
  const globalLink = globalOuter?.link ?? {};

  const link = {
    strokeColor:
      linkFromDepth?.strokeColor ?? globalLink?.strokeColor ?? '#333333',
    strokeOpacity:
      linkFromDepth?.strokeOpacity ?? globalLink?.strokeOpacity ?? 1.0,
    strokeWidth: linkFromDepth?.strokeWidth ?? globalLink?.strokeWidth ?? 0.5,
    padding: linkFromDepth?.padding ?? globalLink?.padding ?? 0,
    length: linkFromDepth?.length ?? globalLink?.length ?? 5,
  };

  const depthLabelHighlight = {};
  const innerHighlight = depthStyle?.highlight?.label?.inner ?? null;
  if (innerHighlight) {
    depthLabelHighlight.inner = {
      textColor: innerHighlight?.textColor,
      textOpacity: innerHighlight?.textOpacity,
      fontWeight: innerHighlight?.fontWeight,
    };
  }
  const outerHighlight = depthStyle?.highlight?.label?.outer ?? null;
  if (outerHighlight) {
    const outerHighlightLink = outerHighlight?.link ?? null;
    depthLabelHighlight.outer = {
      textColor: outerHighlight?.textColor,
      textOpacity: outerHighlight?.textOpacity,
      fontWeight: outerHighlight?.fontWeight,
      link: outerHighlightLink
        ? {
            strokeColor: outerHighlightLink?.strokeColor,
            strokeOpacity: outerHighlightLink?.strokeOpacity,
            strokeWidth: outerHighlightLink?.strokeWidth,
          }
        : undefined,
    };
  }

  return {
    highlight: Object.keys(depthLabelHighlight).length
      ? depthLabelHighlight
      : undefined,
    inner: {
      textColor: innerTextColor,
      textOpacity: innerTextOpacity,
      fontFamily: innerFontFamily,
      fontWeight: innerFontWeight,
      minFontSize: innerMinFontSize,
      maxFontSize: innerMaxFontSize,
    },
    outer: {
      textColor: outerTextColor,
      textOpacity: outerTextOpacity,
      fontFamily: outerFontFamily,
      fontWeight: outerFontWeight,
      padding: depthOuter?.padding ?? globalOuter?.padding,
      link: {
        strokeColor: link.strokeColor,
        strokeOpacity: link.strokeOpacity,
        strokeWidth: link.strokeWidth,
        padding: link.padding,
        length: link.length,
      },
      fontSize: outerFontSize,
    },
  };
}

/**
 * Normalized membership test for highlightedNodeIds which may be an Array, Set-like,
 * or falsy.
 *
 * @param {Array<string>|Set<string>|null|undefined} container - container to test
 * @param {string} id - node id to look for
 * @returns {boolean}
 */
function highlightedContains(container, id) {
  if (!container) return false;
  if (Array.isArray(container)) return container.indexOf(id) !== -1;
  if (container && typeof container.has === 'function')
    return container.has(id);
  return false;
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
    if (nodeId === hoveredNodeId) return true;
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
 * @param {HighlightLabelStyle} [highlightStyle]
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
  const hInner = highlightActive ? (h.inner ?? null) : null;
  const fillColor =
    hInner && hInner.textColor !== undefined
      ? hInner.textColor
      : (ls.inner?.textColor ?? '#333333');
  const alpha =
    hInner && hInner.textOpacity !== undefined
      ? hInner.textOpacity
      : (ls.inner?.textOpacity ?? 1);
  const fontWeightPrefix =
    hInner && hInner.fontWeight
      ? `${hInner.fontWeight} `
      : ls.inner?.fontWeight
        ? `${ls.inner.fontWeight} `
        : '';

  const fontFamily = ls.inner?.fontFamily ?? 'monospace';
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
 * @param {any[]|Set<string>|null} [highlightedNodeIds=null]
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
  highlightedNodeIds = null,
) {
  if (radius < 1) {
    // Allow labels for tiny leaf nodes that are highlighted via edges
    if (
      hoveredNodeId !== null &&
      leafNodes.has(nodeId) &&
      highlightedContains(highlightedNodeIds, nodeId)
    ) {
      return shouldShowLeafLabel(
        nodeId,
        leafNodes,
        hoveredNodeId,
        visibleNodeIds,
      );
    }
    return false;
  }
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
 * @param {Set<string>|null} [highlightedNodeIds=null]
 * @returns {void}
 */
export function drawLabelConnectors(
  ctx,
  links,
  mergedStyle,
  nodesWithLabels = [],
  depthStyleCache = new Map(),
  negativeDepthNodes = new Map(),
  highlightedNodeIds = null,
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
      const globalLink = globalOuter.link ?? {};

      const nodeData =
        nodesWithLabels &&
        nodesWithLabels.find((n) => n && n.node && n.node.id === nodeId);

      let linkStyle = null;
      let depthLink = {};
      let nodeLink = {};
      let labelStyle = null;
      if (nodeData) {
        const depth = nodeData.depth;
        labelStyle = getLabelStyle(
          depth,
          nodeId,
          mergedStyle,
          depthStyleCache,
          negativeDepthNodes,
        );
        depthLink = (labelStyle && labelStyle.outer?.link) || {};
        nodeLink =
          nodeData.node && nodeData.node.label && nodeData.node.label.link
            ? nodeData.node.label.link
            : {};
      }

      linkStyle = {
        ...(globalLink || {}),
        ...(depthLink || {}),
        ...(nodeLink || {}),
      };

      // Apply highlight link overrides when this node is highlighted
      const isHighlighted =
        highlightedNodeIds &&
        typeof highlightedNodeIds.has === 'function' &&
        highlightedNodeIds.has(nodeId);

      let highlightLink = null;
      if (isHighlighted && nodeData && nodeData.highlightStyle) {
        const hs = nodeData.highlightStyle;
        highlightLink = hs.outer?.link ?? null;
      }

      const color =
        isHighlighted && highlightLink?.strokeColor
          ? highlightLink.strokeColor
          : (linkStyle.strokeColor ?? globalOuter.textColor ?? '#333333');
      const width =
        isHighlighted && typeof highlightLink?.strokeWidth === 'number'
          ? highlightLink.strokeWidth
          : typeof linkStyle.strokeWidth === 'number'
            ? linkStyle.strokeWidth
            : (globalLink.strokeWidth ?? 1);
      const alpha =
        isHighlighted && typeof highlightLink?.strokeOpacity === 'number'
          ? highlightLink.strokeOpacity
          : typeof linkStyle.strokeOpacity === 'number'
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
  const fontSize = labelStyle.outer?.fontSize ?? 8;

  const nodeHighlight =
    highlightActive && nodeData && nodeData.highlightStyle
      ? nodeData.highlightStyle
      : null;

  const nhOuter = nodeHighlight ? (nodeHighlight.outer ?? nodeHighlight) : null;
  const nhInner = nodeHighlight ? (nodeHighlight.inner ?? nodeHighlight) : null;

  const resolvedTextColor = labelData.isInside
    ? (nhInner?.textColor ?? labelStyle.inner?.textColor ?? '#333333')
    : (nhOuter?.textColor ?? labelStyle.outer?.textColor ?? '#333333');

  const resolvedTextOpacity = labelData.isInside
    ? (nhInner?.textOpacity ?? labelStyle.inner?.textOpacity ?? 1)
    : (nhOuter?.textOpacity ?? labelStyle.outer?.textOpacity ?? 1);

  const resolvedFontWeight = labelData.isInside
    ? (nhInner?.fontWeight ?? labelStyle.inner?.fontWeight)
    : (nhOuter?.fontWeight ?? labelStyle.outer?.fontWeight);

  const fontWeightPrefix = resolvedFontWeight ? `${resolvedFontWeight} ` : '';

  const fontFamily = labelData.isInside
    ? (labelStyle.inner?.fontFamily ?? 'monospace')
    : (labelStyle.outer?.fontFamily ?? 'monospace');

  setCanvasStyles(ctx, {
    fillStyle: resolvedTextColor,
    globalAlpha: resolvedTextOpacity,
    font: `${fontWeightPrefix}${fontSize}px ${fontFamily}`,
    textAlign: labelData.isInside ? 'center' : 'left',
    textBaseline: labelData.isInside ? 'middle' : 'top',
  });

  if (labelData.isInside) {
    ctx.fillText(text, x + labelData.width / 2, y + labelData.height / 2);
  } else {
    const labelPadding =
      typeof labelStyle.outer?.padding === 'number'
        ? labelStyle.outer.padding
        : 1;
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
 * @param {any[]|Set<string>} highlightedNodeIds - Set/array of node IDs that are considered highlighted due to edge association (direct neighbors of hovered node)
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 * @param {number} [numLabels=20]
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
  numLabels = 20,
  panX = 0,
  panY = 0,
) {
  if (!ctx || !renderedNodes || renderedNodes.length === 0) return null;

  const cacheKey = labelLayoutCacheKey(
    renderedNodes,
    hoveredNodeId,
    numLabels,
    panX,
    panY,
  );
  if (_labelCacheKey === cacheKey && _labelLayoutCache !== null) {
    return _labelLayoutCache;
  }

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
    return shouldShowLabel(
      node,
      radius,
      nodeId,
      leafNodes,
      hoveredNodeId,
      highlightedNodeIds,
      { textColor: labelStyle.inner?.textColor },
      highlightedNodeIds,
    );
  });

  const labelLimit = Number(numLabels ?? 20);
  if (labelLimit === 0) return null;

  let nodesWithLabels;

  if (hoveredNodeId !== null && leafNodes.has(hoveredNodeId)) {
    const visibleSet = Array.isArray(highlightedNodeIds)
      ? new Set(highlightedNodeIds)
      : highlightedNodeIds || new Set();

    let connectedCandidates = eligibleNodes.filter((nd) =>
      visibleSet.has(nd.node.id),
    );

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
  const labelFontFamily =
    globalOuter.fontFamily ?? globalInner.fontFamily ?? 'monospace';
  const labelMinFontSize = globalInner.minFontSize ?? 9;
  const labelMaxFontSize = globalInner.maxFontSize ?? 14;
  const globalLabelPadding = globalOuter.padding ?? 1;
  const globalLinkPadding =
    globalOuter.link && typeof globalOuter.link.padding === 'number'
      ? globalOuter.link.padding
      : 0;
  const globalLinkLength =
    globalOuter.link && typeof globalOuter.link.length === 'number'
      ? globalOuter.link.length
      : 5;

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
    node.label.padding = perNodeStyle?.outer?.padding ?? globalLabelPadding;

    node.label.link = node.label.link ?? {};
    node.label.link.padding =
      perNodeStyle?.outer?.link?.padding ?? globalLinkPadding;
    node.label.link.length =
      perNodeStyle?.outer?.link?.length ?? globalLinkLength;

    nodeData.labelPadding = node.label.padding;
    nodeData.linkPadding = node.label.link.padding;
    nodeData.linkLength = node.label.link.length;

    const globalLink = mergedStyle?.label?.outer?.link ?? {};
    const depthLink = perNodeStyle?.outer?.link ?? {};
    const nodeLink = node.label && node.label.link ? node.label.link : {};
    nodeData.linkStyle = {
      ...(globalLink || {}),
      ...(depthLink || {}),
      ...(nodeLink || {}),
    };

    const globalHighlight = mergedStyle?.highlight?.label ?? {};
    const depthHighlight = perNodeStyle?.highlight ?? {};
    const globalHlInner = globalHighlight.inner ?? {};
    const depthHlInner = depthHighlight.inner ?? {};
    const globalHlOuter = globalHighlight.outer ?? {};
    const depthHlOuter = depthHighlight.outer ?? {};
    nodeData.highlightStyle = {
      inner: { ...globalHlInner, ...depthHlInner },
      outer: {
        ...globalHlOuter,
        ...depthHlOuter,
        link: {
          ...(globalHlOuter.link ?? {}),
          ...(depthHlOuter.link ?? {}),
        },
      },
    };
  });

  // Build preserved positions map from previous frame.
  // For labels that are still on screen (present in nodesWithLabels),
  // recompute world-space positions from stored angle + edge distance using
  // the node's current radius. This is zoom-invariant: the label maintains
  // the same gap from the circle edge regardless of how zoom scaled the radius.
  /** @type {Map<string, {x: number, y: number, width: number, height: number}>|null} */
  let preservedPositions = null;
  if (_previousLabelPositions.size > 0) {
    const nodeMap = new Map();
    for (const nd of nodesWithLabels) {
      nodeMap.set(nd.node.id, nd);
    }
    preservedPositions = new Map();
    for (const [nodeId, prev] of _previousLabelPositions) {
      if (prev.isInside) continue; // inside labels are always re-centered
      const nd = nodeMap.get(nodeId);
      if (!nd) continue;
      // Recompute label center from angle + current radius + edge distance
      const centerDist = nd.radius + prev.edgeDist;
      const labelCenterX = nd.x + Math.cos(prev.angle) * centerDist;
      const labelCenterY = nd.y + Math.sin(prev.angle) * centerDist;
      preservedPositions.set(nodeId, {
        x: labelCenterX - prev.width / 2,
        y: labelCenterY - prev.height / 2,
        width: prev.width,
        height: prev.height,
      });
    }
    if (preservedPositions.size === 0) preservedPositions = null;
  }

  const { labels, links } = calculateLabelPositions(
    nodesWithLabels,
    width,
    height,
    {
      fontFamily: labelFontFamily,
      fontSize: globalOuter?.fontSize ?? labelMinFontSize,
      minRadius: 2,
      labelPadding: globalLabelPadding,
      linkPadding: globalLinkPadding,
      linkLength: globalLinkLength,
      allNodes: renderedNodes,
      preservedPositions,
    },
  );

  // Save label positions as angle + edge distance for the next frame.
  // angle: direction from anchor center to label center
  // edgeDist: distance from circle perimeter to label center
  // This representation is zoom-invariant because it does not bake in the
  // current radius — on restoration we use the (potentially different) radius.
  _previousLabelPositions = new Map();
  const anchorLookup = new Map();
  for (const nd of nodesWithLabels) {
    anchorLookup.set(nd.node.id, nd);
  }
  for (const lbl of labels) {
    const nd = anchorLookup.get(lbl.nodeId);
    if (!nd) continue;
    const labelCenterX = lbl.x + lbl.width / 2;
    const labelCenterY = lbl.y + lbl.height / 2;
    const dx = labelCenterX - nd.x;
    const dy = labelCenterY - nd.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    _previousLabelPositions.set(lbl.nodeId, {
      angle,
      edgeDist: dist - nd.radius,
      width: lbl.width,
      height: lbl.height,
      isInside: lbl.isInside,
    });
  }

  const result = {
    labels,
    links,
    nodesWithLabels,
    labelMinFontSize,
    labelMaxFontSize,
  };

  _labelLayoutCache = result;
  _labelCacheKey = cacheKey;

  return result;
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
 * @param {number} [numLabels=20]
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
  numLabels = 20,
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
    // Build the set of highlighted node IDs including the hovered node
    let connectorHighlightIds = null;
    if (hoveredNodeId) {
      connectorHighlightIds = new Set();
      connectorHighlightIds.add(hoveredNodeId);
      if (highlightedNodeIds) {
        const ids = Array.isArray(highlightedNodeIds)
          ? highlightedNodeIds
          : highlightedNodeIds;
        for (const id of ids) {
          connectorHighlightIds.add(id);
        }
      }
    }

    drawLabelConnectors(
      ctx,
      links,
      mergedStyle,
      nodesWithLabels,
      depthStyleCache,
      negativeDepthNodes,
      connectorHighlightIds,
    );
  }

  for (const labelData of labels) {
    const nodeData = nodesWithLabels.find(
      (n) => n.node.id === labelData.nodeId,
    );
    if (!nodeData) continue;

    const { node } = nodeData;
    const isHighlighted =
      hoveredNodeId === node.id ||
      highlightedContains(highlightedNodeIds, node.id);

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
