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
 * Resolve the applicable depth style for a node.
 * Iterates all depth entries in their natural (user-defined) order,
 * merging matching ones. Positive depths match by exact depth number,
 * negative depths match by node membership in negativeDepthNodes sets.
 * @param {number} depth
 * @param {string} nodeId
 * @param {any} mergedStyle
 * @param {Map<any, any>} _depthStyleCache - Unused, kept for API compatibility
 * @param {Map<any, any>} negativeDepthNodes
 * @returns {any} Depth style object or null
 */
export function resolveDepthStyle(
  depth,
  nodeId,
  mergedStyle,
  _depthStyleCache,
  negativeDepthNodes,
) {
  if (!mergedStyle?.depths) return null;

  let depthStyle = null;

  for (const ds of mergedStyle.depths) {
    let matches = false;

    if (ds.depth >= 0) {
      matches = ds.depth === depth;
    } else if (ds.depth < 0) {
      const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
      matches = !!(
        nodesAtThisNegativeDepth && nodesAtThisNegativeDepth.has(nodeId)
      );
    }

    if (!matches) continue;

    if (depthStyle) {
      /** @type {Record<string, any>} */
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

  return depthStyle;
}

/**
 * Read a property from a chain of style sources, returning the first defined value.
 * @param {string} prop - Property name (e.g. 'fillColor')
 * @param {Array<Record<string, any>|null|undefined>} sources - Style objects to check in order
 * @param {*} defaultValue - Fallback if no source has the property
 * @returns {*}
 */
function readFromChain(prop, sources, defaultValue) {
  for (const source of sources) {
    if (source && source[prop] !== undefined) {
      return source[prop];
    }
  }
  return defaultValue;
}

/**
 * Calculates the node style properties for rendering.
 *
 * Precedence rules for each property (first defined value wins):
 *
 * 1. Directly hovered node with edges:
 *    depthStyle.highlight.node -> highlight.edgeNode -> highlight.node -> edgeNode -> depthStyle.node -> node
 *
 * 2. Directly hovered node without edges:
 *    depthStyle.highlight.node -> highlight.node -> depthStyle.node -> node
 *
 * 3. Edge neighbor of hovered node:
 *    highlight.edgeNode -> edgeNode -> depthStyle.node -> node
 *
 * 4. Highlighted but not edge neighbor:
 *    depthStyle.highlight.node -> highlight.node -> depthStyle.node -> node
 *
 * 5. Not highlighted + has edge:
 *    edgeNode -> depthStyle.node -> node
 *
 * 6. Not highlighted + no edge:
 *    depthStyle.node -> node
 *
 * edgeNode has no depth-based support.
 *
 * @param {any} node - The node object
 * @param {number} depth - Node depth
 * @param {string|null} hoveredNodeId - ID of currently hovered node
 * @param {any} mergedStyle - Merged styles object (global groups and depths array)
 * @param {Map<any, any>} depthStyleCache
 * @param {Map<any, any>} negativeDepthNodes
 * @param {Set<string>|null} highlightedNodeIds - Set of node ids considered highlighted due to link association (may be null)
 * @param {Set<string>|null} allEdgeNodeIds - Set of node ids that appear in any edge (may be null)
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
  allEdgeNodeIds,
) {
  const depthStyle = resolveDepthStyle(
    depth,
    node.id,
    mergedStyle,
    depthStyleCache,
    negativeDepthNodes,
  );

  const isDirectlyHovered = hoveredNodeId === node.id;
  const isLinkedHovered =
    highlightedNodeIds && typeof highlightedNodeIds.has === 'function'
      ? highlightedNodeIds.has(node.id)
      : false;
  const isHovered = isDirectlyHovered || isLinkedHovered;

  const hasEdge =
    allEdgeNodeIds && typeof allEdgeNodeIds.has === 'function'
      ? allEdgeNodeIds.has(node.id)
      : false;

  // Build property source chain based on state
  const globalNode = mergedStyle?.node || null;
  const depthNode = depthStyle?.node || null;
  const globalEdgeNode = mergedStyle?.edgeNode || null;
  const globalHighlightNode = mergedStyle?.highlight?.node || null;
  const globalHighlightEdgeNode = mergedStyle?.highlight?.edgeNode || null;
  const depthHighlightNode = depthStyle?.highlight?.node || null;

  /** @type {Array<Record<string, any>|null|undefined>} */
  let sources;

  if (isDirectlyHovered && hasEdge) {
    // Directly hovered node with edges
    // depthStyle.highlight.node -> highlight.edgeNode -> highlight.node -> edgeNode -> depthStyle.node -> node
    sources = [
      depthHighlightNode,
      globalHighlightEdgeNode,
      globalHighlightNode,
      globalEdgeNode,
      depthNode,
      globalNode,
    ];
  } else if (isDirectlyHovered) {
    // Directly hovered node without edges
    // depthStyle.highlight.node -> highlight.node -> depthStyle.node -> node
    sources = [depthHighlightNode, globalHighlightNode, depthNode, globalNode];
  } else if (isHovered && hasEdge) {
    // Edge neighbor of hovered node
    // highlight.edgeNode -> edgeNode -> depthStyle.node -> node
    sources = [globalHighlightEdgeNode, globalEdgeNode, depthNode, globalNode];
  } else if (isHovered && !hasEdge) {
    // Non-edge neighbor highlight
    // depthStyle.highlight.node -> highlight.node -> depthStyle.node -> node
    sources = [depthHighlightNode, globalHighlightNode, depthNode, globalNode];
  } else if (!isHovered && hasEdge) {
    // edgeNode -> depthStyle.node -> node
    sources = [globalEdgeNode, depthNode, globalNode];
  } else {
    // depthStyle.node -> node
    sources = [depthNode, globalNode];
  }

  return {
    fill: readFromChain('fillColor', sources, '#efefef'),
    fillOpacity: readFromChain('fillOpacity', sources, 1),
    stroke: readFromChain('strokeColor', sources, '#333333'),
    strokeWidth: readFromChain('strokeWidth', sources, 1),
    strokeOpacity: readFromChain('strokeOpacity', sources, 1),
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
 * @param {Set<string>|null} allEdgeNodeIds - Set of node ids that appear in any edge (may be null)
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
  allEdgeNodeIds,
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
      allEdgeNodeIds,
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
 * @param {Set<string>|null} allEdgeNodeIds
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
  allEdgeNodeIds,
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
      allEdgeNodeIds,
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
