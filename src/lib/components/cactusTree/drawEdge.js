/**
 * Edge drawing utilities for CactusTree component
 * Handles rendering of connections between nodes with hierarchical bundling
 */

import { setCanvasStyles } from './canvasUtils.js';

/**
 * Builds hierarchical path between two nodes for edge bundling
 * @param {any} sourceNode - Source node data
 * @param {any} targetNode - Target node data
 * @param {Map<string, any[]>} hierarchicalPathCache - Cache for hierarchical paths
 * @returns {any} Object containing hierarchicalPath array and lca node
 */
export function buildHierarchicalPath(
  sourceNode,
  targetNode,
  hierarchicalPathCache,
) {
  const cacheKey = `${sourceNode.node.id}-${targetNode.node.id}`;
  let hierarchicalPath = hierarchicalPathCache.get(cacheKey);
  let lca = null;

  if (!hierarchicalPath) {
    // Build hierarchical path from source to target
    const sourcePath = [];
    const targetPath = [];

    let current = sourceNode.node;
    while (current) {
      sourcePath.push(current);
      current = current.parentRef;
    }

    current = targetNode.node;
    while (current) {
      targetPath.push(current);
      current = current.parentRef;
    }

    // Find lowest common ancestor (closest to leaves)
    for (let i = 0; i < Math.min(sourcePath.length, targetPath.length); i++) {
      const sourceAncestor = sourcePath[sourcePath.length - 1 - i];
      const targetAncestor = targetPath[targetPath.length - 1 - i];
      if (sourceAncestor === targetAncestor) {
        lca = sourceAncestor;
      } else {
        break;
      }
    }

    // Create hierarchical path: source -> ... -> lca -> ... -> target
    hierarchicalPath = [sourceNode.node];

    // Add source path up to (but not including) LCA
    const sourceLcaIndex = sourcePath.indexOf(lca);
    if (sourceLcaIndex > 0) {
      for (let i = 1; i < sourceLcaIndex; i++) {
        hierarchicalPath.push(sourcePath[i]);
      }
    }

    // Add LCA if it exists and creates a meaningful bundle point
    if (lca && lca !== sourceNode.node && lca !== targetNode.node) {
      hierarchicalPath.push(lca);
    }

    // Add target path from LCA down to target (excluding LCA)
    const targetLcaIndex = targetPath.indexOf(lca);
    if (targetLcaIndex > 0) {
      for (let i = targetLcaIndex - 1; i >= 0; i--) {
        hierarchicalPath.push(targetPath[i]);
      }
    }

    // Always add target node
    if (hierarchicalPath[hierarchicalPath.length - 1] !== targetNode.node) {
      hierarchicalPath.push(targetNode.node);
    }

    hierarchicalPathCache.set(cacheKey, hierarchicalPath);
  }

  return { hierarchicalPath, lca };
}

/**
 * Converts hierarchical path to coordinate array
 * @param {any[]} hierarchicalPath - Array of nodes in the path
 * @param {Map<string, any>} nodeIdToRenderedNodeMap - Map from node ID to rendered node data
 * @param {any} sourceNode - Source node data (fallback)
 * @param {any} targetNode - Target node data (fallback)
 * @returns {any[]} Array of {x, y} coordinates
 */
export function pathToCoordinates(
  hierarchicalPath,
  nodeIdToRenderedNodeMap,
  sourceNode,
  targetNode,
) {
  if (!hierarchicalPath || hierarchicalPath.length === 0) {
    return [
      { x: sourceNode.x, y: sourceNode.y },
      { x: targetNode.x, y: targetNode.y },
    ];
  }

  const pathCoords = hierarchicalPath
    .map((node) => {
      const nodeData = nodeIdToRenderedNodeMap.get(node.id);
      return nodeData ? { x: nodeData.x, y: nodeData.y } : null;
    })
    .filter((coord) => coord !== null);

  // Fallback to direct line if no valid path
  if (pathCoords.length < 2) {
    return [
      { x: sourceNode.x, y: sourceNode.y },
      { x: targetNode.x, y: targetNode.y },
    ];
  }

  return pathCoords;
}

