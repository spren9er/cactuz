/**
 * Label drawing utilities for CactusTree component (refactored)
 * - Uses nested label styles: mergedStyle.label.{textColor,textOpacity,fontFamily,minFontSize,maxFontSize,padding,link:{strokeColor,strokeOpacity,strokeWidth,padding,length}}
 */

import { setCanvasStyles } from './canvasUtils.js';
import { calculateLabelPositions } from './labelPositions.js';

/**
 * Resolve label style for a node (consider per-depth override first, negative depth mapping, then global)
 * @param {number} depth
 * @param {string} nodeId
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 * @returns {{ textColor?: string, textOpacity?: number, fontFamily?: string, minFontSize?: number, maxFontSize?: number, fontWeight?: string, padding?: number, link?: any }}
 */
export function getLabelStyle(
  depth,
  nodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  // find depth style (exact depth or negative-depth membership)
  let depthStyle = null;
  if (depthStyleCache && depthStyleCache.has(depth)) {
    depthStyle = depthStyleCache.get(depth);
  } else if (mergedStyle?.depths) {
    for (const ds of mergedStyle.depths) {
      if (ds.depth === depth) {
        depthStyle = ds;
        break;
      } else if (ds.depth < 0) {
        // negative depth convention: ds.depth === -1 etc -> check mapping
        const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
        if (nodesAtThisNegativeDepth && nodesAtThisNegativeDepth.has(nodeId)) {
          depthStyle = ds;
          break;
        }
      }
    }
  }

  const globalLabel = mergedStyle?.label ?? {};

  // Pull label properties from depth label group if present, else global label group
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
  const padding = labelFromDepth?.padding ?? globalLabel?.padding ?? 1;

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

  return {
    textColor,
    textOpacity,
    fontFamily,
    minFontSize,
    maxFontSize,
    fontWeight,
    padding,
    link,
  };
}

/**
 * Whether a leaf node's label should be shown (consider edge-bundling hover behavior)
 * @param {string} nodeId
 * @param {Set<string>} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any[] | Set<string>} visibleNodeIds
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

  // When hovering over leaf nodes, show visible nodes
  const isHoveringLeafNode =
    hoveredNodeId !== null && leafNodes.has(hoveredNodeId);

  if (isHoveringLeafNode) {
    return Array.isArray(visibleNodeIds)
      ? visibleNodeIds.includes(nodeId)
      : visibleNodeIds.has(nodeId);
  }

  return true;
}

/**
 * Choose font size based on radius and whether it's a leaf label.
 * Uses min/max font sizes from label config.
 * @param {number} radius
 * @param {boolean} isLeafLabel
 * @param {number} minFontSize
 * @param {number} maxFontSize
 * @returns {number}
 */
export function calculateFontSize(
  radius,
  isLeafLabel = false,
  minFontSize = 8,
  maxFontSize = 14,
) {
  if (isLeafLabel) {
    return Math.max(minFontSize, Math.min(maxFontSize, radius * 0.3));
  } else {
    return Math.min(maxFontSize, Math.max(minFontSize, radius / 3));
  }
}

/**
 * Truncate text to fit within max width using measured text width.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
export function truncateText(ctx, text, maxWidth) {
  if (!ctx) return text;

  const textWidth = ctx.measureText(text).width;
  if (textWidth <= maxWidth || text.length <= 3) {
    return text;
  }

  const ratio = maxWidth / textWidth;
  const truncateLength = Math.floor(text.length * ratio);
  return text.substring(0, Math.max(1, truncateLength - 3)) + '…';
}

/**
 * Draw centered text inside a circle
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {Object} labelStyle
 * @param {number} minFontSize
 * @param {number} maxFontSize
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
) {
  if (!ctx || !text) return;

  const fontSize = calculateFontSize(radius, false, minFontSize, maxFontSize);

  // Build font string including optional fontWeight
  const fontWeightPrefix = /** @type {any} */ (labelStyle)?.fontWeight
    ? `${/** @type {any} */ (labelStyle).fontWeight} `
    : '';
  setCanvasStyles(ctx, {
    fillStyle: /** @type {any} */ (labelStyle).textColor,
    globalAlpha: /** @type {any} */ (labelStyle).textOpacity ?? 1,
    font: `${fontWeightPrefix}${fontSize}px ${/** @type {any} */ (labelStyle).fontFamily}`,
    textAlign: 'center',
    textBaseline: 'middle',
  });

  const maxWidth = radius * 1.8;
  const displayText = truncateText(ctx, text, maxWidth);

  ctx.fillText(displayText, x, y);
}

/**
 * Basic eligibility for showing a label for a node (non-leaf)
 * @param {any} node
 * @param {number} radius
 * @param {string} nodeId
 * @param {Set<string>} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any[]|Set<string>} visibleNodeIds
 * @param {Object} labelStyle
 * @returns {boolean}
 */
