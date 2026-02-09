/**
 * Edge drawing utilities for CactusTree component
 *
 * Responsibilities:
 * - Build hierarchical paths for edge bundling
 * - Convert paths to coordinates using rendered node lookup
 * - Draw individual edges with support for highlighting and bundling
 * - Draw connecting lines between parent/child nodes
 * - Compute which node ids are visible via drawn edges (used for label highlighting)
 */

import { setCanvasStyles } from './canvasUtils.js';

/**
 * Build hierarchical path (array of ancestor nodes) between two rendered nodes.
 * Uses a simple caching pattern keyed by sourceId-targetId.
 *
 * NOTE: Parameters are intentionally typed as `any` in JSDoc so downstream static
 * analyzers treat them as dynamic objects (they carry `.node`, `.parentRef`, etc.).
 *
 * @param {any} sourceNode - rendered source node container (expects .node, .node.id, .node.parentRef)
 * @param {any} targetNode - rendered target node container
 * @param {any} hierarchicalPathCache - cache map (key -> hierarchical path array)
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
 * NOTE: Parameters are typed as `any` to avoid property-access complaints from static checks.
 *
 * @param {any[]} hierarchicalPath
 * @param {any} nodeIdToRenderedNodeMap
 * @param {any} sourceNode
 * @param {any} targetNode
 * @returns {Array<{x:number,y:number}>}
 */
/**
 * Convert hierarchical path nodes to {x,y} coordinates using nodeId->renderedNode map.
 * Falls back to source/target coords when path points cannot be resolved.
 *
 * This variant includes explicit JSDoc typing for local arrays to avoid implicit-any
 * diagnostics in environments that statically check JS with TypeScript rules.
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
 * Edge filtering policy: when hovering a node, show only edges connected to that node.
 *
 * NOTE: params are annotated as `any` to avoid static-analysis property-access complaints.
 *
 * @param {any} link
 * @param {any} hoveredNodeId
 * @returns {boolean} true if edge should be filtered (i.e., hidden)
 */
export function shouldFilterEdge(link, hoveredNodeId) {
  if (hoveredNodeId === null) return false;

  // When any node is hovered, show only edges that are incident on the hovered node.
  // This ensures edges not associated with the hovered node are hidden regardless of
  // whether the hovered node is a leaf or internal node.
  try {
    return link.source !== hoveredNodeId && link.target !== hoveredNodeId;
  } catch {
    // Defensive fallback: if link shape is unexpected, do not filter.
    return false;
  }
}

/**
 * Determine edge opacity respecting hover state
 *
 * @param {string|null} hoveredNodeId
 * @param {number} baseOpacity
 * @returns {number}
 */
export function calculateEdgeOpacity(hoveredNodeId, baseOpacity) {
  if (hoveredNodeId === null) return baseOpacity;
  // When any node is hovered, emphasize visible edges by using full opacity.
  // We no longer rely on the parent->children map to decide leaf status here.
  return 1.0;
}