/**
 * Determines if edge should be filtered based on hover state
 * @param {any} link - Link object with source and target
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {Map<string, any[]>} parentToChildrenNodeMap - Map from parent to children nodes
 * @returns {boolean} Whether the edge should be filtered out
 */
export function shouldFilterEdge(link, hoveredNodeId, parentToChildrenNodeMap) {
  if (hoveredNodeId === null) return false;

  // Only filter for leaf nodes (nodes with no children)
  const isLeafNode = !parentToChildrenNodeMap.has(hoveredNodeId);

  if (isLeafNode) {
    // For leaf nodes, only show edges connected to the hovered node
    return link.source !== hoveredNodeId && link.target !== hoveredNodeId;
  }

  return false;
}

/**
 * Calculates edge opacity based on hover state
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {Map<string, any[]>} parentToChildrenNodeMap - Map from parent to children nodes
 * @param {number} baseOpacity - Base edge opacity from styles
 * @returns {number} Calculated opacity value
 */
export function calculateEdgeOpacity(
  hoveredNodeId,
  parentToChildrenNodeMap,
  baseOpacity,
) {
  if (hoveredNodeId === null) return baseOpacity;

  // Use full opacity when hovering over leaf nodes with links
  const isLeafNode = !parentToChildrenNodeMap.has(hoveredNodeId);
  return isLeafNode ? 1.0 : baseOpacity;
}

/**
 * Draws a single edge between two nodes
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {any} link - Link object with source and target
 * @param {any} sourceNode - Source node data
 * @param {any} targetNode - Target node data
 * @param {Map<string, any[]>} hierarchicalPathCache - Cache for hierarchical paths
 * @param {Map<string, any>} nodeIdToRenderedNodeMap - Map from node ID to rendered node data
 * @param {any} mergedStyle - Merged styles object
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {Map<string, any[]>} parentToChildrenNodeMap - Map from parent to children nodes
 * @returns {boolean} Whether the edge was drawn
 */
