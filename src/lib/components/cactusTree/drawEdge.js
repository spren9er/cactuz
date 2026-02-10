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
 * Utility: embed an alpha into a color string when possible.
 * - If color is hex (#rgb or #rrggbb) -> convert to rgba(...)
 * - If color is 'rgb(...)' -> convert to rgba(...)
 * - If color is already 'rgba(...)' -> replace alpha component
 * - Otherwise return the original color (alpha ignored)
 *
 * This lets us avoid touching `ctx.globalAlpha` while still applying per-stroke opacity.
 * Results are cached since only a small number of distinct color+alpha combinations exist.
 *
 * @param {string} color
 * @param {number} alpha
 * @returns {string}
 */
/** @type {Map<string, string>} */
const _colorAlphaCache = new Map();
const _COLOR_CACHE_MAX_SIZE = 256;

/**
 * @param {string} color
 * @param {number} alpha
 * @returns {string}
 */
function colorWithAlpha(color, alpha) {
  if (color == null) return color;
  const c = String(color).trim();
  if (!c) return c;
  if (alpha === undefined || alpha === null) return c;
  if (alpha === 1) return c;

  const cacheKey = `${c}|${alpha}`;
  const cached = _colorAlphaCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result = c;

  if (c.startsWith('rgba(')) {
    const inner = c.slice(5, -1);
    const parts = inner.split(',').map((s) => s.trim());
    if (parts.length >= 3) {
      result = `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  } else if (c.startsWith('rgb(')) {
    const inner = c.slice(4, -1);
    const parts = inner.split(',').map((s) => s.trim());
    if (parts.length >= 3) {
      result = `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  } else if (c[0] === '#') {
    let hex = c.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((h) => h + h)
        .join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      result = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }

  if (_colorAlphaCache.size > _COLOR_CACHE_MAX_SIZE) {
    _colorAlphaCache.clear();
  }
  _colorAlphaCache.set(cacheKey, result);
  return result;
}

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
export function shouldFilterEdge(
  link,
  hoveredNodeId,
  nodeIdToRenderedNodeMap = null,
) {
  if (hoveredNodeId === null) return false;

  // Only apply the "show only incident edges" filter when hovering a leaf node.
  // If we have access to the rendered-node map we can detect whether the hovered
  // node is a leaf (no children). When hovering a non-leaf node we keep all edges.
  try {
    if (nodeIdToRenderedNodeMap) {
      // Cast the incoming map to `any` for safer property access in environments
      // that perform static-type checks which may otherwise infer `never`.
      const map = /** @type {any} */ (nodeIdToRenderedNodeMap);
      const hoveredNodeData = map.get(hoveredNodeId);
      const hasChildren =
        hoveredNodeData &&
        hoveredNodeData.node &&
        Array.isArray(hoveredNodeData.node.children) &&
        hoveredNodeData.node.children.length > 0;

      // Hovering a non-leaf: do not hide any edges.
      if (hasChildren) return false;
      // Otherwise, hovered node is a leaf and we fall through to filter edges
      // to only those incident on the hovered leaf.
    }

    // When hovering a leaf node, show only edges that are incident on the hovered node.
    return link.source !== hoveredNodeId && link.target !== hoveredNodeId;
  } catch {
    // Defensive fallback: if link shape is unexpected or map lookup fails, do not filter.
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
  // Always respect the configured base opacity for edges. Hovering should not
  // forcibly set full opacity because that can lead to double-application or
  // unexpected visual results when canvas alpha is composed elsewhere.
  return baseOpacity;
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
 * @param {any} sourceNode - rendered source node (has x,y,radius,node,depth)
 * @param {any} targetNode - rendered target node
 * @param {any} hierarchicalPathCache
 * @param {any} nodeIdToRenderedNodeMap
 * @param {Map<number, any>|null} depthStyleCache - optional map of depth -> style overrides (may be null)
 * @param {any} mergedStyle
 * @param {any} hoveredNodeId
 * @param {any} highlightedNodeIds
 * @param {any} bundlingStrength
 * @param {boolean} [skipFiltered=false] - if true, `drawEdge` will return false when the edge
 *   should be filtered according to `shouldFilterEdge`. Callers can set this to `false` if they
 *   want `drawEdge` to draw muted/bundled representations even when the edge would otherwise be filtered.
 * @param {Map<number, Set<string>>|null} negativeDepthNodes - optional mapping of negative depth -> Set(nodeId)
 *   This allows depth entries with negative `depth` values (e.g. -1 for leaves) to be resolved
 *   against precomputed node groups so that negative-depth styles correctly take precedence.
 * @returns {boolean} whether the edge was drawn
 */
export function drawEdge(
  ctx,
  link,
  sourceNode,
  targetNode,
  hierarchicalPathCache,
  nodeIdToRenderedNodeMap,
  depthStyleCache,
  mergedStyle,
  hoveredNodeId,
  highlightedNodeIds = null,
  bundlingStrength = 0.97,
  // When an edge is "muted" (due to hover strategy === 'mute'), callers can
  // pass `muted = true` and a `muteOpacity` value to reduce the final stroke
  // opacity for that particular edge group. Defaults preserve previous behavior.
  muted = false,
  muteOpacity = 1,
  // If true, `drawEdge` will consult `shouldFilterEdge` and return early when the
  // edge should be filtered. Callers that intend to draw muted or fallback-bundled
  // representations should pass `skipFiltered = false`.
  skipFiltered = false,
  negativeDepthNodes = null,
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

  // If the caller explicitly requested skipping filtered edges, perform that check here
  // and return early when the edge should be filtered. Callers that want to draw a muted
  // or fallback-bundled representation should pass `skipFiltered = false`.
  if (
    skipFiltered &&
    shouldFilterEdge(l, hoveredNodeId, nodeIdToRenderedNodeMap)
  )
    return false;

  // Proceed with style resolution and drawing below.

  // Read base edge styles (use sensible defaults so hover preserves configured appearance)
  // Merge depth-specific edge overrides with global edge styles so missing fields fall back to global.
  // Resolve depth-specific style:
  // 1) Apply positive depth styles first (via cache or explicit match).
  // 2) Then apply negative depths, which override positive if matched.
  let depthStyle = null;
  if (depthStyleCache) {
    depthStyle =
      depthStyleCache.get(sourceNode?.depth) ||
      depthStyleCache.get(targetNode?.depth) ||
      null;
  }

  if (mergedStyle?.depths) {
    // Check negative depths (override positive if matched)
    let negativeMatch = null;
    for (const ds of mergedStyle.depths) {
      if (ds.depth < 0) {
        if (negativeDepthNodes) {
          const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
          if (
            nodesAtThisNegativeDepth &&
            (nodesAtThisNegativeDepth.has(sourceNode?.id) ||
              nodesAtThisNegativeDepth.has(targetNode?.id))
          ) {
            negativeMatch = ds;
            break;
          }
        }
      }
    }

    if (negativeMatch) {
      depthStyle = negativeMatch;
    } else if (!depthStyle) {
      // No negative match and no positive cache hit — try explicit positive match
      for (const ds of mergedStyle.depths) {
        if (
          ds.depth >= 0 &&
          (ds.depth === sourceNode?.depth || ds.depth === targetNode?.depth)
        ) {
          depthStyle = ds;
          break;
        }
      }

      // Fallback: map negative depth indices to absolute depths using computed maxDepth
      if (!depthStyle) {
        let hasNegative = false;
        for (const ds of mergedStyle.depths) {
          if (ds.depth < 0) {
            hasNegative = true;
            break;
          }
        }

        if (hasNegative) {
          let maxDepth = -Infinity;
          try {
            if (
              nodeIdToRenderedNodeMap &&
              typeof nodeIdToRenderedNodeMap.values === 'function'
            ) {
              for (const val of nodeIdToRenderedNodeMap.values()) {
                if (val && typeof val.depth === 'number') {
                  maxDepth = Math.max(maxDepth, val.depth);
                }
              }
            } else {
              maxDepth = Math.max(
                sourceNode?.depth ?? -Infinity,
                targetNode?.depth ?? -Infinity,
              );
            }
          } catch {
            maxDepth = Math.max(
              sourceNode?.depth ?? -Infinity,
              targetNode?.depth ?? -Infinity,
            );
          }

          for (const ds of mergedStyle.depths) {
            if (ds.depth < 0 && isFinite(maxDepth)) {
              const targetDepth = maxDepth + ds.depth + 1;
              if (
                sourceNode?.depth === targetDepth ||
                targetNode?.depth === targetDepth
              ) {
                depthStyle = ds;
                break;
              }
            }
          }
        }
      }
    }
  }

  const globalEdge = mergedStyle?.edge ?? {};
  const depthEdge = depthStyle?.edge ?? {};
  const baseEdge = { ...globalEdge, ...depthEdge };
  const currentEdgeColor = baseEdge.strokeColor ?? '#333333';
  const currentEdgeWidth =
    typeof baseEdge.strokeWidth === 'number' ? baseEdge.strokeWidth : 1;
  const baseEdgeOpacity =
    typeof baseEdge.strokeOpacity === 'number' ? baseEdge.strokeOpacity : 0.1;

  // Edge highlight: merge depth-specific highlight.edge with global highlight.edge
  const globalEdgeHighlight = mergedStyle?.highlight?.edge ?? {};
  const depthEdgeHighlight = depthStyle?.highlight?.edge ?? {};
  const edgeHighlight = { ...globalEdgeHighlight, ...depthEdgeHighlight };

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
  let currentEdgeOpacity =
    isEdgeHovered && highlightOpacity !== undefined
      ? highlightOpacity
      : calculateEdgeOpacity(hoveredNodeId, baseEdgeOpacity);

  // If this edge is part of the "muted" group (strategy === 'mute'), apply
  // the group-level mute opacity multiplier on top of the computed opacity.
  if (muted) {
    const m = typeof muteOpacity === 'number' ? muteOpacity : 1;
    currentEdgeOpacity = currentEdgeOpacity * m;
  }

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

  // Compute final path according to bundlingStrength and draw it with minimal allocations:
  // - Fast-path straight line draws directly without creating intermediate arrays.
  // - For bundled paths we iterate pathCoords and draw into the context on-the-fly,
  //   avoiding creating objects for every sampled point.
  // This reduces GC pressure and canvas state churn for common zoom/hover scenarios.

  // Preserve strokeStyle/lineWidth around the stroke.
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

  // Fast path: no bundling -> draw straight segment between source and target.
  if (!bundlingStrength || bundlingStrength <= 0) {
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(targetNode.x, targetNode.y);
    ctx.stroke();

    // restore
    if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
    if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;

    // Halos disabled: do not draw any halo visuals for highlighted nodes.
    return true;
  }

  // If bundlingStrength >= 1, prefer drawing the pathCoords directly (no interpolation).
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

    // Halos disabled: do not draw any halo visuals for highlighted nodes.
    return true;
  }

  // General case: 0 < bundlingStrength < 1
  // Draw interpolated points on-the-fly to avoid allocating finalPathCoords array.
  // We'll sample exactly pathCoords.length points and compute each interpolated pair then draw.
  const n = pathCoords.length;
  if (n === 0) {
    // Nothing meaningful to draw: fallback to straight line
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(targetNode.x, targetNode.y);
    ctx.stroke();

    if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
    if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;

    return true;
  }

  // Move to first computed point
  // Compute first point (i = 0)
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
      // final point: straight line to it
      ctx.lineTo(fx, fy);
    } else {
      // build a smooth quadratic curve using this point and the next
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

  // Restore canvas style values we changed (preserve outer drawing state)
  if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
  if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;

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
        const prevStroke = ctx.strokeStyle;
        const prevWidthLocal = ctx.lineWidth;
        const strokeStyleWithAlpha = colorWithAlpha(lineColor, lineOpacity);
        setCanvasStyles(ctx, {
          strokeStyle: strokeStyleWithAlpha,
          lineWidth,
        });
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(child.x, child.y);
        ctx.stroke();
        if (ctx.lineWidth !== prevWidthLocal) ctx.lineWidth = prevWidthLocal;
        if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;
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
    if (
      s &&
      t &&
      !shouldFilterEdge(li, hoveredNodeId, nodeIdToRenderedNodeMap)
    ) {
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
          !shouldFilterEdge(link, hoveredNodeId, nodeIdToRenderedNodeMap)
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
 * @param {{bundlingStrength?:number,strategy?:string,muteOpacity?:number}|null} edgeOptions - optional edge-related interactive settings (may be null)
 * @param {Map<number, any>|null} depthStyleCache - optional depth->style cache to resolve depth-specific edge styles
 * @param {Map<number, Set<string>>|null} negativeDepthNodes - optional mapping of negative depth -> Set(nodeId) used to resolve negative-depth style entries (e.g. -1 => leaves)
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
  edgeOptions = null,
  depthStyleCache = null,
  negativeDepthNodes = null,
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

  // Prefer an explicit `edgeOptions` parameter when provided; otherwise fall
  // back to any `mergedStyle.edgeOptions`. Use `edgeOptionsLocal` to avoid
  // shadowing the function parameter or declaring duplicate identifiers.
  const edgeOptionsLocal = edgeOptions ?? mergedStyle?.edgeOptions ?? {};
  const effectiveBundlingStrength =
    bundlingStrength ?? edgeOptionsLocal?.bundlingStrength ?? 0.97;
  const strategy = edgeOptionsLocal.strategy ?? 'hide';
  const muteOpacity =
    typeof edgeOptionsLocal.muteOpacity === 'number'
      ? edgeOptionsLocal.muteOpacity
      : 0.25;

  // Partition edges into background (non-highlighted) and highlighted sets so we can
  // render them in phases. This ensures non-highlighted edges (including muted ones)
  // are drawn first and highlighted edges are drawn on top.
  const backgroundEdges = [];
  const highlightedEdges = [];

  for (const link of links) {
    const li = /** @type {any} */ (link);

    const sNode = nodeIdToRenderedNodeMap.get(li.source);
    const tNode = nodeIdToRenderedNodeMap.get(li.target);
    if (!sNode || !tNode) continue;

    // Determine whether this link would be filtered by the "show only incident edges" policy.
    const isFiltered = shouldFilterEdge(
      li,
      hoveredNodeId,
      nodeIdToRenderedNodeMap,
    );

    // Is this edge considered highlighted due to direct hover or neighbor highlights?
    const isHighlighted =
      (hoveredNodeId !== null &&
        (li.source === hoveredNodeId || li.target === hoveredNodeId)) ||
      (highlightedSet &&
        (highlightedSet.has(li.source) || highlightedSet.has(li.target)));

    // If strategy === 'hide' and the edge is filtered and not highlighted, skip it.
    if (strategy === 'hide' && isFiltered && !isHighlighted) continue;

    if (isHighlighted) {
      highlightedEdges.push({ li, sNode, tNode, isFiltered });
    } else {
      backgroundEdges.push({ li, sNode, tNode, isFiltered });
    }
  }

  // Phase 1: draw background edges (non-highlighted). For 'mute' strategy, filtered
  // edges are drawn here with reduced opacity (muted). For 'hide', filtered edges
  // were already skipped above.
  for (const e of backgroundEdges) {
    const { li, sNode, tNode, isFiltered } = e;
    const muted = strategy === 'mute' && isFiltered;
    // When muted, we must allow drawEdge to draw even if it would normally be filtered.
    // When not muted, allow drawEdge to skip filtered edges defensively.
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
      // Ignore single-edge drawing errors and continue; highlight phase below will still run.
    }
  }

  // Phase 2: draw highlighted edges on top. Prefer bundled/hierarchical rendering
  // using a merged style that favors highlight overrides. If that fails, fall back
  // to a straight line using highlight/base colors as before.
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

    // Try to draw highlighted edge with bundling (do NOT skip filtered for highlights).
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
      // If bundling draw fails, fall through to straight-line fallback.
    }

    // Last-resort straight-line fallback for highlighted edges
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

    // Restore canvas state
    if (ctx.lineWidth !== prevWidth) ctx.lineWidth = prevWidth;
    if (ctx.strokeStyle !== prevStroke) ctx.strokeStyle = prevStroke;

    visibleSet.add(li.source);
    visibleSet.add(li.target);
  }

  return Array.from(visibleSet);
}
