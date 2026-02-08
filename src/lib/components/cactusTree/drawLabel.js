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
 */

/**
 * @typedef {Object} LabelStyle
 * @property {string} [textColor]
 * @property {number} [textOpacity]
 * @property {string} [fontFamily]
 * @property {number} [minFontSize]
 * @property {number} [maxFontSize]
 * @property {string} [fontWeight]
 * @property {number} [padding]
 * @property {LabelLinkStyle} [link]
 * @property {HighlightStyle} [highlight]
 * @property {number} [insideFitFactor]
 * @property {number} [estimatedCharWidth]
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

  const globalLabel = mergedStyle?.label ?? {};
  const labelFromDepth = depthStyle?.label ?? null;

  const textColor =
    labelFromDepth?.textColor ?? globalLabel?.textColor ?? '#333333';
  const textOpacity =
    labelFromDepth?.textOpacity ?? globalLabel?.textOpacity ?? 1.0;
  const fontFamily =
    labelFromDepth?.fontFamily ?? globalLabel?.fontFamily ?? 'monospace';
  const minFontSize =
    labelFromDepth?.minFontSize ?? globalLabel?.minFontSize ?? 8;
  const maxFontSize =
    labelFromDepth?.maxFontSize ?? globalLabel?.maxFontSize ?? 14;
  const fontWeight = labelFromDepth?.fontWeight ?? globalLabel?.fontWeight;
  const padding = labelFromDepth?.padding ?? globalLabel?.padding ?? 4;
  const insideFitFactor =
    labelFromDepth?.insideFitFactor ?? globalLabel?.insideFitFactor ?? 0.9;

  const linkFromDepth = labelFromDepth?.link ?? null;
  const globalLink = globalLabel?.link ?? {};

  const link = {
    strokeColor:
      linkFromDepth?.strokeColor ?? globalLink?.strokeColor ?? '#333333',
    strokeOpacity:
      linkFromDepth?.strokeOpacity ?? globalLink?.strokeOpacity ?? 1.0,
    strokeWidth: linkFromDepth?.strokeWidth ?? globalLink?.strokeWidth ?? 0.5,
    padding: linkFromDepth?.padding ?? globalLink?.padding ?? 0,
    length: linkFromDepth?.length ?? globalLink?.length ?? 5,
  };

  const highlightFromDepth = labelFromDepth?.highlight ?? null;
  const globalHighlight = globalLabel?.highlight ?? {};
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

  return {
    textColor,
    textOpacity,
    fontFamily,
    minFontSize,
    maxFontSize,
    fontWeight,
    padding,
    link,
    highlight,
    insideFitFactor,
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
    // When hovering a leaf, only show leaf labels that are part of visibleNodeIds
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
  return Math.min(maxFontSize, Math.max(minFontSize, radius * 0.2));
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
 * Draw centered text inside a circle
 *
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
  const fillColor =
    highlightActive && h && h.textColor !== undefined
      ? h.textColor
      : ls.textColor;
  const alpha =
    highlightActive && h && h.textOpacity !== undefined
      ? h.textOpacity
      : (ls.textOpacity ?? 1);
  const fontWeightPrefix =
    highlightActive && h && h.fontWeight
      ? `${h.fontWeight} `
      : ls.fontWeight
        ? `${ls.fontWeight} `
        : '';

  const fontFamily = ls.fontFamily ?? 'monospace';
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
      const globalLink = globalLabel.link ?? {};

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

      const color = linkStyle.strokeColor ?? globalLabel.textColor ?? '#333333';
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
  const fontSize = labelStyle.minFontSize ?? 8;
  const fontWeightPrefix = labelStyle.fontWeight
    ? `${labelStyle.fontWeight} `
    : '';
  const fontFamily = labelStyle.fontFamily ?? 'monospace';

  setCanvasStyles(ctx, {
    fillStyle: labelStyle.textColor,
    globalAlpha: labelStyle.textOpacity ?? 1,
    font: `${fontWeightPrefix}${fontSize}px ${fontFamily}`,
    textAlign: labelData.isInside ? 'center' : 'left',
    textBaseline: labelData.isInside ? 'middle' : 'top',
  });

  if (labelData.isInside) {
    ctx.fillText(text, x + labelData.width / 2, y + labelData.height / 2);
  } else {
    const labelPadding =
      typeof labelStyle.padding === 'number' ? labelStyle.padding : 4;
    ctx.fillText(text, x + labelPadding, y + labelPadding);
  }

  if (ctx.globalAlpha !== 1.0) ctx.globalAlpha = 1.0;
}

/**
 * Compute label layout (labels + connector segments + nodesWithLabels) but do not draw anything.
 *
 * Behavior changes applied:
 * - If numLabels === 0 -> no labels (return null)
 * - When hovered (hoveredNodeId !== null): only consider nodes that are in visibleNodeIds
 *   and limit total shown to numLabels largest nodes. Do NOT special-case inside-fitting labels.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {any[]} renderedNodes
 * @param {Set<string>} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any[]|Set<string>} visibleNodeIds
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
  visibleNodeIds,
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
    return shouldShowLabel(
      node,
      radius,
      nodeId,
      leafNodes,
      hoveredNodeId,
      visibleNodeIds,
      { textColor: labelStyle.textColor },
    );
  });

  // If numLabels == 0, show no labels at all
  const labelLimit = Number(numLabels ?? 30);
  if (labelLimit === 0) return null;

  // Determine nodes to show labels for (hover vs normal)
  let nodesWithLabels;

  // When any node is hovered, restrict to nodes that are associated via visibleNodeIds.
  // Limit total to labelLimit largest by radius. Do NOT automatically include
  // nodes because they fit inside when hovering.
  if (hoveredNodeId !== null) {
    const visibleSet = Array.isArray(visibleNodeIds)
      ? new Set(visibleNodeIds)
      : visibleNodeIds || new Set();

    const connectedCandidates = eligibleNodes.filter((nd) =>
      visibleSet.has(nd.node.id),
    );

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
  const labelFontFamily = globalLabel.fontFamily ?? 'monospace';
  const labelMinFontSize = globalLabel.minFontSize ?? 8;
  const labelMaxFontSize = globalLabel.maxFontSize ?? 14;
  const globalLabelPadding = globalLabel.padding ?? 4;
  const globalLinkPadding =
    globalLabel.link && typeof globalLabel.link.padding === 'number'
      ? globalLabel.link.padding
      : 0;
  const globalLinkLength =
    globalLabel.link && typeof globalLabel.link.length === 'number'
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

    const globalLink = mergedStyle?.label?.link ?? {};
    const depthLink = perNodeStyle?.link ?? {};
    const nodeLink = node.label && node.label.link ? node.label.link : {};
    nodeData.linkStyle = {
      ...(globalLink || {}),
      ...(depthLink || {}),
      ...(nodeLink || {}),
    };

    const globalHighlight = mergedStyle?.label?.highlight ?? {};
    const depthHighlight = perNodeStyle?.highlight ?? {};
    const nodeHighlight =
      node.label && node.label.highlight ? node.label.highlight : {};
    nodeData.highlightStyle = {
      ...(globalHighlight || {}),
      ...(depthHighlight || {}),
      ...(nodeHighlight || {}),
    };
  });

  const { labels, links } = calculateLabelPositions(
    nodesWithLabels,
    width,
    height,
    {
      fontFamily: labelFontFamily,
      fontSize: labelMinFontSize,
      minRadius: 2,
      labelPadding: globalLabelPadding,
      linkPadding: globalLinkPadding,
      linkLength: globalLinkLength,
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
 * @param {any[]|Set<string>} visibleNodeIds
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
  visibleNodeIds,
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
    visibleNodeIds,
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

    if (labelData.isInside) {
      const { node, depth, radius } = nodeData;
      const labelStyle = getLabelStyle(
        depth,
        node.id,
        mergedStyle,
        depthStyleCache,
        negativeDepthNodes,
      );
      const text = String(node.name || node.id);
      const minFS = labelStyle.minFontSize ?? labelMinFontSize;
      const maxFS = labelStyle.maxFontSize ?? labelMaxFontSize;
      const isHighlighted = hoveredNodeId !== null && hoveredNodeId === node.id;
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
        nodeData.highlightStyle,
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
      );
    }
  }
}