export function drawEdge(
  ctx,
  link,
  sourceNode,
  targetNode,
  hierarchicalPathCache,
  nodeIdToRenderedNodeMap,
  mergedStyle,
  hoveredNodeId,
  parentToChildrenNodeMap,
  bundlingStrength = 0.97,
) {
  if (!ctx) return false;

  // Check if edge should be filtered
  if (shouldFilterEdge(link, hoveredNodeId, parentToChildrenNodeMap)) {
    return false;
  }

  // Edge styles are global-only: read from mergedStyle.edge
  const currentEdgeColor =
    mergedStyle && mergedStyle.edge && mergedStyle.edge.strokeColor
      ? mergedStyle.edge.strokeColor
      : 'none';
  const currentEdgeWidth =
    mergedStyle && mergedStyle.edge && mergedStyle.edge.strokeWidth
      ? mergedStyle.edge.strokeWidth
      : 0;
  const baseEdgeOpacity =
    mergedStyle && mergedStyle.edge && mergedStyle.edge.strokeOpacity
      ? mergedStyle.edge.strokeOpacity
      : 0.1;

  // Edge-level highlight when hovering connected nodes (nested under edge.highlight)
  const edgeHighlight =
    mergedStyle && mergedStyle.edge && mergedStyle.edge.highlight
      ? mergedStyle.edge.highlight
      : null;

  const isEdgeHovered =
    hoveredNodeId !== null &&
    (hoveredNodeId === link.source || hoveredNodeId === link.target);

  // If an edge-level highlight is present and the edge is hovered, prefer its values.
  const highlightColor =
    isEdgeHovered && edgeHighlight && edgeHighlight.strokeColor !== undefined
      ? edgeHighlight.strokeColor
      : undefined;
  const highlightWidth =
    isEdgeHovered && edgeHighlight && edgeHighlight.strokeWidth !== undefined
      ? edgeHighlight.strokeWidth
      : undefined;
  const highlightOpacity =
    isEdgeHovered && edgeHighlight && edgeHighlight.strokeOpacity !== undefined
      ? edgeHighlight.strokeOpacity
      : undefined;

  // Determine effective opacity.
  // If the edge is hovered and a highlight opacity is provided, use it
  // directly. Otherwise, fall back to the hover-aware calculation which
  // may boost opacity for leaf hovers.
  let currentEdgeOpacity;
  if (isEdgeHovered && highlightOpacity !== undefined) {
    currentEdgeOpacity = highlightOpacity;
  } else {
    currentEdgeOpacity = calculateEdgeOpacity(
      hoveredNodeId,
      parentToChildrenNodeMap,
      baseEdgeOpacity,
    );
  }

  // Final color/width consider highlight overrides if present
  const finalEdgeColor =
    highlightColor !== undefined ? highlightColor : currentEdgeColor;
  const finalEdgeWidth =
    highlightWidth !== undefined ? highlightWidth : currentEdgeWidth;

  // Use final effective values to decide whether to draw the edge.
  // This ensures that highlight overrides (which may set a color/width even
  // when the global edge was 'none' or zero-width) are honored.
  if (finalEdgeWidth <= 0 || finalEdgeColor === 'none') {
    return false;
  }

  // Build hierarchical path
  const { hierarchicalPath } = buildHierarchicalPath(
    sourceNode,
    targetNode,
    hierarchicalPathCache,
  );

  // Convert hierarchical path to coordinates using lookup map
  const pathCoords = hierarchicalPath
    .map((/** @type {any} */ node) => {
      const nodeData = nodeIdToRenderedNodeMap.get(node.id);
      return nodeData ? { x: nodeData.x, y: nodeData.y } : null;
    })
    .filter((/** @type {any} */ coord) => coord !== null);

  // Fallback to direct line if no valid path
  if (pathCoords.length < 2) {
    pathCoords.length = 0;
    pathCoords.push({ x: sourceNode.x, y: sourceNode.y });
    pathCoords.push({ x: targetNode.x, y: targetNode.y });
  }

  // Bundling strength controls interpolation between a straight line (0)
  // and the full hierarchical bundle path (1). This value MUST come only from
  // the options (the `bundlingStrength` parameter passed into drawEdge/drawEdges).
  // No style-based fallback is used. Default is 0.85. The numeric value used
  // will be clamped to the [0,1] range in `bundlingStrengthValue` below.

  // Compute final coordinates according to bundling strength.
  // Strategy:
  //  - bundlingStrength === 1 -> use hierarchical path points unchanged
  //  - bundlingStrength === 0 -> use straight-line points sampled at same param positions
  //  - 0 < bundlingStrength < 1 -> linearly blend each hierarchical point
  //    with the corresponding straight-line sample (by normalized position along path)
  let finalPathCoords;
  if (bundlingStrength <= 0) {
    // Straight-line sampling with same number of points as pathCoords
    finalPathCoords = [];
    const n = pathCoords.length;
    for (let i = 0; i < n; i++) {
      const frac = n === 1 ? 0 : i / (n - 1);
      finalPathCoords.push({
        x: sourceNode.x * (1 - frac) + targetNode.x * frac,
        y: sourceNode.y * (1 - frac) + targetNode.y * frac,
      });
    }
  } else if (bundlingStrength >= 1) {
    finalPathCoords = pathCoords;
  } else {
    // Use an explicit loop rather than .map to avoid implicit-any issues
    finalPathCoords = [];
    for (let i = 0; i < pathCoords.length; i++) {
      const pt = pathCoords[i];
      const frac = pathCoords.length === 1 ? 0 : i / (pathCoords.length - 1);
      const straightX = sourceNode.x * (1 - frac) + targetNode.x * frac;
      const straightY = sourceNode.y * (1 - frac) + targetNode.y * frac;
      finalPathCoords.push({
        x: straightX * (1 - bundlingStrength) + pt.x * bundlingStrength,
        y: straightY * (1 - bundlingStrength) + pt.y * bundlingStrength,
      });
    }
  }

  // Set edge styles - optimize by only setting when different
  if (ctx.strokeStyle !== finalEdgeColor) {
    ctx.strokeStyle = finalEdgeColor;
  }
  if (ctx.globalAlpha !== currentEdgeOpacity) {
    ctx.globalAlpha = currentEdgeOpacity;
  }
  if (ctx.lineWidth !== finalEdgeWidth) {
    ctx.lineWidth = finalEdgeWidth;
  }

  ctx.beginPath();

  if (finalPathCoords.length === 2) {
    // Simple direct line
    ctx.moveTo(finalPathCoords[0]?.x ?? 0, finalPathCoords[0]?.y ?? 0);
    ctx.lineTo(finalPathCoords[1]?.x ?? 0, finalPathCoords[1]?.y ?? 0);
  } else if (finalPathCoords.length > 2) {
    // Draw smooth curve through final path points
    ctx.moveTo(finalPathCoords[0]?.x ?? 0, finalPathCoords[0]?.y ?? 0);

    // Use quadratic curves between consecutive points
    for (let i = 1; i < finalPathCoords.length; i++) {
      const currentPoint = finalPathCoords[i];
      if (!currentPoint) continue;

      if (i === finalPathCoords.length - 1) {
        // Last segment - line to target
        ctx.lineTo(currentPoint.x, currentPoint.y);
      } else {
        // Create smooth curve through intermediate points
        const nextPoint = finalPathCoords[i + 1];
        if (nextPoint) {
          const cpx = (currentPoint.x + nextPoint.x) / 2;
          const cpy = (currentPoint.y + nextPoint.y) / 2;
          ctx.quadraticCurveTo(currentPoint.x, currentPoint.y, cpx, cpy);
        }
      }
    }
  }
  ctx.stroke();

  // Reset alpha if it was changed
  if (ctx.globalAlpha !== 1.0) {
    ctx.globalAlpha = 1.0;
  }

  return true;
}