/**
 * Draw a single edge with hierarchical bundling and highlight support.
 *
 * NOTE: several parameters are intentionally annotated as `any` to silence static-analysis
 * warnings about property access (e.g. `link.source`, `node.x`) since these objects are
 * dynamic runtime shapes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} link - { source: string, target: string }
 * @param {any} sourceNode - rendered source node (has x,y,radius,node)
 * @param {any} targetNode - rendered target node
 * @param {any} hierarchicalPathCache
 * @param {any} nodeIdToRenderedNodeMap
 * @param {any} mergedStyle
 * @param {any} hoveredNodeId
 * @param {any} highlightedNodeIds
 * @param {any} bundlingStrength
 * @returns {boolean} whether the edge was drawn
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
  highlightedNodeIds = null,
  bundlingStrength = 0.97,
) {
  // Normalize highlightedNodeIds into a Set (highlightedSet) for consistent `.has` checks
  let highlightedSet = null;
  if (highlightedNodeIds != null) {
    if (typeof highlightedNodeIds.has === 'function') {
      // Already Set-like (could be SvelteSet / native Set)
      highlightedSet = highlightedNodeIds;
    } else if (Array.isArray(highlightedNodeIds)) {
      // Convert array -> Set
      highlightedSet = new Set(highlightedNodeIds);
    } else {
      // Single value -> Set
      highlightedSet = new Set([highlightedNodeIds]);
    }
  }

  // Cast link to `any` in a local variable `l` so static analysis won't complain about property accesses like `l.source`
  const l = /** @type {any} */ (link);

  if (!ctx) return false;

  // Respect hover-based filtering
  if (shouldFilterEdge(l, hoveredNodeId)) return false;

  // Read base edge styles
  const baseEdge = mergedStyle?.edge ?? {};
  const currentEdgeColor = baseEdge.strokeColor ?? 'none';
  const currentEdgeWidth =
    typeof baseEdge.strokeWidth === 'number' ? baseEdge.strokeWidth : 0;
  const baseEdgeOpacity =
    typeof baseEdge.strokeOpacity === 'number' ? baseEdge.strokeOpacity : 0.1;

  // Edge highlight (top-level mergedStyle.highlight.edge)
  const edgeHighlight = mergedStyle?.highlight?.edge ?? null;

  const isEdgeHovered =
    hoveredNodeId !== null &&
    (hoveredNodeId === l.source || hoveredNodeId === l.target);

  // Determine if either endpoint is considered highlighted (neighbors).
  // We normalized highlightedNodeIds into `highlightedSet` above so checks are simple.
  const isEdgeHighlighted = (() => {
    if (!highlightedSet) return false;
    try {
      return highlightedSet.has(l.source) || highlightedSet.has(l.target);
    } catch {
      // defensive fallback: if highlightedSet wasn't iterable as expected
      return false;
    }
  })();

  // If edge is hovered or highlighted and edgeHighlight provides overrides, prefer them
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

  // Effective opacity: if hovered and highlight opacity specified, use it; else compute hover-aware opacity
  const currentEdgeOpacity =
    isEdgeHovered && highlightOpacity !== undefined
      ? highlightOpacity
      : calculateEdgeOpacity(hoveredNodeId, baseEdgeOpacity);

  const finalEdgeColor =
    highlightColor !== undefined ? highlightColor : currentEdgeColor;
  const finalEdgeWidth =
    highlightWidth !== undefined ? highlightWidth : currentEdgeWidth;

  // Nothing to draw if width <= 0 or color says 'none'
  if (finalEdgeWidth <= 0 || finalEdgeColor === 'none') return false;

  // Build hierarchical path and convert to coordinates
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

  // Compute final path according to bundlingStrength: 0 => straight line sampling, 1 => full path
  let finalPathCoords;
  if (!bundlingStrength || bundlingStrength <= 0) {
    // straight line sampled to same number of points
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
    finalPathCoords = pathCoords.slice();
  } else {
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

  // Draw the stroke
  setCanvasStyles(ctx, {
    strokeStyle: finalEdgeColor,
    lineWidth: finalEdgeWidth,
    globalAlpha: currentEdgeOpacity,
  });

  ctx.beginPath();
  if (finalPathCoords.length === 2) {
    ctx.moveTo(finalPathCoords[0].x, finalPathCoords[0].y);
    ctx.lineTo(finalPathCoords[1].x, finalPathCoords[1].y);
  } else if (finalPathCoords.length > 2) {
    ctx.moveTo(finalPathCoords[0].x, finalPathCoords[0].y);
    for (let i = 1; i < finalPathCoords.length; i++) {
      const pt = finalPathCoords[i];
      if (!pt) continue;
      if (i === finalPathCoords.length - 1) {
        ctx.lineTo(pt.x, pt.y);
      } else {
        const next = finalPathCoords[i + 1];
        if (next) {
          const cpx = (pt.x + next.x) / 2;
          const cpy = (pt.y + next.y) / 2;
          ctx.quadraticCurveTo(pt.x, pt.y, cpx, cpy);
        }
      }
    }
  }
  ctx.stroke();

  // Reset alpha if changed via setCanvasStyles (up to implementation of setCanvasStyles)
  // Reset alpha if changed
  if (ctx.globalAlpha !== 1.0) ctx.globalAlpha = 1.0;

  // Halos disabled: do not draw any halo visuals for highlighted nodes.
  return true;
}

