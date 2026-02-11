/**
 * Edge drawing utilities for CactusTree
 *
 * Responsibilities:
 * - Build hierarchical paths for edge bundling
 * - Convert paths to coordinates using rendered node lookup
 * - Draw individual edges with support for highlighting and bundling
 * - Compute which node ids are visible via drawn edges (used for label highlighting)
 */

import { setCanvasStyles, colorWithAlpha } from './canvasUtils.js';
import { resolveDepthStyle } from './drawNode.js';

/**
 * Build hierarchical path (array of ancestor nodes) between two rendered nodes.
 * Uses a simple caching pattern keyed by sourceId-targetId.
 *
 * @param {any} sourceNode
 * @param {any} targetNode
 * @param {any} hierarchicalPathCache
 * @returns {{hierarchicalPath: any[], lca: any|null}}
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
    // Build ancestor chains
    const sourcePath = [];
    const targetPath = [];

    let cur = sourceNode.node;
    while (cur) {
      sourcePath.push(cur);
      cur = cur.parentRef;
    }

    cur = targetNode.node;
    while (cur) {
      targetPath.push(cur);
      cur = cur.parentRef;
    }

    // Find lowest common ancestor (closest to leaves)
    for (let i = 0; i < Math.min(sourcePath.length, targetPath.length); i++) {
      const a = sourcePath[sourcePath.length - 1 - i];
      const b = targetPath[targetPath.length - 1 - i];
      if (a === b) {
        lca = a;
      } else {
        break;
      }
    }

    // Compose path: source -> ... -> lca -> ... -> target
    hierarchicalPath = [sourceNode.node];

    // Add intermediate source ancestors up to (but not including) LCA
    const sLcaIdx = sourcePath.indexOf(lca);
    if (sLcaIdx > 0) {
      for (let i = 1; i < sLcaIdx; i++) {
        hierarchicalPath.push(sourcePath[i]);
      }
    }

    // Add LCA if it's meaningful
    if (lca && lca !== sourceNode.node && lca !== targetNode.node) {
      hierarchicalPath.push(lca);
    }

    // Add path from LCA down to target (excluding LCA)
    const tLcaIdx = targetPath.indexOf(lca);
    if (tLcaIdx > 0) {
      for (let i = tLcaIdx - 1; i >= 0; i--) {
        hierarchicalPath.push(targetPath[i]);
      }
    }

    // Ensure target is present
    const last = hierarchicalPath[hierarchicalPath.length - 1];
    if (last !== targetNode.node) {
      hierarchicalPath.push(targetNode.node);
    }

    hierarchicalPathCache.set(cacheKey, hierarchicalPath);
  }

  return { hierarchicalPath, lca };
}

/**
 * Convert hierarchical path nodes to {x,y} coordinates using nodeId->renderedNode map.
 * Falls back to source/target coords when path points cannot be resolved.
 *
 * @param {any[]} hierarchicalPath
 * @param {Map<string, any>} nodeIdToRenderedNodeMap
 * @param {{x:number,y:number}} sourceNode
 * @param {{x:number,y:number}} targetNode
 * @returns {Array<{x:number,y:number}>}
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

  // Accumulate resolved coordinates. Explicit typing annotation helps TS-like linters.
  /** @type {Array<{x:number,y:number}>} */
  const coords = [];

  for (const n of hierarchicalPath) {
    const rd = nodeIdToRenderedNodeMap.get(n.id);
    if (rd) {
      coords.push({ x: rd.x, y: rd.y });
      continue;
    }

    // Try immediate parentRef fallback
    if (n.parentRef && n.parentRef.id) {
      const p = nodeIdToRenderedNodeMap.get(n.parentRef.id);
      if (p) {
        coords.push({ x: p.x, y: p.y });
        continue;
      }
    }

    // Walk up ancestor chain to find nearest rendered ancestor (if any)
    let ancestor = n.parentRef;
    let found = false;
    while (ancestor) {
      const ar = nodeIdToRenderedNodeMap.get(ancestor.id);
      if (ar) {
        coords.push({ x: ar.x, y: ar.y });
        found = true;
        break;
      }
      ancestor = ancestor.parentRef;
    }

    // If unresolved, skip -- endpoints below will ensure a valid path
    if (!found) {
      // intentionally no-op; missing anchor will be handled by endpoints
    }
  }

  // If nothing resolved, fall back to straight source->target
  if (coords.length === 0) {
    return [
      { x: sourceNode.x, y: sourceNode.y },
      { x: targetNode.x, y: targetNode.y },
    ];
  }

  // Ensure source and target are included as endpoints to avoid collapsing to a single segment.
  const first = coords[0];
  if (!(first.x === sourceNode.x && first.y === sourceNode.y)) {
    coords.unshift({ x: sourceNode.x, y: sourceNode.y });
  }
  const last = coords[coords.length - 1];
  if (!(last.x === targetNode.x && last.y === targetNode.y)) {
    coords.push({ x: targetNode.x, y: targetNode.y });
  }

  // Remove consecutive duplicate points (which can happen from ancestor fallbacks)
  /** @type {Array<{x:number,y:number}>} */
  const deduped = coords.filter((c, i) => {
    if (i === 0) return true;
    const prev = coords[i - 1];
    return !(prev.x === c.x && prev.y === c.y);
  });

  if (deduped.length < 2) {
    return [
      { x: sourceNode.x, y: sourceNode.y },
      { x: targetNode.x, y: targetNode.y },
    ];
  }

  return deduped;
}