/**
 * Draws connecting lines between parent and child nodes
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {any[]} renderedNodes - Array of rendered node data
 * @param {Map<string, any[]>} parentToChildrenNodeMap - Map from parent to children nodes
 * @param {any} mergedStyle - Merged styles object
 * @param {Map<number, any>} depthStyleCache - Cache for depth styles
 * @param {number} overlap - Overlap setting from options
 * @param {Map<number, Set<string>>} negativeDepthNodes - Map of negative depth (e.g. -1, -2) to a Set of node IDs
 */
export function drawConnectingLines(
  ctx,
  renderedNodes,
  parentToChildrenNodeMap,
  mergedStyle,
  depthStyleCache,
  overlap,
  negativeDepthNodes,
) {
  if (overlap >= 0 || !ctx) return;

  renderedNodes.forEach((nodeData) => {
    const { x, y, node, depth } = nodeData;
    const children = parentToChildrenNodeMap.get(node.id) || [];

    children.forEach((/** @type {any} */ child) => {
      // Resolve depthStyle: prefer cached exact depth, else check mergedStyle.depths
      // including negative-depth membership via negativeDepthNodes map.
      let depthStyle = null;
      if (depthStyleCache && depthStyleCache.has(depth)) {
        depthStyle = depthStyleCache.get(depth);
      } else if (mergedStyle?.depths) {
        for (const ds of mergedStyle.depths) {
          if (ds.depth === depth) {
            depthStyle = ds;
            break;
          } else if (ds.depth < 0) {
            // For negative depths, only apply the depth style when the
            // parent -> child pair crosses the negative levels. Concretely:
            //   - the parent must be in depth -N (ds.depth)
            //   - the child must be in depth -(N - 1) (ds.depth + 1)
            // This ensures a style for -2 only affects the direct parent->leaf
            // line, not other child subtrees of that parent.
            const nodesAtThisNegativeDepth = negativeDepthNodes?.get(ds.depth);
            const childNodesAtNextNegativeDepth = negativeDepthNodes?.get(
              ds.depth + 1,
            );
            if (
              nodesAtThisNegativeDepth &&
              nodesAtThisNegativeDepth.has(node.id) &&
              childNodesAtNextNegativeDepth &&
              childNodesAtNextNegativeDepth.has(child?.node?.id)
            ) {
              depthStyle = ds;
              break;
            }
          }
        }
      }

      // Support nested `line` object (strokeColor, strokeOpacity, strokeWidth)
      const currentLineWidth =
        depthStyle?.line?.strokeWidth ?? mergedStyle?.line?.strokeWidth ?? 0;
      const currentLineColor =
        depthStyle?.line?.strokeColor ??
        mergedStyle?.line?.strokeColor ??
        'none';
      const currentLineOpacity =
        depthStyle?.line?.strokeOpacity ??
        mergedStyle?.line?.strokeOpacity ??
        1;

      if (currentLineWidth > 0 && currentLineColor !== 'none') {
        const prevAlpha = ctx.globalAlpha;
        setCanvasStyles(ctx, {
          strokeStyle: currentLineColor,
          lineWidth: currentLineWidth,
          globalAlpha: currentLineOpacity,
        });

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(child.x, child.y);
        ctx.stroke();

        // restore alpha if changed
        if (ctx.globalAlpha !== prevAlpha) ctx.globalAlpha = prevAlpha;
      }
    });
  });
}

