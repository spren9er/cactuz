/**
 * Node drawing utilities for CactusTree component
 * Handles rendering of individual nodes with proper styling and performance optimization
 */

import { setCanvasStyles } from './canvas-utils.js';

/**
 * Gets the effective style value for a given property, checking depth-specific overrides first
 * @param {any} depthStyle - Depth-specific style overrides
 * @param {{ [key: string]: any }} mergedStyle - Base merged styles
 * @param {string} property - Style property name
 * @returns {*} The effective style value
 */
export function getEffectiveStyle(depthStyle, mergedStyle, property) {
  return depthStyle?.[property] ?? mergedStyle[property];
}

/**
 * Finds the applicable depth style for a node
 * @param {number} depth - Node depth
 * @param {string} nodeId - Node ID
 * @param {{ depths?: Array<any> }} mergedStyle - Merged styles object
 * @param {Map<any, any>} depthStyleCache - Cache for depth styles
 * @param {Map<any, any>} negativeDepthNodes - Map of negative depth nodes
 * @returns {Object|null} The applicable depth style or null
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
  if (!depthStyle && mergedStyle.depths) {
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

  return depthStyle;
}

/**
 * Calculates the node style properties for rendering
 * @param {any} node - The node object
 * @param {number} depth - Node depth
 * @param {string|null} hoveredNodeId - ID of currently hovered node
 * @param {any} mergedStyle - Merged styles object
 * @param {Map<any, any>} depthStyleCache - Cache for depth styles
 * @param {Map<any, any>} negativeDepthNodes - Map of negative depth nodes
 * @returns {any} Style properties for the node
 */
export function calculateNodeStyle(
  node,
  depth,
  hoveredNodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  const depthStyle = getDepthStyle(
    depth,
    node.id,
    mergedStyle,
    depthStyleCache,
    negativeDepthNodes,
  );

  // Get base style values with depth-specific overrides
  const currentFill = /** @type {any} */ (depthStyle)?.fill ?? mergedStyle.fill;
  const currentFillOpacity =
    /** @type {any} */ (depthStyle)?.fillOpacity ?? mergedStyle.fillOpacity;
  const currentStroke =
    /** @type {any} */ (depthStyle)?.stroke ?? mergedStyle.stroke;
  const currentStrokeWidth =
    /** @type {any} */ (depthStyle)?.strokeWidth ?? mergedStyle.strokeWidth;
  const currentStrokeOpacity =
    /** @type {any} */ (depthStyle)?.strokeOpacity ?? mergedStyle.strokeOpacity;
  const currentHighlight =
    /** @type {any} */ (depthStyle)?.highlight ?? mergedStyle.highlight;

  // Check if this node is hovered and highlighting is enabled
  const isHovered = hoveredNodeId === node.id && currentHighlight;
  const finalFill = isHovered
    ? getEffectiveStyle(depthStyle, mergedStyle, 'highlightFill')
    : currentFill;
  const finalStroke = isHovered
    ? getEffectiveStyle(depthStyle, mergedStyle, 'highlightStroke')
    : currentStroke;

  return {
    fill: finalFill,
    fillOpacity: currentFillOpacity,
    stroke: finalStroke,
    strokeWidth: currentStrokeWidth,
    strokeOpacity: currentStrokeOpacity,
    isHovered,
  };
}

/**
 * Draws a single node on the canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Node center X coordinate
 * @param {number} y - Node center Y coordinate
 * @param {number} radius - Node radius
 * @param {any} node - The node object
 * @param {number} depth - Node depth
 * @param {string|null} hoveredNodeId - ID of currently hovered node
 * @param {any} mergedStyle - Merged styles object
 * @param {Map<any, any>} depthStyleCache - Cache for depth styles
 * @param {Map<any, any>} negativeDepthNodes - Map of negative depth nodes
 * @returns {boolean} Whether the node was rendered (not filtered out)
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
) {
  if (!ctx) return false;

  // Skip nodes with screen radius less than 1px for performance
  if (radius < 1) {
    return false; // Filtered out
  }

  const style = calculateNodeStyle(
    node,
    depth,
    hoveredNodeId,
    mergedStyle,
    depthStyleCache,
    negativeDepthNodes,
  );

  // Create circle path
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);

  // Batch fill operations
  if (style.fill !== 'none') {
    setCanvasStyles(ctx, {
      fillStyle: style.fill,
      globalAlpha: style.fillOpacity,
    });
    ctx.fill();
  }

  // Batch stroke operations
  if (style.stroke !== 'none' && style.strokeWidth > 0) {
    setCanvasStyles(ctx, {
      strokeStyle: style.stroke,
      lineWidth: style.strokeWidth,
      globalAlpha: style.strokeOpacity,
    });
    ctx.stroke();
  }

  // Reset alpha if it was changed
  if (ctx.globalAlpha !== 1.0) {
    ctx.globalAlpha = 1.0;
  }

  return true; // Successfully rendered
}

/**
 * Draws all nodes in the renderedNodes array
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<any>} renderedNodes - Array of rendered node data
 * @param {string|null} hoveredNodeId - ID of currently hovered node
 * @param {any} mergedStyle - Merged styles object
 * @param {Map<any, any>} depthStyleCache - Cache for depth styles
 * @param {Map<any, any>} negativeDepthNodes - Map of negative depth nodes
 * @returns {{ rendered: number, filtered: number }} Performance stats
 */
export function drawNodes(
  ctx,
  renderedNodes,
  hoveredNodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  if (!ctx || !renderedNodes.length) {
    return { rendered: 0, filtered: 0 };
  }

  let renderedCount = 0;
  let filteredCount = 0;

  renderedNodes.forEach(({ x, y, radius, node, depth }) => {
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
    );

    if (wasRendered) {
      renderedCount++;
    } else {
      filteredCount++;
    }
  });

  return {
    rendered: renderedCount,
    filtered: filteredCount,
  };
}

/**
 * Checks if a point is inside a node (for hover detection)
 * @param {number} mouseX - Mouse X coordinate
 * @param {number} mouseY - Mouse Y coordinate
 * @param {number} nodeX - Node center X coordinate
 * @param {number} nodeY - Node center Y coordinate
 * @param {number} radius - Node radius
 * @returns {boolean} Whether the point is inside the node
 */
export function isPointInNode(mouseX, mouseY, nodeX, nodeY, radius) {
  // Skip hover detection for nodes with screen radius less than 1px
  if (radius < 1) return false;

  const distance = Math.sqrt((mouseX - nodeX) ** 2 + (mouseY - nodeY) ** 2);
  return distance <= radius;
}

/**
 * Finds the hovered node ID based on mouse coordinates
 * @param {number} mouseX - Transformed mouse X coordinate
 * @param {number} mouseY - Transformed mouse Y coordinate
 * @param {Array<any>} renderedNodes - Array of rendered node data
 * @returns {string|null} The ID of the hovered node or null
 */
export function findHoveredNode(mouseX, mouseY, renderedNodes) {
  for (const nodeData of renderedNodes) {
    const { x, y, radius, node } = nodeData;

    if (isPointInNode(mouseX, mouseY, x, y, radius)) {
      return node.id;
    }
  }
  return null;
}
