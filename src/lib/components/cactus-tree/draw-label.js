/**
 * Label drawing utilities for CactusTree component
 * Handles rendering of text labels on nodes with proper positioning and truncation
 */

import { setCanvasStyles } from './canvas-utils.js';

/**
 * Text padding constant for positioning labels outside node circles
 */
export const TEXT_PADDING = 5;

/**
 * Gets label style properties for a node
 * @param {number} depth - Node depth
 * @param {string} nodeId - Node ID
 * @param {any} mergedStyle - Merged styles object
 * @param {Map<number, any>} depthStyleCache - Cache for depth styles
 * @param {Map<number, Set<string>>} negativeDepthNodes - Map of negative depth nodes
 * @returns {any} Label style properties
 */
export function getLabelStyle(
  depth,
  nodeId,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  // Find applicable depth style for labels
  let depthStyle = null;
  if (mergedStyle.depths) {
    for (const ds of mergedStyle.depths) {
      if (ds.depth === depth) {
        depthStyle = ds;
        break;
      } else if (ds.depth < 0) {
        // Handle negative depths using our calculated mappings
        const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
        if (nodesAtThisNegativeDepth && nodesAtThisNegativeDepth.has(nodeId)) {
          depthStyle = ds;
          break;
        }
      }
    }
  }

  return {
    color: depthStyle?.label ?? mergedStyle.label,
    fontFamily: depthStyle?.labelFontFamily ?? mergedStyle.labelFontFamily,
  };
}

/**
 * Determines if a leaf node should show its label based on visibility rules
 * @param {string} nodeId - Node ID
 * @param {Set<string>} leafNodes - Set of leaf node IDs
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {any[] | Set<string>} visibleNodeIds - Set of visible node IDs from edges
 * @param {number} labelLimit - Maximum number of leaf labels to show
 * @returns {boolean} Whether the leaf label should be shown
 */
export function shouldShowLeafLabel(
  nodeId,
  leafNodes,
  hoveredNodeId,
  visibleNodeIds,
  labelLimit,
) {
  const isActualLeaf = leafNodes.has(nodeId);
  if (!isActualLeaf) return false;

  // Only bypass 50-leaf limit when hovering specifically over leaf nodes
  const isHoveringLeafNode =
    hoveredNodeId !== null && leafNodes.has(hoveredNodeId);

  return isHoveringLeafNode
    ? Array.isArray(visibleNodeIds)
      ? visibleNodeIds.includes(nodeId)
      : visibleNodeIds.has(nodeId)
    : leafNodes.size <= labelLimit;
}

/**
 * Calculates font size based on node radius and label type
 * @param {number} radius - Node radius
 * @param {boolean} isLeafLabel - Whether this is a leaf label
 * @returns {number} Calculated font size
 */
export function calculateFontSize(radius, isLeafLabel = false) {
  if (isLeafLabel) {
    // For leaf nodes: use font size based on screen radius
    return Math.max(8, Math.min(12, radius * 0.3));
  } else {
    // For non-leaf nodes: use existing logic
    return Math.min(14, Math.max(7, radius / 3));
  }
}

/**
 * Truncates text to fit within a specified width
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to truncate
 * @param {number} maxWidth - Maximum width allowed
 * @returns {string} Truncated text with ellipsis if needed
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
 * Calculates label position for leaf nodes positioned outside the circle
 * @param {number} centerX - Node center X coordinate
 * @param {number} centerY - Node center Y coordinate
 * @param {number} radius - Node radius
 * @param {number} angle - Node angle for positioning
 * @returns {Object} Position and alignment information
 */
export function calculateLeafLabelPosition(centerX, centerY, radius, angle) {
  // Determine if text is on left half (angle between 90° and 270°)
  const normalizedAngle =
    ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const isLeftHalf =
    normalizedAngle > Math.PI / 2 && normalizedAngle < (3 * Math.PI) / 2;

  // Calculate base position at circle edge + padding
  const baseX = centerX + (radius + TEXT_PADDING) * Math.cos(angle);
  const baseY = centerY + (radius + TEXT_PADDING) * Math.sin(angle);

  return {
    x: baseX,
    y: baseY,
    angle,
    isLeftHalf,
    textAlign: isLeftHalf ? 'right' : 'left',
  };
}

/**
 * Draws a leaf label with proper rotation and positioning
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to draw
 * @param {number} x - Node X coordinate
 * @param {number} y - Node Y coordinate
 * @param {number} radius - Node radius
 * @param {number} angle - Node angle
 * @param {Object} labelStyle - Label style properties
 */