/**
 * Compute visible node IDs for links without performing any drawing.
 *
 * This helper lets callers determine which nodes are connected via visible edges
 * (respecting the existing edge-filtering behavior such as leaf-only hover filtering)
 * without actually rendering the edges. This is useful when the caller needs the
 * set of connected nodes to decide highlight behavior for nodes/labels, while the
 * actual edge drawing can be performed later.
 *
 * NOTE: this function now uses a Set internally to avoid duplicates and will
 * ensure that, when hovering, if any edge connects to the hovered node we also
 * include the hovered node id itself in the returned set. This helps label
 * layout code include the hovered node's label when appropriate.
 *
 * @param {any[]} links - Array of link objects
 * @param {Map<string, any>} nodeIdToRenderedNodeMap - Map from node ID to rendered node data
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {Map<string, any[]>} parentToChildrenNodeMap - Map from parent to children nodes
 * @returns {string[]} Array of visible node IDs from links
 */
export function computeVisibleEdgeNodeIds(
  links,
  nodeIdToRenderedNodeMap,
  hoveredNodeId,
  parentToChildrenNodeMap,
) {
  if (!links?.length) return [];

  // Use a set to deduplicate node ids
  const visibleSet = new Set();

  links.forEach((link) => {
    const sourceNode = nodeIdToRenderedNodeMap.get(link.source);
    const targetNode = nodeIdToRenderedNodeMap.get(link.target);

    if (sourceNode && targetNode) {
      // Reuse existing filtering logic to determine visibility. `shouldFilterEdge`
      // returns true when the edge should be hidden (for example when hovering a leaf
      // node and the edge isn't attached to that leaf). We include the edge when it's
      // not filtered.
      if (!shouldFilterEdge(link, hoveredNodeId, parentToChildrenNodeMap)) {
        visibleSet.add(link.source);
        visibleSet.add(link.target);
      }
    }
  });

  // If hovering and at least one visible edge involves the hovered node, ensure
  // the hovered node id is included so label layout can pick up the hovered node's label.
  if (hoveredNodeId) {
    // Check whether hovered node appears in any visible edge we discovered
    if (visibleSet.has(hoveredNodeId)) {
      visibleSet.add(hoveredNodeId);
    } else {
      // Also check for edges that would be visible if the hovered node were attached.
      // This covers cases where logic elsewhere filtered edges prematurely.
      for (const link of links || []) {
        if (
          (link.source === hoveredNodeId || link.target === hoveredNodeId) &&
          nodeIdToRenderedNodeMap.get(link.source) &&
          nodeIdToRenderedNodeMap.get(link.target) &&
          !shouldFilterEdge(link, hoveredNodeId, parentToChildrenNodeMap)
        ) {
          visibleSet.add(link.source);
          visibleSet.add(link.target);
          visibleSet.add(hoveredNodeId);
          break;
        }
      }
    }
  }

  return Array.from(visibleSet);
}

