/**
 * Voronoi-based hover detection for leaf nodes.
 *
 * Uses d3-delaunay to build a Delaunay triangulation over leaf node centres
 * so that hovering *near* a small leaf (within its radius + a configurable
 * tolerance) triggers the same highlight as hovering directly on it.
 */

import { Delaunay } from 'd3-delaunay';

/**
 * @typedef {import('$lib/types.js').VoronoiData} VoronoiData
 */

/**
 * Build a Delaunay triangulation from the leaf nodes in the rendered set.
 *
 * @param {Array<any>} renderedNodes - Full rendered node array
 * @param {Set<string>} leafNodes - Set of leaf node ids
 * @returns {VoronoiData | null} Voronoi lookup data, or null when there are fewer than 2 leaves
 */
export function buildLeafVoronoi(renderedNodes, leafNodes) {
  if (!renderedNodes || !leafNodes || leafNodes.size < 2) return null;

  /** @type {Array<{ x: number, y: number, radius: number, nodeId: string }>} */
  const leafEntries = [];

  for (const nd of renderedNodes) {
    if (leafNodes.has(nd.node.id)) {
      leafEntries.push({
        x: nd.x,
        y: nd.y,
        radius: nd.radius,
        nodeId: nd.node.id,
      });
    }
  }

  if (leafEntries.length < 2) return null;

  const delaunay = Delaunay.from(
    leafEntries,
    (d) => d.x,
    (d) => d.y,
  );

  return { delaunay, leafEntries };
}

/**
 * Find the leaf node whose extended hover zone (radius + tolerance) contains
 * the given point, using the pre-computed Delaunay triangulation for fast
 * nearest-neighbour lookup.
 *
 * @param {number} mouseX - Transformed mouse X (canvas coords minus pan)
 * @param {number} mouseY - Transformed mouse Y (canvas coords minus pan)
 * @param {VoronoiData} voronoiData - Pre-built Voronoi lookup data
 * @param {number} tolerance - Extra hover radius in px (screen coords)
 * @returns {string | null} Leaf node id, or null if outside all tolerance zones
 */
export function findHoveredLeafByVoronoi(
  mouseX,
  mouseY,
  voronoiData,
  tolerance,
) {
  if (!voronoiData) return null;

  const { delaunay, leafEntries } = voronoiData;
  const idx = delaunay.find(mouseX, mouseY);

  if (idx < 0 || idx >= leafEntries.length) return null;

  const leaf = leafEntries[idx];
  const dx = mouseX - leaf.x;
  const dy = mouseY - leaf.y;
  const distSq = dx * dx + dy * dy;
  const maxDist = leaf.radius + tolerance;

  if (distSq <= maxDist * maxDist) {
    return leaf.nodeId;
  }

  return null;
}
