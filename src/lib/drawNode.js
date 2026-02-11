/**
 * Node drawing utilities for CactusTree
 */

import { setCanvasStyles } from './canvasUtils.js';

/**
 * Safely reads a nested style property with depth override fallback.
 * @param {any|null} depthStyle - depth-specific style object (may contain groups like .node, .highlight)
 * @param {any} mergedStyle - global merged styles object (may contain groups like .node, .highlight)
 * @param {string} group - top-level group name (e.g., 'node', 'highlight')
 * @param {string} prop - property name inside the group (e.g., 'fillColor')
 * @param {*} defaultValue - fallback default if neither depth nor global has the property
 * @returns {*} The resolved value (depth override > global > default)
 */
export function readStyleProp(
  depthStyle,
  mergedStyle,
  group,
  prop,
  defaultValue = undefined,
) {
  if (
    depthStyle &&
    depthStyle[group] &&
    depthStyle[group][prop] !== undefined
  ) {
    return depthStyle[group][prop];
  }
  if (
    mergedStyle &&
    mergedStyle[group] &&
    mergedStyle[group][prop] !== undefined
  ) {
    return mergedStyle[group][prop];
  }
  return defaultValue;
}

/**
 * Safely reads a nested style property for a two-level group (e.g. `node.highlight.fillColor`)
 * with depth override fallback.
 * @param {any|null} depthStyle - depth-specific style object (may contain groups like .node)
 * @param {any} mergedStyle - global merged styles object (may contain groups like .node)
 * @param {string} outerGroup - top-level group name (e.g., 'node')
 * @param {string} innerGroup - nested group name (e.g., 'highlight')
 * @param {string} prop - property name inside the inner group (e.g., 'fillColor')
 * @param {*} defaultValue - fallback default if neither depth nor global has the property
 * @returns {*} The resolved value (depth override > global > default)
 */
export function readNestedStyleProp(
  depthStyle,
  mergedStyle,
  outerGroup,
  innerGroup,
  prop,
  defaultValue = undefined,
) {
  if (
    depthStyle &&
    depthStyle[outerGroup] &&
    depthStyle[outerGroup][innerGroup] &&
    depthStyle[outerGroup][innerGroup][prop] !== undefined
  ) {
    return depthStyle[outerGroup][innerGroup][prop];
  }
  if (
    mergedStyle &&
    mergedStyle[outerGroup] &&
    mergedStyle[outerGroup][innerGroup] &&
    mergedStyle[outerGroup][innerGroup][prop] !== undefined
  ) {
    return mergedStyle[outerGroup][innerGroup][prop];
  }
  return defaultValue;
}

/**
 * Resolve the applicable depth style for a node.
 * Checks positive depth cache first, then negative depths (which override positive if matched).
 * @param {number} depth
 * @param {string} nodeId
 * @param {any} mergedStyle
 * @param {Map<any, any>} depthStyleCache
 * @param {Map<any, any>} negativeDepthNodes
 * @returns {any} Depth style object or null
 */
export function resolveDepthStyle(
  depth,
  nodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  // Apply positive depth first
  let depthStyle = depthStyleCache.get(depth);

  // Then apply negative depths (merge on top of existing depth style).
  // Last matching negative depth wins (later entries override earlier ones).
  if (mergedStyle?.depths) {
    for (const ds of mergedStyle.depths) {
      if (ds.depth < 0) {
        const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
        if (nodesAtThisNegativeDepth && nodesAtThisNegativeDepth.has(nodeId)) {
          if (depthStyle) {
            // Merge: negative depth properties override, but missing ones
            // are preserved from the existing (e.g. wildcard) depth style
            const merged = { ...depthStyle };
            for (const key of Object.keys(ds)) {
              if (key === 'depth') continue;
              const base = depthStyle[key];
              const override = ds[key];
              if (
                base &&
                override &&
                typeof base === 'object' &&
                typeof override === 'object'
              ) {
                merged[key] = { ...base, ...override };
              } else {
                merged[key] = override;
              }
            }
            depthStyle = merged;
          } else {
            depthStyle = ds;
          }
        }
      }
    }
  }

  return depthStyle || null;
}

/**
 * Calculates the node style properties for rendering using nested style groups
 * @param {any} node - The node object
 * @param {number} depth - Node depth
 * @param {string|null} hoveredNodeId - ID of currently hovered node
 * @param {any} mergedStyle - Merged styles object (global groups and depths array)
 * @param {Map<any, any>} depthStyleCache
 * @param {Map<any, any>} negativeDepthNodes
 * @param {Set<string>|null} highlightedNodeIds - Set of node ids considered highlighted due to link association (may be null)
 * @returns {any} Style properties for the node: { fill, fillOpacity, stroke, strokeWidth, strokeOpacity, isHovered }
 */