/**
 * Edge filtering: when hovering a leaf node, show only edges connected to that node.
 *
 * @param {any} edge
 * @param {any} hoveredNodeId
 * @returns {boolean} true if edge should be filtered
 */
export function shouldFilterEdge(
  edge,
  hoveredNodeId,
  nodeIdToRenderedNodeMap = null,
) {
  if (hoveredNodeId === null) return false;

  try {
    if (nodeIdToRenderedNodeMap) {
      const map = /** @type {any} */ (nodeIdToRenderedNodeMap);
      const hoveredNodeData = map.get(hoveredNodeId);
      const hasChildren =
        hoveredNodeData &&
        hoveredNodeData.node &&
        Array.isArray(hoveredNodeData.node.children) &&
        hoveredNodeData.node.children.length > 0;

      if (hasChildren) return false;
    }

    return edge.source !== hoveredNodeId && edge.target !== hoveredNodeId;
  } catch {
    return false;
  }
}

/**
 * Draw a single edge with hierarchical bundling and highlight support.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} edge
 * @param {any} sourceNode
 * @param {any} targetNode
 * @param {any} hierarchicalPathCache
 * @param {any} nodeIdToRenderedNodeMap
 * @param {Map<number, any>|null} depthStyleCache
 * @param {any} mergedStyle
 * @param {any} hoveredNodeId
 * @param {any} highlightedNodeIds
 * @param {any} bundlingStrength
 * @param {boolean} [skipFiltered=false]
 * @param {Map<number, Set<string>>|null} negativeDepthNodes
 * @returns {boolean} whether the edge was drawn
 */