/**
 * Draw connecting lines between parent & child nodes (for overlap < 0 case).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<any>} renderedNodes
 * @param {Map<string, any[]>} parentToChildrenNodeMap
 * @param {any} mergedStyle
 * @param {Map<number, any>} depthStyleCache
 * @param {number} overlap
 * @param {Map<number, Set<string>>} negativeDepthNodes
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
  if (!ctx || overlap >= 0 || !renderedNodes || renderedNodes.length === 0)
    return;

  for (const nodeData of renderedNodes) {
    const { x, y, node, depth } = nodeData;
    const children =
      (parentToChildrenNodeMap && parentToChildrenNodeMap.get(node.id)) || [];
    for (const child of children) {
      // Resolve depth style similar to other modules
      let depthStyle = null;
      if (depthStyleCache && depthStyleCache.has(depth)) {
        depthStyle = depthStyleCache.get(depth);
      } else if (mergedStyle?.depths) {
        for (const ds of mergedStyle.depths) {
          if (ds.depth === depth) {
            depthStyle = ds;
            break;
          } else if (ds.depth < 0) {
            const nodesAt = negativeDepthNodes?.get(ds.depth);
            const childAt = negativeDepthNodes?.get(ds.depth + 1);
            if (
              nodesAt &&
              childAt &&
              nodesAt.has(node.id) &&
              childAt.has(child?.node?.id)
            ) {
              depthStyle = ds;
              break;
            }
          }
        }
      }

      const lineWidth =
        depthStyle?.line?.strokeWidth ?? mergedStyle?.line?.strokeWidth ?? 0;
      const lineColor =
        depthStyle?.line?.strokeColor ??
        mergedStyle?.line?.strokeColor ??
        'none';
      const lineOpacity =
        depthStyle?.line?.strokeOpacity ??
        mergedStyle?.line?.strokeOpacity ??
        1;

      if (lineWidth > 0 && lineColor !== 'none') {
        const prevAlpha = ctx.globalAlpha;
        setCanvasStyles(ctx, {
          strokeStyle: lineColor,
          lineWidth,
          globalAlpha: lineOpacity,
        });
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(child.x, child.y);
        ctx.stroke();
        if (ctx.globalAlpha !== prevAlpha) ctx.globalAlpha = prevAlpha;
      }
    }
  }
}

/**
 * Compute visible node ids from links without drawing.
 *
 * NOTE: annotated as `any` to avoid static-analysis complaints about shapes of link objects.
 *
 * @param {any} links
 * @param {any} nodeIdToRenderedNodeMap
 * @param {any} hoveredNodeId
 * @returns {string[]}
 */