export function calculateNodeStyle(
  node,
  depth,
  hoveredNodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
  highlightedNodeIds,
) {
  const depthStyle = resolveDepthStyle(
    depth,
    node.id,
    mergedStyle,
    depthStyleCache,
    negativeDepthNodes,
  );

  // Defaults (use previous defaults as reasonable fallbacks)
  const defaultFill = '#efefef';
  const defaultFillOpacity = 1;
  const defaultStroke = '#333333';
  const defaultStrokeWidth = 1;
  const defaultStrokeOpacity = 1;

  // Node values (check depth override, then global)
  const currentFill = readStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'fillColor',
    defaultFill,
  );
  const currentFillOpacity = readStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'fillOpacity',
    defaultFillOpacity,
  );
  const currentStroke = readStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'strokeColor',
    defaultStroke,
  );
  const currentStrokeWidth = readStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'strokeWidth',
    defaultStrokeWidth,
  );
  const currentStrokeOpacity = readStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'strokeOpacity',
    defaultStrokeOpacity,
  );

  const isDirectlyHovered = hoveredNodeId === node.id;
  const isLinkedHovered =
    highlightedNodeIds && typeof highlightedNodeIds.has === 'function'
      ? highlightedNodeIds.has(node.id)
      : false;
  const isHovered = isDirectlyHovered || isLinkedHovered;

  /**
   * Read a node highlight property with depth-specific override fallback.
   * Precedence: depthStyle.highlight.node > depthStyle.node.highlight > mergedStyle.highlight.node > mergedStyle.node.highlight
   * @param {string} prop
   * @param {*} [defaultValue]
   * @returns {*}
   */
  function readNodeHighlightProp(prop, defaultValue) {
    if (
      depthStyle &&
      depthStyle.highlight &&
      depthStyle.highlight.node &&
      depthStyle.highlight.node[prop] !== undefined
    ) {
      return depthStyle.highlight.node[prop];
    }
    if (
      depthStyle &&
      depthStyle.node &&
      depthStyle.node.highlight &&
      depthStyle.node.highlight[prop] !== undefined
    ) {
      return depthStyle.node.highlight[prop];
    }
    if (
      mergedStyle &&
      mergedStyle.highlight &&
      mergedStyle.highlight.node &&
      mergedStyle.highlight.node[prop] !== undefined
    ) {
      return mergedStyle.highlight.node[prop];
    }
    if (
      mergedStyle &&
      mergedStyle.node &&
      mergedStyle.node.highlight &&
      mergedStyle.node.highlight[prop] !== undefined
    ) {
      return mergedStyle.node.highlight[prop];
    }
    return defaultValue;
  }

  const highlightFill = readNodeHighlightProp('fillColor', undefined);
  const highlightFillOpacity = readNodeHighlightProp('fillOpacity', undefined);
  const highlightStroke = readNodeHighlightProp('strokeColor', undefined);
  const highlightStrokeOpacity = readNodeHighlightProp(
    'strokeOpacity',
    undefined,
  );
  const highlightStrokeWidth = readNodeHighlightProp('strokeWidth', undefined);

  const finalFill =
    isHovered && highlightFill !== undefined ? highlightFill : currentFill;
  const finalFillOpacity =
    isHovered && highlightFillOpacity !== undefined
      ? highlightFillOpacity
      : currentFillOpacity;
  const finalStroke =
    isHovered && highlightStroke !== undefined
      ? highlightStroke
      : currentStroke;
  const finalStrokeOpacity =
    isHovered && highlightStrokeOpacity !== undefined
      ? highlightStrokeOpacity
      : currentStrokeOpacity;

  const finalStrokeWidth =
    isHovered && highlightStrokeWidth !== undefined
      ? highlightStrokeWidth
      : currentStrokeWidth;

  return {
    fill: finalFill,
    fillOpacity: finalFillOpacity,
    stroke: finalStroke,
    strokeWidth: finalStrokeWidth,
    strokeOpacity: finalStrokeOpacity,
    isHovered,
  };
}

/**
 * Draws a single node on the canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {any} node
 * @param {number} depth
 * @param {string|null} hoveredNodeId
 * @param {any} mergedStyle
 * @param {Map<any, any>} depthStyleCache
 * @param {Map<any, any>} negativeDepthNodes
 * @param {Set<string>|null} highlightedNodeIds - Set of node ids considered highlighted due to link association (may be null)
 * @returns {boolean} Whether the node was rendered
 */