export function drawEdge(
  ctx,
  edge,
  sourceNode,
  targetNode,
  hierarchicalPathCache,
  nodeIdToRenderedNodeMap,
  depthStyleCache,
  mergedStyle,
  hoveredNodeId,
  highlightedNodeIds = null,
  bundlingStrength = 0.97,
  muted = false,
  muteOpacity = 1,
  skipFiltered = false,
  negativeDepthNodes = null,
) {
  let highlightedSet = null;
  if (highlightedNodeIds != null) {
    if (typeof highlightedNodeIds.has === 'function') {
      highlightedSet = highlightedNodeIds;
    } else if (Array.isArray(highlightedNodeIds)) {
      highlightedSet = new Set(highlightedNodeIds);
    } else {
      highlightedSet = new Set([highlightedNodeIds]);
    }
  }

  const l = /** @type {any} */ (edge);

  if (!ctx) return false;

  if (
    skipFiltered &&
    shouldFilterEdge(l, hoveredNodeId, nodeIdToRenderedNodeMap)
  )
    return false;

  const depthStyle = depthStyleCache
    ? resolveDepthStyle(
        sourceNode?.depth,
        sourceNode?.id,
        mergedStyle,
        depthStyleCache,
        negativeDepthNodes ?? new Map(),
      ) ||
      resolveDepthStyle(
        targetNode?.depth,
        targetNode?.id,
        mergedStyle,
        depthStyleCache,
        negativeDepthNodes ?? new Map(),
      )
    : null;

  const globalEdge = mergedStyle?.edge ?? {};
  const depthEdge = depthStyle?.edge ?? {};
  const baseEdge = { ...globalEdge, ...depthEdge };
  const currentEdgeColor = baseEdge.strokeColor ?? '#333333';
  const currentEdgeWidth =
    typeof baseEdge.strokeWidth === 'number' ? baseEdge.strokeWidth : 1;
  const baseEdgeOpacity =
    typeof baseEdge.strokeOpacity === 'number' ? baseEdge.strokeOpacity : 0.1;

  const globalEdgeHighlight = mergedStyle?.highlight?.edge ?? {};
  const depthEdgeHighlight = depthStyle?.highlight?.edge ?? {};
  const edgeHighlight = { ...globalEdgeHighlight, ...depthEdgeHighlight };

  const isEdgeHovered =
    hoveredNodeId !== null &&
    (hoveredNodeId === l.source || hoveredNodeId === l.target);

  const isEdgeHighlighted = (() => {
    if (!highlightedSet) return false;
    try {
      return highlightedSet.has(l.source) || highlightedSet.has(l.target);
    } catch {
      return false;
    }
  })();

  const highlightColor =
    (isEdgeHovered || isEdgeHighlighted) &&
    edgeHighlight &&
    edgeHighlight.strokeColor !== undefined
      ? edgeHighlight.strokeColor
      : undefined;
  const highlightWidth =
    (isEdgeHovered || isEdgeHighlighted) &&
    edgeHighlight &&
    edgeHighlight.strokeWidth !== undefined
      ? edgeHighlight.strokeWidth
      : undefined;
  const highlightOpacity =
    (isEdgeHovered || isEdgeHighlighted) &&
    edgeHighlight &&
    edgeHighlight.strokeOpacity !== undefined
      ? edgeHighlight.strokeOpacity
      : undefined;

  let currentEdgeOpacity =
    (isEdgeHovered || isEdgeHighlighted) && highlightOpacity !== undefined
      ? highlightOpacity
      : baseEdgeOpacity;

  if (muted) {
    const m = typeof muteOpacity === 'number' ? muteOpacity : 1;
    currentEdgeOpacity = currentEdgeOpacity * m;
  }

  const finalEdgeColor =
    highlightColor !== undefined ? highlightColor : currentEdgeColor;
  const finalEdgeWidth =
    highlightWidth !== undefined ? highlightWidth : currentEdgeWidth;

  if (finalEdgeWidth <= 0 || finalEdgeColor === 'none') return false;

  const { hierarchicalPath } = buildHierarchicalPath(
    sourceNode,
    targetNode,
    hierarchicalPathCache,
  );
  const pathCoords = pathToCoordinates(
    hierarchicalPath,
    nodeIdToRenderedNodeMap,
    sourceNode,
    targetNode,
  );

  const prevStroke = ctx.strokeStyle;
  const prevWidth = ctx.lineWidth;

  const strokeStyleWithAlpha = colorWithAlpha(
    finalEdgeColor,
    currentEdgeOpacity,
  );
  setCanvasStyles(ctx, {
    strokeStyle: strokeStyleWithAlpha,
    lineWidth: finalEdgeWidth,
  });

  ctx.beginPath();

  if (!bundlingStrength || bundlingStrength <= 0) {
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(targetNode.x, targetNode.y);
    ctx.stroke();

    if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
    if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;
    return true;
  }

  if (bundlingStrength >= 1) {
    if (pathCoords.length === 2) {
      ctx.moveTo(pathCoords[0].x, pathCoords[0].y);
      ctx.lineTo(pathCoords[1].x, pathCoords[1].y);
    } else if (pathCoords.length > 2) {
      ctx.moveTo(pathCoords[0].x, pathCoords[0].y);
      for (let i = 1; i < pathCoords.length; i++) {
        const pt = pathCoords[i];
        if (!pt) continue;
        if (i === pathCoords.length - 1) {
          ctx.lineTo(pt.x, pt.y);
        } else {
          const next = pathCoords[i + 1];
          if (next) {
            const cpx = (pt.x + next.x) / 2;
            const cpy = (pt.y + next.y) / 2;
            ctx.quadraticCurveTo(pt.x, pt.y, cpx, cpy);
          }
        }
      }
    }
    ctx.stroke();

    if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
    if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;
    return true;
  }

  // 0 < bundlingStrength < 1: interpolated bundling
  const n = pathCoords.length;
  if (n === 0) {
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(targetNode.x, targetNode.y);
    ctx.stroke();

    if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
    if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;

    return true;
  }

  {
    const i = 0;
    const pt = pathCoords[0];
    const frac = n === 1 ? 0 : i / (n - 1);
    const straightX = sourceNode.x * (1 - frac) + targetNode.x * frac;
    const straightY = sourceNode.y * (1 - frac) + targetNode.y * frac;
    const fx = straightX * (1 - bundlingStrength) + pt.x * bundlingStrength;
    const fy = straightY * (1 - bundlingStrength) + pt.y * bundlingStrength;
    ctx.moveTo(fx, fy);
  }

  for (let i = 1; i < n; i++) {
    const pt = pathCoords[i];
    if (!pt) continue;

    const frac = n === 1 ? 0 : i / (n - 1);
    const straightX = sourceNode.x * (1 - frac) + targetNode.x * frac;
    const straightY = sourceNode.y * (1 - frac) + targetNode.y * frac;
    const fx = straightX * (1 - bundlingStrength) + pt.x * bundlingStrength;
    const fy = straightY * (1 - bundlingStrength) + pt.y * bundlingStrength;

    if (i === n - 1) {
      ctx.lineTo(fx, fy);
    } else {
      const next = pathCoords[i + 1];
      if (next) {
        const nextFrac = (i + 1) / (n - 1);
        const nextStraightX =
          sourceNode.x * (1 - nextFrac) + targetNode.x * nextFrac;
        const nextStraightY =
          sourceNode.y * (1 - nextFrac) + targetNode.y * nextFrac;
        const nx =
          nextStraightX * (1 - bundlingStrength) + next.x * bundlingStrength;
        const ny =
          nextStraightY * (1 - bundlingStrength) + next.y * bundlingStrength;
        const cpx = (fx + nx) * 0.5;
        const cpy = (fy + ny) * 0.5;
        ctx.quadraticCurveTo(fx, fy, cpx, cpy);
      } else {
        ctx.lineTo(fx, fy);
      }
    }
  }

  ctx.stroke();

  if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
  if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;
  return true;
}

