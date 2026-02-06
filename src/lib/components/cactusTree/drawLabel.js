/**
 * Label drawing utilities for CactusTree component
 * Handles rendering of text labels on nodes with proper positioning and truncation
 */

import { setCanvasStyles } from './canvasUtils.js';
import { calculateLabelPositions } from './labelPositions.js';

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
 * @returns {boolean} Whether the leaf label should be shown
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

  // For normal display, this will be filtered by labelLimit in drawLabels
  return true;
}

/**
 * Calculates font size based on node radius and label type
 * @param {number} radius - Node radius
 * @param {boolean} isLeafLabel - Whether this is a leaf label
 * @param {number} minFontSize - Minimum font size (default 8)
 * @param {number} maxFontSize - Maximum font size (default 14)
 * @returns {number} Calculated font size
 */
export function calculateFontSize(
  radius,
  isLeafLabel = false,
  minFontSize = 8,
  maxFontSize = 14,
) {
  if (isLeafLabel) {
    // For leaf nodes: use font size based on screen radius
    return Math.max(minFontSize, Math.min(maxFontSize, radius * 0.3));
  } else {
    // For non-leaf nodes: use radius-based calculation within range
    return Math.min(maxFontSize, Math.max(minFontSize, radius / 3));
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
 * @param {number} minFontSize - Minimum font size (default 8)
 * @param {number} maxFontSize - Maximum font size (default 14)
 */
export function drawLeafLabel(
  ctx,
  text,
  x,
  y,
  radius,
  angle,
  labelStyle,
  minFontSize = 8,
  maxFontSize = 14,
) {
  if (!ctx || !text) return;

  const fontSize = calculateFontSize(radius, true, minFontSize, maxFontSize);
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
 * @param {number} minFontSize - Minimum font size (default 8)
 * @param {number} maxFontSize - Maximum font size (default 14)
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
 * Determines if a node should show a label (basic eligibility check)
 * @param {any} node - Node object
 * @param {number} radius - Node radius
 * @param {string} nodeId - Node ID
 * @param {Set<string>} leafNodes - Set of leaf node IDs
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {any[] | Set<string>} visibleNodeIds - Set of visible node IDs from edges
 * @param {any} labelStyle - Label style properties
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
    )
  ) {
    return;
  }

  const text = String(node.name || node.id);
  const isActualLeaf = leafNodes.has(nodeId);
  const minFontSize = mergedStyle.labelMinFontSize || 8;
  const maxFontSize = mergedStyle.labelMaxFontSize || 14;

  if (isActualLeaf) {
    drawLeafLabel(
      ctx,
      text,
      x,
      y,
      radius,
      angle,
      labelStyle,
      minFontSize,
      maxFontSize,
    );
  } else {
    drawCenteredLabel(
      ctx,
      text,
      x,
      y,
      radius,
      labelStyle,
      minFontSize,
      maxFontSize,
    );
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
 * @param {number} panX - Current pan X offset
 * @param {number} panY - Current pan Y offset
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
  panX = 0,
  panY = 0,
) {
  if (!ctx || !renderedNodes.length) return;

  // Get canvas dimensions
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  // Helper function to check if node is in viewport
  const isInViewport =
    /** @param {{x:number,y:number,radius:number, node?:any, depth?:number}} nodeData */ (
      nodeData,
    ) => {
      const { x, y, radius } =
        /** @type {{x:number,y:number,radius:number}} */ (nodeData);
      const screenX = x + panX;
      const screenY = y + panY;
      const margin = radius * 2; // Add some margin for labels outside nodes

      return (
        screenX + margin >= 0 &&
        screenX - margin <= width &&
        screenY + margin >= 0 &&
        screenY - margin <= height
      );
    };

  // Filter nodes that are in viewport first
  const nodesInViewport = renderedNodes.filter(isInViewport);

  // Filter nodes that should have labels (basic eligibility)
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
      labelStyle,
    );
  });

  // Apply labelLimit and hover logic
  let nodesWithLabels;

  // Check if we're hovering over a leaf node (which triggers edge bundling visualization)
  const isHoveringLeafNode =
    hoveredNodeId !== null && leafNodes.has(hoveredNodeId);

  if (isHoveringLeafNode) {
    // When hovering over leaf nodes, show labels for connected nodes and nodes with inside labels
    nodesWithLabels = eligibleNodes.filter((nodeData) => {
      const nodeId = nodeData.node.id;
      const isActualLeaf = leafNodes.has(nodeId);
      const { radius, node } = nodeData;

      // Always show inside labels (they fit inside circles)
      const text = node.name || node.id;
      const textWidth = ctx.measureText(text).width + 8; // approximate width
      const textHeight = 12 + 4; // approximate height
      const diagonal = Math.sqrt(
        textWidth * textWidth + textHeight * textHeight,
      );
      const fitsInside = diagonal <= 2 * radius * 0.9;

      if (fitsInside) {
        // Keep inside labels always visible during hover
        return true;
      }

      if (isActualLeaf) {
        // For leaf nodes, check if they're in visibleNodeIds (connected via edges)
        return Array.isArray(visibleNodeIds)
          ? visibleNodeIds.includes(nodeId)
          : visibleNodeIds.has(nodeId);
      } else {
        // For non-leaf nodes with outside labels, show if in visibleNodeIds
        return Array.isArray(visibleNodeIds)
          ? visibleNodeIds.includes(nodeId)
          : visibleNodeIds.has(nodeId);
      }
    });
  } else if (mergedStyle.labelLimit === 0) {
    // When labelLimit is 0 and not hovering over leaf nodes, show no labels
    nodesWithLabels = [];
  } else {
    // Normal case: sort all eligible nodes by radius (largest first) and take top labelLimit
    const sortedByRadius = eligibleNodes.sort((a, b) => b.radius - a.radius);
    nodesWithLabels = sortedByRadius.slice(0, mergedStyle.labelLimit);
  }

  if (nodesWithLabels.length === 0) return;

  // Calculate optimal label positions
  const { labels, links } = calculateLabelPositions(
    nodesWithLabels,
    width,
    height,
    {
      fontFamily: mergedStyle.labelFontFamily || 'monospace',
      fontSize: mergedStyle.labelMinFontSize || 8, // All outside labels use min font size
      minRadius: 2, // Lower threshold to show labels for smaller nodes
      labelPadding: 2, // 2px padding to keep labels close to links
    },
  );

  // Draw connecting lines first (behind labels)
  if (links.length > 0) {
    drawLabelConnectors(ctx, links, mergedStyle);
  }

  // Draw positioned labels
  labels.forEach((labelData) => {
    const nodeData = nodesWithLabels.find(
      (n) => n.node.id === labelData.nodeId,
    );
    if (nodeData) {
      // For inside labels, render centered text (no link connector)
      // For outside labels, render positioned text with link
      if (labelData.isInside) {
        // Inside label - render centered in circle
        const { node, depth, radius } = nodeData;
        const labelStyle = getLabelStyle(
          depth,
          node.id,
          mergedStyle,
          depthStyleCache,
          negativeDepthNodes,
        );
        const text = String(node.name || node.id);
        const minFontSize = mergedStyle.labelMinFontSize || 8;
        const maxFontSize = mergedStyle.labelMaxFontSize || 14;
        drawCenteredLabel(
          ctx,
          text,
          nodeData.x,
          nodeData.y,
          radius,
          labelStyle,
          minFontSize,
          maxFontSize,
        );
      } else {
        // Outside label - render positioned with link
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
  });
}

/**
 * Draws connecting lines from nodes to positioned labels (only for outside labels)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {any[]} links - Array of link data
 * @param {any} mergedStyle - Merged styles object
 */
function drawLabelConnectors(ctx, links, mergedStyle) {
  const lineColor = mergedStyle.labelLink || mergedStyle.label || '#333333';
  const lineWidth = mergedStyle.labelLinkWidth ?? 1;
  const lineOpacity = 0.3;

  setCanvasStyles(ctx, {
    strokeStyle: lineColor,
    lineWidth: lineWidth,
    globalAlpha: lineOpacity,
  });

  links.forEach((/** @type {any} */ link) => {
    // Draw connecting line for outside labels
    ctx.beginPath();
    ctx.moveTo(link.x1, link.y1);
    ctx.lineTo(link.x2, link.y2);
    ctx.stroke();
  });

  // Reset alpha
  ctx.globalAlpha = 1.0;
}

/**
 * Draws a label at its optimally positioned location
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {any} labelData - Positioned label data
 * @param {any} nodeData - Original node data
 * @param {Set<string>} leafNodes - Set of leaf node IDs
 * @param {any} mergedStyle - Merged styles object
 * @param {Map<number, any>} depthStyleCache - Cache for depth styles
 * @param {Map<number, Set<string>>} negativeDepthNodes - Map of negative depth nodes
 */
function drawPositionedLabel(
  ctx,
  /** @type {any} */ labelData,
  /** @type {any} */ nodeData,
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

  // All outside labels use labelMinFontSize
  const fontSize = mergedStyle.labelMinFontSize || 8;
  const { isInside } = labelData;

  setCanvasStyles(ctx, {
    fillStyle: labelStyle.color,
    font: `${fontSize}px ${labelStyle.fontFamily}`,
    textAlign: isInside ? 'center' : 'left',
    textBaseline: isInside ? 'middle' : 'top',
  });

  if (isInside) {
    // For inside labels, center the text
    ctx.fillText(text, x + labelData.width / 2, y + labelData.height / 2);
  } else {
    // For outside labels, text is already positioned with padding included in bounding box
    // The labelPadding (2px on each side) is already included in label dimensions
    ctx.fillText(text, x + 2, y + 2); // Use labelPadding amount for consistent spacing
  }
}
