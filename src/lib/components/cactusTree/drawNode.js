/**
 * Node drawing utilities for CactusTree component
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
 * Finds the applicable depth style for a node (unchanged behavior, but depthStyle now contains nested groups)
 * @param {number} depth
 * @param {string} nodeId
 * @param {any} mergedStyle
 * @param {Map<any, any>} depthStyleCache
 * @param {Map<any, any>} negativeDepthNodes
 * @returns {any} Depth style object or null
 */
export function getDepthStyle(
  depth,
  nodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  // Try cache first
  let depthStyle = depthStyleCache.get(depth);

  // Handle negative depths if no direct match
  if (!depthStyle && mergedStyle?.depths) {
    for (const ds of mergedStyle.depths) {
      if (ds.depth < 0) {
        const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
        if (nodesAtThisNegativeDepth && nodesAtThisNegativeDepth.has(nodeId)) {
          depthStyle = ds;
          break;
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
  const depthStyle = getDepthStyle(
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

  // Determine whether highlighting is enabled for this node.
  // The schema does not explicitly include a boolean `enabled` flag, so we preserve a sensible default of true.
  // If consumers add an `enabled` boolean under node.highlight (global or depth), honor it.
  const depthHighlight =
    depthStyle && depthStyle.node && depthStyle.node.highlight;
  const globalHighlight =
    mergedStyle && mergedStyle.node && mergedStyle.node.highlight;
  const highlightEnabled =
    depthHighlight && depthHighlight.enabled !== undefined
      ? depthHighlight.enabled
      : globalHighlight && globalHighlight.enabled !== undefined
        ? globalHighlight.enabled
        : true;

  // Check if this node is hovered or is associated with the hovered node (via highlightedNodeIds)
  // Highlighting only applies if the highlight feature is enabled.
  const isDirectlyHovered = hoveredNodeId === node.id;
  const isLinkedHovered =
    highlightedNodeIds && typeof highlightedNodeIds.has === 'function'
      ? highlightedNodeIds.has(node.id)
      : false;
  const isHovered =
    (isDirectlyHovered || isLinkedHovered) && !!highlightEnabled;

  // If hovered (directly or via links), use highlight styles if provided; otherwise fall back to node styles
  // Highlight properties are nested under `node.highlight`
  const highlightFill = readNestedStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'highlight',
    'fillColor',
    undefined,
  );
  const highlightFillOpacity = readNestedStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'highlight',
    'fillOpacity',
    undefined,
  );
  const highlightStroke = readNestedStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'highlight',
    'strokeColor',
    undefined,
  );
  const highlightStrokeOpacity = readNestedStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'highlight',
    'strokeOpacity',
    undefined,
  );
  const highlightStrokeWidth = readNestedStyleProp(
    depthStyle,
    mergedStyle,
    'node',
    'highlight',
    'strokeWidth',
    undefined,
  );

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

  // Skip nodes with very small screen radius for performance
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

  // Create circle path
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);

  // Fill if specified and not 'none'
  if (style.fill !== 'none') {
    setCanvasStyles(ctx, {
      fillStyle: style.fill,
      globalAlpha: style.fillOpacity ?? 1,
    });
    ctx.fill();
  }

  // Stroke if specified and width > 0
  if (style.stroke !== 'none' && (style.strokeWidth ?? 0) > 0) {
    setCanvasStyles(ctx, {
      strokeStyle: style.stroke,
      lineWidth: style.strokeWidth,
      globalAlpha: style.strokeOpacity ?? 1,
    });
    ctx.stroke();
  }

  // Reset alpha if changed
  if (ctx.globalAlpha !== 1.0) {
    ctx.globalAlpha = 1.0;
  }

  return true;
}

/**
 * Draws all nodes in the renderedNodes array
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<any>} renderedNodes
 * @param {string|null} hoveredNodeId
 * @param {any} mergedStyle
 * @param {Map<any, any>} depthStyleCache
 * @param {Map<any, any>} negativeDepthNodes
 * @param {Set<string>|null} highlightedNodeIds - Set of node ids considered highlighted due to link association (may be null)
 * @returns {{ rendered: number, filtered: number }}
 */
export function drawNodes(
  ctx,
  renderedNodes,
  hoveredNodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
  highlightedNodeIds,
) {
  if (!ctx || !renderedNodes || !renderedNodes.length) {
    return { rendered: 0, filtered: 0 };
  }

  let renderedCount = 0;
  let filteredCount = 0;

  for (const { x, y, radius, node, depth } of renderedNodes) {
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