/**
 * Compute visible node ids from edges without drawing.
 *
 * @param {any} edges
 * @param {any} nodeIdToRenderedNodeMap
 * @param {any} hoveredNodeId
 * @returns {string[]}
 */
export function computeVisibleEdgeNodeIds(
  edges,
  nodeIdToRenderedNodeMap,
  hoveredNodeId,
) {
  if (!edges || edges.length === 0) return [];

  const visibleSet = new Set();
  for (const edge of edges) {
    const li = /** @type {any} */ (edge);
    const s = nodeIdToRenderedNodeMap.get(li.source);
    const t = nodeIdToRenderedNodeMap.get(li.target);
    if (
      s &&
      t &&
      !shouldFilterEdge(li, hoveredNodeId, nodeIdToRenderedNodeMap)
    ) {
      visibleSet.add(li.source);
      visibleSet.add(li.target);
    }
  }

  if (hoveredNodeId) {
    if (visibleSet.has(hoveredNodeId)) {
      visibleSet.add(hoveredNodeId);
    } else {
      for (const edge of edges) {
        if (
          (edge.source === hoveredNodeId || edge.target === hoveredNodeId) &&
          nodeIdToRenderedNodeMap.get(edge.source) &&
          nodeIdToRenderedNodeMap.get(edge.target) &&
          !shouldFilterEdge(edge, hoveredNodeId, nodeIdToRenderedNodeMap)
        ) {
          visibleSet.add(edge.source);
          visibleSet.add(edge.target);
          visibleSet.add(hoveredNodeId);
          break;
        }
      }
    }
  }

  return Array.from(visibleSet);
}

/**
 * Draw all edges in batch. Returns array of visible node ids.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} edges
 * @param {any} nodeIdToRenderedNodeMap
 * @param {any} hierarchicalPathCache
 * @param {any} mergedStyle
 * @param {any} hoveredNodeId
 * @param {any} highlightedNodeIds
 * @param {any} bundlingStrength
 * @param {{bundlingStrength?:number,filterMode?:string,muteOpacity?:number}|null} edgesOptions
 * @param {Map<number, any>|null} depthStyleCache
 * @param {Map<number, Set<string>>|null} negativeDepthNodes
 * @returns {string[]}
 */