/**
 * Draws all edges in batch for better performance
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {any[]} links - Array of link objects
 * @param {Map<string, any>} nodeIdToRenderedNodeMap - Map from node ID to rendered node data
 * @param {Map<string, any[]>} hierarchicalPathCache - Cache for hierarchical paths
 * @param {any} mergedStyle - Merged styles object
 * @param {string|null} hoveredNodeId - Currently hovered node ID
 * @param {Map<string, any[]>} parentToChildrenNodeMap - Map from parent to children nodes
 * @returns {string[]} Array of visible node IDs from drawn edges
 */
export function drawEdges(
  ctx,
  links,
  nodeIdToRenderedNodeMap,
  hierarchicalPathCache,
  mergedStyle,
  hoveredNodeId,
  parentToChildrenNodeMap,
  bundlingStrength = 0.97,
) {
  if (!ctx || !links?.length) return [];

  const visibleNodeIds = /** @type {string[]} */ ([]);
  // Keep a set to avoid duplicate pushes
  const visibleSet = new Set();

  links.forEach((link) => {
    const sourceNode = nodeIdToRenderedNodeMap.get(link.source);
    const targetNode = nodeIdToRenderedNodeMap.get(link.target);

    if (sourceNode && targetNode) {
      // Try normal drawing path first
      const wasDrawn = drawEdge(
        ctx,
        link,
        sourceNode,
        targetNode,
        hierarchicalPathCache,
        nodeIdToRenderedNodeMap,
        mergedStyle,
        hoveredNodeId,
        parentToChildrenNodeMap,
        bundlingStrength,
      );

      if (wasDrawn) {
        visibleSet.add(link.source);
        visibleSet.add(link.target);
      } else {
        // If the edge wasn't drawn but it connects to the hovered node,
        // draw a fallback visible line using highlight or base edge styles.
        if (
          hoveredNodeId !== null &&
          (link.source === hoveredNodeId || link.target === hoveredNodeId)
        ) {
          // Resolve highlight vs base edge styles (prefer edge.highlight when present)
          const edgeHighlight = mergedStyle?.edge?.highlight ?? {};
          const baseEdge = mergedStyle?.edge ?? {};
          const fallbackColor =
            edgeHighlight.strokeColor ?? baseEdge.strokeColor ?? '#ff6b6b';
          const fallbackOpacity =
            edgeHighlight.strokeOpacity ?? baseEdge.strokeOpacity ?? 1;
          const fallbackWidth =
            edgeHighlight.strokeWidth ?? baseEdge.strokeWidth ?? 1;

          const prevStroke = ctx.strokeStyle;
          const prevAlpha = ctx.globalAlpha;
          const prevWidth = ctx.lineWidth;

          setCanvasStyles(ctx, {
            strokeStyle: fallbackColor,
            globalAlpha: fallbackOpacity,
            lineWidth: fallbackWidth,
          });

          ctx.beginPath();
          ctx.moveTo(sourceNode.x, sourceNode.y);
          ctx.lineTo(targetNode.x, targetNode.y);
          ctx.stroke();

          // restore previous context state
          if (ctx.globalAlpha !== prevAlpha) ctx.globalAlpha = prevAlpha;
          if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
          if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;

          // Mark nodes as visible so labels/highlight logic can pick them up
          visibleSet.add(link.source);
          visibleSet.add(link.target);
        }
      }
    }
  });

  // convert set back into array (keeps unique ids)
  for (const id of visibleSet) visibleNodeIds.push(id);

  return visibleNodeIds;
}