export function drawLeafLabel(ctx, text, x, y, radius, angle, labelStyle) {
  if (!ctx || !text) return;

  const fontSize = calculateFontSize(radius, true);
  const position = calculateLeafLabelPosition(x, y, radius, angle);

  setCanvasStyles(ctx, {
    fillStyle: /** @type {any} */ (labelStyle).color,
    font: `${fontSize}px ${/** @type {any} */ (labelStyle).fontFamily}`,
    textAlign: 'center',
    textBaseline: 'middle',
  });

  // Save context for rotation
  ctx.save();

  if (/** @type {any} */ (position).isLeftHalf) {
    // For left labels: make readable by rotating 180° additional
    // and position so text starts from left and ends at circle
    ctx.translate(
      /** @type {any} */ (position).x,
      /** @type {any} */ (position).y,
    );
    ctx.rotate(/** @type {any} */ (position).angle + Math.PI);
    ctx.textAlign = 'right';
  } else {
    // For right half: normal positioning and rotation
    ctx.translate(
      /** @type {any} */ (position).x,
      /** @type {any} */ (position).y,
    );
    ctx.rotate(/** @type {any} */ (position).angle);
    ctx.textAlign = 'left';
  }

  // Draw text at origin (already translated)
  ctx.fillText(text, 0, 0);

  // Restore context
  ctx.restore();
}

/**
 * Draws a centered label inside a node
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to draw
 * @param {number} x - Node X coordinate
 * @param {number} y - Node Y coordinate
 * @param {number} radius - Node radius
 * @param {Object} labelStyle - Label style properties
 */
export function drawCenteredLabel(ctx, text, x, y, radius, labelStyle) {
  if (!ctx || !text) return;

  const fontSize = calculateFontSize(radius, false);

  setCanvasStyles(ctx, {
    fillStyle: /** @type {any} */ (labelStyle).color,
    font: `${fontSize}px ${/** @type {any} */ (labelStyle).fontFamily}`,
    textAlign: 'center',
    textBaseline: 'middle',
  });

  const maxWidth = radius * 1.8;
  const displayText = truncateText(ctx, text, maxWidth);

  ctx.fillText(displayText, x, y);
}

/**
 * Determines if a node should show a label
 * @param {any} node - Node object
 * @param {number} radius - Node radius
 * @param {string} nodeId - Node ID
 * @param {Set<string>} leafNodes - Set of leaf node IDs
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {any[] | Set<string>} visibleNodeIds - Set of visible node IDs from edges
 * @param {any} labelStyle - Label style properties
 * @param {number} labelLimit - Maximum number of leaf labels
 * @returns {boolean} Whether the node should show a label
 */
export function shouldShowLabel(
  node,
  radius,
  nodeId,
  leafNodes,
  hoveredNodeId,
  visibleNodeIds,
  labelStyle,
  labelLimit,
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
      labelLimit,
    );
  } else {
    // For non-leaf nodes: show if radius is large enough and label style is valid
    return (
      radius > 10 &&
      labelStyle.color !== 'none' &&
      labelStyle.color !== 'transparent'
    );
  }
}

/**
 * Draws a label for a single node
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {any} nodeData - Node data object containing position and properties
 * @param {Set<string>} leafNodes - Set of leaf node IDs
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {any[] | Set<string>} visibleNodeIds - Set of visible node IDs from edges
 * @param {any} mergedStyle - Merged styles object
 * @param {Map<number, any>} depthStyleCache - Cache for depth styles
 * @param {Map<number, Set<string>>} negativeDepthNodes - Map of negative depth nodes
 */
export function drawLabel(
  ctx,
  nodeData,
  leafNodes,
  hoveredNodeId,
  visibleNodeIds,
  mergedStyle,
  depthStyleCache,
  negativeDepthNodes,
) {
  if (!ctx) return;

  const { x, y, radius, node, depth, angle } = nodeData;
  const nodeId = node.id;

  const labelStyle = getLabelStyle(
    depth,
    nodeId,
    mergedStyle,
    depthStyleCache,
    negativeDepthNodes,
  );

  if (
    !shouldShowLabel(
      node,
      radius,
      nodeId,
      leafNodes,
      hoveredNodeId,
      visibleNodeIds,
      labelStyle,
      mergedStyle.labelLimit,
    )
  ) {
    return;
  }

  const text = String(node.name || node.id);
  const isActualLeaf = leafNodes.has(nodeId);

  if (isActualLeaf) {
    drawLeafLabel(ctx, text, x, y, radius, angle, labelStyle);
  } else {
    drawCenteredLabel(ctx, text, x, y, radius, labelStyle);
  }
}

/**
 * Draws labels for multiple nodes in batch
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {any[]} renderedNodes - Array of rendered node data
 * @param {Set<string>} leafNodes - Set of leaf node IDs
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {any[] | Set<string>} visibleNodeIds - Set of visible node IDs from edges
 * @param {any} mergedStyle - Merged styles object
 * @param {Map<number, any>} depthStyleCache - Cache for depth styles
 * @param {Map<number, Set<string>>} negativeDepthNodes - Map of negative depth nodes
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
) {
  if (!ctx || !renderedNodes.length) return;

  renderedNodes.forEach((nodeData) => {
    drawLabel(
      ctx,
      nodeData,
      leafNodes,
      hoveredNodeId,
      visibleNodeIds,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
    );
  });
}