export function drawEdges(
  ctx,
  edges,
  nodeIdToRenderedNodeMap,
  hierarchicalPathCache,
  mergedStyle,
  hoveredNodeId,
  highlightedNodeIds = null,
  bundlingStrength = 0.97,
  edgesOptions = null,
  depthStyleCache = null,
  negativeDepthNodes = null,
) {
  if (!ctx || !edges || edges.length === 0) return [];

  let highlightedSet = null;
  if (highlightedNodeIds != null) {
    if (typeof highlightedNodeIds.has === 'function') {
      highlightedSet = highlightedNodeIds;
    } else if (Array.isArray(highlightedNodeIds)) {
      highlightedSet = new Set(highlightedNodeIds);
    } else {
      highlightedSet = new Set([highlightedNodeIds]);
    }
  }

  const visibleSet = new Set();

  const edgesOptionsLocal = edgesOptions ?? mergedStyle?.edges ?? {};
  const effectiveBundlingStrength =
    bundlingStrength ?? edgesOptionsLocal?.bundlingStrength ?? 0.97;
  const filterMode = edgesOptionsLocal.filterMode ?? 'hide';
  const muteOpacity =
    typeof edgesOptionsLocal.muteOpacity === 'number'
      ? edgesOptionsLocal.muteOpacity
      : 0.1;

  const backgroundEdges = [];
  const highlightedEdges = [];

  for (const edge of edges) {
    const li = /** @type {any} */ (edge);

    const sNode = nodeIdToRenderedNodeMap.get(li.source);
    const tNode = nodeIdToRenderedNodeMap.get(li.target);
    if (!sNode || !tNode) continue;

    const isFiltered = shouldFilterEdge(
      li,
      hoveredNodeId,
      nodeIdToRenderedNodeMap,
    );

    const isHighlighted =
      (hoveredNodeId !== null &&
        (li.source === hoveredNodeId || li.target === hoveredNodeId)) ||
      (highlightedSet &&
        (highlightedSet.has(li.source) || highlightedSet.has(li.target)));

    if (filterMode === 'hide' && isFiltered && !isHighlighted) continue;

    if (isHighlighted) {
      highlightedEdges.push({ li, sNode, tNode, isFiltered });
    } else {
      backgroundEdges.push({ li, sNode, tNode, isFiltered });
    }
  }

  for (const e of backgroundEdges) {
    const { li, sNode, tNode, isFiltered } = e;
    const muted = filterMode === 'mute' && isFiltered;
    const skipFiltered = !muted;

    try {
      const drawn = drawEdge(
        ctx,
        li,
        sNode,
        tNode,
        hierarchicalPathCache,
        nodeIdToRenderedNodeMap,
        depthStyleCache,
        mergedStyle,
        hoveredNodeId,
        highlightedSet,
        effectiveBundlingStrength,
        muted,
        muteOpacity,
        skipFiltered,
        negativeDepthNodes,
      );

      if (drawn) {
        visibleSet.add(li.source);
        visibleSet.add(li.target);
      }
    } catch {
      // skip failed edge
    }
  }

  // Highlighted edges on top
  for (const e of highlightedEdges) {
    const { li, sNode, tNode } = e;

    const edgeHighlight = mergedStyle?.highlight?.edge ?? {};
    const baseEdgeStyle = mergedStyle?.edge ?? {};

    const fallbackMerged = {
      ...(mergedStyle || {}),
      highlight: {
        ...(mergedStyle?.highlight || {}),
        edge: {
          ...(baseEdgeStyle || {}),
          ...(edgeHighlight || {}),
        },
      },
      edge: {
        ...(baseEdgeStyle || {}),
        ...(edgeHighlight || {}),
      },
    };

    try {
      const drawnByBundling = drawEdge(
        ctx,
        li,
        sNode,
        tNode,
        hierarchicalPathCache,
        nodeIdToRenderedNodeMap,
        depthStyleCache,
        fallbackMerged,
        hoveredNodeId,
        highlightedSet,
        effectiveBundlingStrength,
        false,
        1,
        false,
        negativeDepthNodes,
      );
      if (drawnByBundling) {
        visibleSet.add(li.source);
        visibleSet.add(li.target);
        continue;
      }
    } catch {
      // fall through to straight-line fallback
    }

    // Straight-line fallback
    const color =
      edgeHighlight.strokeColor ?? baseEdgeStyle.strokeColor ?? '#ff6b6b';
    const opacity =
      edgeHighlight.strokeOpacity ?? baseEdgeStyle.strokeOpacity ?? 1;
    const width = edgeHighlight.strokeWidth ?? baseEdgeStyle.strokeWidth ?? 1;

    const prevStroke = ctx.strokeStyle;
    const prevWidth = ctx.lineWidth;
    const strokeStyleWithAlpha = colorWithAlpha(color, opacity);

    setCanvasStyles(ctx, {
      strokeStyle: strokeStyleWithAlpha,
      lineWidth: width,
    });
    ctx.beginPath();
    ctx.moveTo(sNode.x, sNode.y);
    ctx.lineTo(tNode.x, tNode.y);
    ctx.stroke();

    if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
    if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;

    visibleSet.add(li.source);
    visibleSet.add(li.target);
  }

  return Array.from(visibleSet);
}