export function drawNode(
  ctx,
  x,
  y,
  radius,
  node,
  depth,
  hoveredNodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
  highlightedNodeIds,
) {
  if (!ctx) return false;

  if (radius < 1) return false;

  const style = /** @type {any} */ (
    calculateNodeStyle(
      node,
      depth,
      hoveredNodeId,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
      highlightedNodeIds,
    )
  );

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);

  const fillNeeded = style.fill !== 'none' && (style.fillOpacity ?? 1) > 0;
  const strokeNeeded =
    style.stroke !== 'none' &&
    (style.strokeWidth ?? 0) > 0 &&
    (style.strokeOpacity ?? 1) > 0;

  if (
    fillNeeded &&
    strokeNeeded &&
    (style.fillOpacity ?? 1) === (style.strokeOpacity ?? 1)
  ) {
    setCanvasStyles(ctx, {
      fillStyle: style.fill,
      strokeStyle: style.stroke,
      lineWidth: style.strokeWidth,
      globalAlpha: style.fillOpacity ?? 1,
    });
    ctx.fill();
    ctx.stroke();
  } else {
    if (fillNeeded) {
      setCanvasStyles(ctx, {
        fillStyle: style.fill,
        globalAlpha: style.fillOpacity ?? 1,
      });
      ctx.fill();
    }
    if (strokeNeeded) {
      setCanvasStyles(ctx, {
        strokeStyle: style.stroke,
        lineWidth: style.strokeWidth,
        globalAlpha: style.strokeOpacity ?? 1,
      });
      ctx.stroke();
    }
  }

  if (ctx.globalAlpha !== 1.0) {
    ctx.globalAlpha = 1.0;
  }

  return true;
}

/**
 * Draws all nodes in the renderedNodes array.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<any>} renderedNodes
 * @param {Set<string>|null} leafNodes
 * @param {string|null} hoveredNodeId
 * @param {any} mergedStyle
 * @param {Map<any, any>} depthStyleCache
 * @param {Map<any, any>} negativeDepthNodes
 * @param {Set<string>|null} highlightedNodeIds
 * @param {'all'|'nonLeaf'|'leaf'} [mode='all']
 * @returns {{ rendered: number, filtered: number }}
 */
export function drawNodes(
  ctx,
  renderedNodes,
  leafNodes,
  hoveredNodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
  highlightedNodeIds,
  mode = 'all',
) {
  if (!ctx || !renderedNodes || !renderedNodes.length) {
    return { rendered: 0, filtered: 0 };
  }

  let renderedCount = 0;
  let filteredCount = 0;

  /** @param {{id:string}} node */
  function shouldDrawNode(node) {
    if (!leafNodes) return true;
    try {
      if (mode === 'nonLeaf') return !leafNodes.has(node.id);
      if (mode === 'leaf') return leafNodes.has(node.id);
    } catch {
      return true;
    }
    return true;
  }

  for (const { x, y, radius, node, depth } of renderedNodes) {
    if (!shouldDrawNode(node)) {
      filteredCount++;
      continue;
    }

    const wasRendered = drawNode(
      ctx,
      x,
      y,
      radius,
      node,
      depth,
      hoveredNodeId,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
      highlightedNodeIds,
    );

    if (wasRendered) renderedCount++;
    else filteredCount++;
  }

  return { rendered: renderedCount, filtered: filteredCount };
}

/**
 * Utility: point-in-node test
 * @param {number} mouseX
 * @param {number} mouseY
 * @param {number} nodeX
 * @param {number} nodeY
 * @param {number} radius
 * @returns {boolean}
 */
export function isPointInNode(mouseX, mouseY, nodeX, nodeY, radius) {
  if (radius < 1) return false;
  const dx = mouseX - nodeX;
  const dy = mouseY - nodeY;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Find hovered node id (prioritize smallest radius)
 * @param {number} mouseX
 * @param {number} mouseY
 * @param {Array<any>} renderedNodes
 * @returns {string|null}
 */
export function findHoveredNode(mouseX, mouseY, renderedNodes) {
  let bestCandidate = null;
  let smallestRadius = Infinity;

  for (const nodeData of renderedNodes) {
    const { x, y, radius, node } = nodeData;
    if (isPointInNode(mouseX, mouseY, x, y, radius)) {
      if (radius < smallestRadius) {
        smallestRadius = radius;
        bestCandidate = node.id;
      }
    }
  }

  return bestCandidate;
}
