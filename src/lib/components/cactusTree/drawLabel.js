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
import { resolveDepthStyle } from './drawNode.js';
import { calculateLabelPositions } from './labelPositions.js';

// Label layout cache — avoids expensive simulated annealing on every frame
/** @type {any} */
let _labelLayoutCache = null;
/** @type {string|null} */
let _labelCacheKey = null;

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

  const textColor =
    depthInner?.textColor ??
    depthOuter?.textColor ??
    depthInner?.strokeColor ??
    depthOuter?.strokeColor ??
    globalInner?.textColor ??
    globalOuter?.textColor ??
    globalInner?.strokeColor ??
    globalOuter?.strokeColor ??
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

  const outerFontSize =
    depthOuter?.fontSize ?? globalOuter?.fontSize ?? globalLabel?.fontSize;

  const padding =
    depthOuter?.padding ?? globalOuter?.padding ?? globalLabel?.padding ?? 4;
  const insideFitFactor =
    depthInner?.insideFitFactor ??
    globalInner?.insideFitFactor ??
    globalLabel?.insideFitFactor ??
    0.9;

  const linkFromDepth = depthOuter?.link ?? labelFromDepth?.link ?? null;
  const globalLink = globalOuter?.link ?? globalLabel?.link ?? {};

  const depthStrokeShorthand =
    depthInner?.strokeColor ?? depthOuter?.strokeColor ?? null;
  const globalStrokeShorthand =
    globalInner?.strokeColor ?? globalOuter?.strokeColor ?? null;

  const link = {
    strokeColor:
      linkFromDepth?.strokeColor ??
      depthStrokeShorthand ??
      globalLink?.strokeColor ??
      globalStrokeShorthand ??
      '#333333',
    strokeOpacity:
      linkFromDepth?.strokeOpacity ?? globalLink?.strokeOpacity ?? 1.0,
    strokeWidth: linkFromDepth?.strokeWidth ?? globalLink?.strokeWidth ?? 0.5,
    padding: linkFromDepth?.padding ?? globalLink?.padding ?? 0,
    length: linkFromDepth?.length ?? globalLink?.length ?? 5,
  };

  const depthLabelHighlight = {};
  const innerFromLabel = labelFromDepth?.inner?.highlight ?? null;
  const innerFromDepthHighlight = depthStyle?.highlight?.label?.inner ?? null;
  const innerLegacy = labelFromDepth?.highlight ?? null;
  const innerRaw =
    innerFromLabel ?? innerFromDepthHighlight ?? innerLegacy ?? null;
  if (innerRaw) {
    depthLabelHighlight.inner = {
      textColor: innerRaw?.textColor ?? innerRaw?.strokeColor,
      textOpacity: innerRaw?.textOpacity,
      fontWeight: innerRaw?.fontWeight,
    };
  }
  const outerFromLabel = labelFromDepth?.outer?.highlight ?? null;
  const outerFromDepthHighlight = depthStyle?.highlight?.label?.outer ?? null;
  const outerRaw = outerFromLabel ?? outerFromDepthHighlight ?? null;
  if (outerRaw) {
    depthLabelHighlight.outer = {
      textColor: outerRaw?.textColor ?? outerRaw?.strokeColor,
      textOpacity: outerRaw?.textOpacity,
      fontWeight: outerRaw?.fontWeight,
    };
  }

  return {
    textColor,
    textOpacity,
    fontFamily,
    fontWeight,
    padding,
    link,
    highlight: Object.keys(depthLabelHighlight).length
      ? depthLabelHighlight
      : undefined,
    insideFitFactor,
    inner: {
      minFontSize: innerMinFontSize,
      maxFontSize: innerMaxFontSize,
    },
    outer: {
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
  const hHasDepth = h && /** @type {any} */ (h).__hasDepthHighlight;
  const hFlat =
    highlightActive &&
    h &&
    hHasDepth &&
    (h.textColor !== undefined ||
      /** @type {any} */ (h).strokeColor !== undefined ||
      h.textOpacity !== undefined ||
      h.fontWeight !== undefined)
      ? h
      : null;
  const hInner =
    highlightActive && h && /** @type {any} */ (h).__hasDepthHighlight
      ? (h.inner ?? null)
      : null;
  const fillColor =
    hFlat && hFlat.textColor !== undefined
      ? hFlat.textColor
      : hFlat && /** @type {any} */ (hFlat).strokeColor !== undefined
        ? /** @type {any} */ (hFlat).strokeColor
        : hInner && hInner.textColor !== undefined
          ? hInner.textColor
          : (ls.inner?.textColor ?? ls.textColor);
  const alpha =
    hFlat && hFlat.textOpacity !== undefined
      ? hFlat.textOpacity
      : hInner && hInner.textOpacity !== undefined
        ? hInner.textOpacity
        : (ls.inner?.textOpacity ?? ls.textOpacity ?? 1);
  const fontWeightPrefix =
    hFlat && hFlat.fontWeight
      ? `${hFlat.fontWeight} `
      : hInner && hInner.fontWeight
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
 * @param {string|null|undefined} hoveredNodeId
 * @param {Array<string>|Set<string>|null|undefined} highlightedNodeIds
 * @returns {void}
 */
export function drawLabelConnectors(
  ctx,
  links,
  mergedStyle,
  nodesWithLabels = [],
  depthStyleCache = new Map(),
  negativeDepthNodes = new Map(),
  hoveredNodeId,
  highlightedNodeIds,
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
        depthLink = (labelStyle && labelStyle.link) || {};
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

      const isHighlighted =
        (hoveredNodeId ?? undefined) === nodeId ||
        highlightedContains(highlightedNodeIds, nodeId);

      if (isHighlighted) {
        const globalHighlightLink =
          mergedStyle?.highlight?.label?.outer?.link ??
          mergedStyle?.highlight?.label?.link ??
          {};

        let depthStyle = null;
        if (
          depthStyleCache &&
          nodeData &&
          depthStyleCache.has(nodeData.depth)
        ) {
          depthStyle = depthStyleCache.get(nodeData.depth);
        } else if (mergedStyle?.depths && nodeData) {
          for (const ds of mergedStyle.depths) {
            if (ds.depth === nodeData.depth) {
              depthStyle = ds;
              break;
            } else if (ds.depth < 0) {
              const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
              if (
                nodesAtThisNegativeDepth &&
                nodesAtThisNegativeDepth.has(nodeId)
              ) {
                depthStyle = ds;
                break;
              }
            }
          }
        }

        const depthHighlightLink =
          depthStyle?.highlight?.label?.outer?.link ??
          depthStyle?.highlight?.label?.link ??
          depthStyle?.label?.highlight?.link ??
          {};

        linkStyle = {
          ...(linkStyle || {}),
          ...(depthHighlightLink || {}),
          ...(globalHighlightLink || {}),
        };
      }

      let highlightStrokeOrText = undefined;
      if (nodeData && nodeData.highlightStyle) {
        const hs = nodeData.highlightStyle;
        highlightStrokeOrText =
          (hs.outer && (hs.outer.textColor ?? hs.outer.strokeColor)) ??
          hs.textColor ??
          hs.strokeColor;
      }
      const color =
        linkStyle.strokeColor ??
        highlightStrokeOrText ??
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
  const fontSize = labelStyle.outer?.fontSize ?? 8;

  const nodeHighlight =
    highlightActive && nodeData && nodeData.highlightStyle
      ? nodeData.highlightStyle
      : null;

  const nhOuter = nodeHighlight ? (nodeHighlight.outer ?? nodeHighlight) : null;
  const nhInner = nodeHighlight ? (nodeHighlight.inner ?? nodeHighlight) : null;

  const resolvedTextColor = labelData.isInside
    ? (nhInner?.textColor ??
      nhInner?.strokeColor ??
      (labelStyle.inner && labelStyle.inner.textColor !== undefined
        ? labelStyle.inner.textColor
        : labelStyle.textColor !== undefined
          ? labelStyle.textColor
          : '#333333'))
    : (nhOuter?.textColor ??
      nhOuter?.strokeColor ??
      (labelStyle.outer && labelStyle.outer.textColor !== undefined
        ? labelStyle.outer.textColor
        : labelStyle.textColor !== undefined
          ? labelStyle.textColor
          : '#333333'));

  const resolvedTextOpacity = labelData.isInside
    ? (nhInner?.textOpacity ??
      (labelStyle.inner && labelStyle.inner.textOpacity !== undefined
        ? labelStyle.inner.textOpacity
        : labelStyle.textOpacity !== undefined
          ? labelStyle.textOpacity
          : 1))
    : (nhOuter?.textOpacity ??
      (labelStyle.outer && labelStyle.outer.textOpacity !== undefined
        ? labelStyle.outer.textOpacity
        : labelStyle.textOpacity !== undefined
          ? labelStyle.textOpacity
          : 1));

  const resolvedFontWeight = labelData.isInside
    ? (nhInner?.fontWeight ??
      (labelStyle.inner && labelStyle.inner.fontWeight !== undefined
        ? labelStyle.inner.fontWeight
        : labelStyle.fontWeight))
    : (nhOuter?.fontWeight ??
      (labelStyle.outer && labelStyle.outer.fontWeight !== undefined
        ? labelStyle.outer.fontWeight
        : labelStyle.fontWeight));

  const fontWeightPrefix = resolvedFontWeight ? `${resolvedFontWeight} ` : '';

  const fontFamily = labelData.isInside
    ? ((labelStyle.inner && labelStyle.inner.fontFamily) ??
      labelStyle.fontFamily ??
      'monospace')
    : ((labelStyle.outer && labelStyle.outer.fontFamily) ??
      labelStyle.fontFamily ??
      'monospace');

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
      { textColor: labelStyle.outer?.textColor ?? labelStyle.textColor },
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

    const nodeIsHighlighted =
      (typeof hoveredNodeId !== 'undefined' &&
        hoveredNodeId !== null &&
        node.id === hoveredNodeId) ||
      highlightedContains(highlightedNodeIds, node.id);

    if (nodeIsHighlighted) {
      const globalHighlightLink =
        mergedStyle?.highlight?.label?.outer?.link ??
        mergedStyle?.highlight?.label?.link ??
        {};

      let depthStyleObj = null;
      if (depthStyleCache && depthStyleCache.has(depth)) {
        depthStyleObj = depthStyleCache.get(depth);
      } else if (mergedStyle?.depths) {
        for (const ds of mergedStyle.depths) {
          if (ds.depth === depth) {
            depthStyleObj = ds;
            break;
          } else if (ds.depth < 0) {
            const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
            if (
              nodesAtThisNegativeDepth &&
              nodesAtThisNegativeDepth.has(node.id)
            ) {
              depthStyleObj = ds;
              break;
            }
          }
        }
      }

      const depthHighlightLink =
        depthStyleObj?.highlight?.label?.outer?.link ??
        depthStyleObj?.highlight?.label?.link ??
        depthStyleObj?.label?.highlight?.link ??
        {};

      node.label.link.padding =
        depthHighlightLink?.padding ??
        globalHighlightLink?.padding ??
        node.label.link.padding;
      node.label.link.length =
        depthHighlightLink?.length ??
        globalHighlightLink?.length ??
        node.label.link.length;

      nodeData.linkPadding = node.label.link.padding;
      nodeData.linkLength = node.label.link.length;
    }

    const globalLink =
      mergedStyle?.label?.outer?.link ?? mergedStyle?.label?.link ?? {};
    const depthLink = perNodeStyle?.link ?? {};
    const nodeLink = node.label && node.label.link ? node.label.link : {};
    nodeData.linkStyle = {
      ...(globalLink || {}),
      ...(depthLink || {}),
      ...(nodeLink || {}),
    };

    const globalHighlight = mergedStyle?.highlight?.label ?? {};
    const depthHighlight = perNodeStyle?.highlight ?? {};
    const baseHighlightMerged = {
      ...(globalHighlight || {}),
      ...(depthHighlight || {}),
    };
    const hasDepthHighlight =
      depthHighlight && Object.keys(depthHighlight).length > 0;
    nodeData.highlightStyle = {
      ...baseHighlightMerged,
      __hasDepthHighlight: hasDepthHighlight,
    };
  });

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
    },
  );

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
    drawLabelConnectors(
      ctx,
      links,
      mergedStyle,
      nodesWithLabels,
      depthStyleCache,
      negativeDepthNodes,
      hoveredNodeId,
      highlightedNodeIds,
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