export function shouldShowLabel(
  node,
  radius,
  nodeId,
  leafNodes,
  hoveredNodeId,
  visibleNodeIds,
  labelStyle,
) {
  // Skip labels for nodes with screen radius less than 1px for performance
  if (radius < 1) return false;

  const isActualLeaf = leafNodes.has(nodeId);

  if (isActualLeaf) {
    return shouldShowLeafLabel(
      nodeId,
      leafNodes,
      hoveredNodeId,
      visibleNodeIds,
    );
  } else {
    // If textColor is not set or explicitly none/transparent -> don't show
    const col = /** @type {any} */ (labelStyle).textColor;
    return col !== undefined && col !== 'none' && col !== 'transparent';
  }
}

/**
 * Draw connectors (leader lines) between node anchor and outside label positions
 * Uses depth-based/per-node label.link styles when available.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<any>} links - calculated link segments with x1,y1,x2,y2,nodeId
 * @param {any} mergedStyle
 * @param {Array<any>} nodesWithLabels - the nodes that were passed to the positioner (contains node & depth)
 * @param {Map<number, any>} depthStyleCache - optional cache used by getLabelStyle
 * @param {Map<number, Set<string>>} negativeDepthNodes - optional mapping for negative depth styles
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

  // Draw each link using node-level -> depth-level -> global link style precedence.
  // Draw each link using resolved per-node linkStyle (attached to nodeData) when available,
  // otherwise fall back to depth/global merge.
  links.forEach((linkSeg) => {
    // Resolve per-node / depth / global style chain
    const nodeId = linkSeg.nodeId;
    const globalLabel = mergedStyle?.label ?? {};
    const globalLink = globalLabel.link ?? {};

    // Try to find the node data for this link (nodesWithLabels contains the rendered nodeData)
    const nodeData =
      nodesWithLabels &&
      nodesWithLabels.find((n) => n && n.node && n.node.id === nodeId);

    // If a resolved linkStyle was attached earlier to nodeData, prefer it.
    let linkStyle = null;
    if (nodeData && nodeData.linkStyle) {
      linkStyle = nodeData.linkStyle;
    } else {
      // Depth-derived link style (if any)
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

      // Node-level link style (explicit node.label.link on the node object)
      const nodeLink =
        nodeData &&
        nodeData.node &&
        nodeData.node.label &&
        nodeData.node.label.link
          ? nodeData.node.label.link
          : {};

      // Merge styles with precedence: global <- depth <- node (node overrides depth and global)
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

    // Apply styles and draw this connector
    setCanvasStyles(ctx, {
      strokeStyle: color,
      lineWidth: width,
      globalAlpha: alpha,
    });

    ctx.beginPath();
    ctx.moveTo(linkSeg.x1, linkSeg.y1);
    ctx.lineTo(linkSeg.x2, linkSeg.y2);
    ctx.stroke();
    // Reset alpha if changed (do per-link to be safe)
    if (ctx.globalAlpha !== 1.0) ctx.globalAlpha = 1.0;
  });
}

/**
 * Draw a single outside positioned label (with optional connector)
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} labelData - { nodeId, x, y, width, height, isInside }
 * @param {any} nodeData - full nodeData from layout (includes node, x, y, radius, depth)
 * @param {Set<string>} leafNodes
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
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

  const labelStyle = getLabelStyle(
    depth,
    nodeId,
    mergedStyle,
    depthStyleCache,
    negativeDepthNodes,
  );

  // Use labelMinFontSize for outside labels (consistent with previous behavior)
  const fontSize = labelStyle.minFontSize ?? 8;
  const { isInside } = labelData;

  // Build font string including optional fontWeight
  const fontWeightPrefix = /** @type {any} */ (labelStyle)?.fontWeight
    ? `${/** @type {any} */ (labelStyle).fontWeight} `
    : '';

  setCanvasStyles(ctx, {
    fillStyle: /** @type {any} */ (labelStyle).textColor,
    globalAlpha: /** @type {any} */ (labelStyle).textOpacity ?? 1,
    font: `${fontWeightPrefix}${fontSize}px ${/** @type {any} */ (labelStyle).fontFamily}`,
    textAlign: isInside ? 'center' : 'left',
    textBaseline: isInside ? 'middle' : 'top',
  });

  if (isInside) {
    // centered inside
    ctx.fillText(text, x + labelData.width / 2, y + labelData.height / 2);
  } else {
    const labelPadding = /** @type {any} */ (labelStyle).padding ?? 2;
    ctx.fillText(text, x + labelPadding, y + labelPadding);
  }

  // Reset alpha if changed
  if (ctx.globalAlpha !== 1.0) ctx.globalAlpha = 1.0;
}