export function computeVisibleEdgeNodeIds(
  links,
  nodeIdToRenderedNodeMap,
  hoveredNodeId,
) {
  if (!links || links.length === 0) return [];

  const visibleSet = new Set();
  for (const link of links) {
    const li = /** @type {any} */ (link);
    const s = nodeIdToRenderedNodeMap.get(li.source);
    const t = nodeIdToRenderedNodeMap.get(li.target);
    if (s && t && !shouldFilterEdge(li, hoveredNodeId)) {
      visibleSet.add(li.source);
      visibleSet.add(li.target);
    }
  }

  // If hovering and hovered node participates in visible edges, ensure it's present
  if (hoveredNodeId) {
    if (visibleSet.has(hoveredNodeId)) {
      visibleSet.add(hoveredNodeId);
    } else {
      for (const link of links) {
        if (
          (link.source === hoveredNodeId || link.target === hoveredNodeId) &&
          nodeIdToRenderedNodeMap.get(link.source) &&
          nodeIdToRenderedNodeMap.get(link.target) &&
          !shouldFilterEdge(link, hoveredNodeId)
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
 * Draw all edges in batch. Returns array of visible node ids (unique).
 *
 * NOTE: annotate params as `any` to quiet static checks about the runtime shapes of link/node objects.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} links
 * @param {any} nodeIdToRenderedNodeMap
 * @param {any} hierarchicalPathCache
 * @param {any} mergedStyle
 * @param {any} hoveredNodeId
 * @param {any} highlightedNodeIds
 * @param {any} bundlingStrength
 * @returns {string[]}
 */
export function drawEdges(
  ctx,
  links,
  nodeIdToRenderedNodeMap,
  hierarchicalPathCache,
  mergedStyle,
  hoveredNodeId,
  highlightedNodeIds = null,
  bundlingStrength = 0.97,
) {
  if (!ctx || !links || links.length === 0) return [];

  // Normalize highlightedNodeIds into a Set for consistent `.has` checks downstream.
  // This ensures the rest of the function can rely on `highlightedSet` being
  // either `null` or a Set-like object.
  let highlightedSet = null;
  if (highlightedNodeIds != null) {
    if (typeof highlightedNodeIds.has === 'function') {
      // Already Set-like (SvelteSet / native Set)
      highlightedSet = highlightedNodeIds;
    } else if (Array.isArray(highlightedNodeIds)) {
      highlightedSet = new Set(highlightedNodeIds);
    } else {
      highlightedSet = new Set([highlightedNodeIds]);
    }
  }

  const visibleSet = new Set();

  for (const link of links) {
    const li = /** @type {any} */ (link);
    // Skip edges filtered by the hover policy early so we never attempt fallback
    // drawing (which can produce straight-line fallbacks for non-associated edges).
    if (shouldFilterEdge(li, hoveredNodeId)) continue;
    const sNode = nodeIdToRenderedNodeMap.get(li.source);
    const tNode = nodeIdToRenderedNodeMap.get(li.target);
    if (!sNode || !tNode) continue;

    const drawn = drawEdge(
      ctx,
      li,
      sNode,
      tNode,
      hierarchicalPathCache,
      nodeIdToRenderedNodeMap,
      mergedStyle,
      hoveredNodeId,
      highlightedSet,
      bundlingStrength,
    );

    if (drawn) {
      visibleSet.add(li.source);
      visibleSet.add(li.target);
      continue;
    }

    // Fallback: if not drawn but should be visible because of hover/highlight, prefer drawing
    // using the hierarchical bundling path (so hover/highlighted edges remain bundled).
    // If that still doesn't draw (e.g. style says 'none' / width <= 0), fall back to a simple straight line.
    const shouldFallback =
      (hoveredNodeId !== null &&
        (li.source === hoveredNodeId || li.target === hoveredNodeId)) ||
      (highlightedSet &&
        (highlightedSet.has(li.source) || highlightedSet.has(li.target)));

    if (shouldFallback) {
      const edgeHighlight = mergedStyle?.highlight?.edge ?? {};
      const baseEdgeStyle = mergedStyle?.edge ?? {};

      // Prepare a temporary merged-style that ensures drawEdge will see highlight overrides
      // so that drawEdge can render a bundled path with the highlighted appearance.
      const fallbackMerged = {
        ...(mergedStyle || {}),
        // Ensure `highlight.edge` contains the highlight overrides
        highlight: {
          ...(mergedStyle?.highlight || {}),
          edge: {
            ...(baseEdgeStyle || {}),
            ...(edgeHighlight || {}),
          },
        },
        // Also ensure top-level edge is set so fallbackMerged.edge is consistent
        edge: {
          ...(baseEdgeStyle || {}),
          ...(edgeHighlight || {}),
        },
      };

      // Try to draw using hierarchical bundling (preferred)
      try {
        const drawnByBundling = drawEdge(
          ctx,
          li,
          sNode,
          tNode,
          hierarchicalPathCache,
          nodeIdToRenderedNodeMap,
          fallbackMerged,
          hoveredNodeId,
          highlightedSet,
          bundlingStrength,
        );
        if (drawnByBundling) {
          visibleSet.add(li.source);
          visibleSet.add(li.target);
          continue;
        }
      } catch {
        // If drawEdge threw, fall back to simple straight line below
      }

      // Last-resort fallback: straight line using highlight/base styles (unchanged appearance)
      const color =
        edgeHighlight.strokeColor ?? baseEdgeStyle.strokeColor ?? '#ff6b6b';
      const opacity =
        edgeHighlight.strokeOpacity ?? baseEdgeStyle.strokeOpacity ?? 1;
      const width = edgeHighlight.strokeWidth ?? baseEdgeStyle.strokeWidth ?? 1;

      const prevStroke = ctx.strokeStyle;
      const prevAlpha = ctx.globalAlpha;
      const prevWidth = ctx.lineWidth;

      setCanvasStyles(ctx, {
        strokeStyle: color,
        globalAlpha: opacity,
        lineWidth: width,
      });
      ctx.beginPath();
      ctx.moveTo(sNode.x, sNode.y);
      ctx.lineTo(tNode.x, tNode.y);
      ctx.stroke();

      // No halo drawing for highlighted endpoints. Restore canvas state and continue.
      if (ctx.globalAlpha !== prevAlpha) ctx.globalAlpha = prevAlpha;
      if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
      if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;

      visibleSet.add(li.source);
      visibleSet.add(li.target);
    }
  }

  return Array.from(visibleSet);
}