/**
 * Draw labels for visible/rendered nodes
 * @param {CanvasRenderingContext2D} ctx
 * @param {any[]} renderedNodes
 * @param {Set<string>} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any[]|Set<string>} visibleNodeIds
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {Map<number, Set<string>>} negativeDepthNodes
 * @param {number} numLabels
 * @param {number} panX
 * @param {number} panY
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

  // helper to check viewport intersection
  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = ctx.canvas.width / devicePixelRatio;
  const height = ctx.canvas.height / devicePixelRatio;

  // helper to check viewport intersection
  /** @param {any} nodeData */
  const isInViewport = (nodeData) => {
    const { x, y, radius } = /** @type {any} */ (nodeData);
    const screenX = x + panX;
    const screenY = y + panY;
    return (
      screenX + radius >= 0 &&
      screenX - radius <= width &&
      screenY + radius >= 0 &&
      screenY - radius <= height
    );
  };

  const nodesInViewport = renderedNodes.filter(isInViewport);

  // filter by basic label eligibility
  /** @param {any} nodeData */
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
      // Normalize to shape used by shouldShowLabel
      { textColor: /** @type {any} */ (labelStyle).textColor },
    );
  });

  // Determine nodes to show labels for (hover vs normal)
  let nodesWithLabels;

  const isHoveringLeafNode =
    hoveredNodeId !== null && leafNodes.has(hoveredNodeId);

  if (isHoveringLeafNode) {
    // show labels for connected and inside-fitting labels
    /** @param {any} nodeData */
    nodesWithLabels = eligibleNodes.filter((nodeData) => {
      const nodeId = nodeData.node.id;
      const isActualLeaf = leafNodes.has(nodeId);
      const { radius, node } = nodeData;

      // measure if inside label fits
      const text = String(node.name || node.id);
      const textWidth = ctx.measureText(text).width + 8;
      const textHeight = 12 + 4;
      const diagonal = Math.sqrt(
        textWidth * textWidth + textHeight * textHeight,
      );
      const fitsInside = diagonal <= 2 * radius * 0.9;

      if (fitsInside) return true;

      if (isActualLeaf) {
        return Array.isArray(visibleNodeIds)
          ? visibleNodeIds.includes(nodeId)
          : visibleNodeIds.has(nodeId);
      } else {
        return Array.isArray(visibleNodeIds)
          ? visibleNodeIds.includes(nodeId)
          : visibleNodeIds.has(nodeId);
      }
    });
  } else if ((numLabels ?? 30) === 0) {
    nodesWithLabels = [];
  } else {
    const sortedByRadius = eligibleNodes.sort((a, b) => b.radius - a.radius);
    nodesWithLabels = sortedByRadius.slice(0, numLabels ?? 30);
  }

  if (!nodesWithLabels || nodesWithLabels.length === 0) return;

  // prepare calculateLabelPositions options from new nested label style
  const globalLabel = mergedStyle?.label ?? {};
  const labelFontFamily = globalLabel.fontFamily ?? 'monospace';
  const labelMinFontSize = globalLabel.minFontSize ?? 8;
  const labelMaxFontSize = globalLabel.maxFontSize ?? 14;
  const globalLabelPadding = globalLabel.padding ?? 1;
  const globalLinkPadding = (globalLabel.link && globalLabel.link.padding) ?? 0;
  const globalLinkLength = (globalLabel.link && globalLabel.link.length) ?? 5;

  // Attach depth-based / per-node label padding and link settings onto node objects
  // so the positioning code can consume per-node values (depth-based overrides)
  nodesWithLabels.forEach((nodeData) => {
    const node = nodeData.node;
    const depth = nodeData.depth;
    // Resolve depth-based label style for this node
    const perNodeStyle = getLabelStyle(
      depth,
      node.id,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
    );

    // Ensure node.label exists and populate padding
    node.label = node.label ?? {};
    node.label.padding =
      perNodeStyle?.padding ??
      (typeof node.label.padding === 'number'
        ? node.label.padding
        : undefined) ??
      globalLabelPadding;

    // Ensure node.label.link exists and populate link paddings/lengths
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

    // Also attach flat properties used by the label positioner for convenience
    nodeData.labelPadding = node.label.padding;
    nodeData.linkPadding = node.label.link.padding;
    nodeData.linkLength = node.label.link.length;

    // Compute and attach a resolved per-node link style object using precedence:
    // global <- depth <- node (node-level overrides depth and global).
    const globalLink = mergedStyle?.label?.link ?? {};
    const depthLink = perNodeStyle?.link ?? {};
    const nodeLink = node.label && node.label.link ? node.label.link : {};
    nodeData.linkStyle = {
      ...(globalLink || {}),
      ...(depthLink || {}),
      ...(nodeLink || {}),
    };
  });

  // build inputs for positioning algorithm (global defaults are still passed)
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

  // draw connectors first (behind labels)
  if (links && links.length > 0) {
    // Pass the nodesWithLabels and depth maps so connectors use depth-based/per-node link styles
    drawLabelConnectors(
      ctx,
      links,
      mergedStyle,
      nodesWithLabels,
      depthStyleCache,
      negativeDepthNodes,
    );
  }

  // draw labels
  /** @param {any} labelData */
  labels.forEach((labelData) => {
    const nodeData = /** @type {any} */ (
      nodesWithLabels.find(
        (/** @type {any} */ n) => n.node.id === labelData.nodeId,
      )
    );
    if (!nodeData) return;

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
      drawCenteredLabel(
        ctx,
        text,
        nodeData.x,
        nodeData.y,
        radius,
        labelStyle,
        minFS,
        maxFS,
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
  });
}
