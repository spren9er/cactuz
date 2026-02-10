/**
 * Layout utilities for CactusTree component
 * Handles layout calculations, lookup maps, and performance optimization
 */

import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import { CactusLayout } from './cactusLayout.js';

/**
 * Calculates performance statistics
 * @param {number} totalNodes - Total number of nodes
 * @param {number} renderedNodes - Number of rendered nodes
 * @param {number} filteredNodes - Number of filtered nodes
 * @returns {Object} Performance statistics
 */
export function getPerformanceStats(totalNodes, renderedNodes, filteredNodes) {
  return {
    total: totalNodes,
    rendered: renderedNodes,
    filtered: filteredNodes,
    filterRatio: totalNodes > 0 ? (filteredNodes / totalNodes) * 100 : 0,
  };
}

/**
 * Calculates the layout using CactusLayout
 *
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} layoutZoom - Layout zoom level (already combined zoom)
 * @param {Array<Object>} nodes - Array of node objects (each: { id, name, parent, weight? })
 * @param {{ overlap:number, arcSpan:number, sizeGrowthRate:number, orientation:number, zoom:number }} mergedOptions - Merged options object
 * @returns {Array<Object>} Array of rendered node data (id, x, y, depth, radius, name, node)
 */
let _sharedLayout = null;

export function calculateLayout(
  width,
  height,
  layoutZoom,
  nodes,
  mergedOptions,
) {
  if (!nodes?.length) {
    return [];
  }

  // Use a module-level shared CactusLayout instance so internal caches
  // (hierarchy cache, weight cache when input hasn't changed) persist between
  // calls. Avoid attaching properties to the function object which can trigger
  // type-checker/linters in some environments.
  if (!_sharedLayout) {
    _sharedLayout = new CactusLayout(
      width,
      height,
      layoutZoom,
      mergedOptions.overlap,
      mergedOptions.arcSpan,
      mergedOptions.sizeGrowthRate,
    );
  }

  const cactusLayout = _sharedLayout;

  // Update layout instance properties for the current request
  cactusLayout.width = width;
  cactusLayout.height = height;
  cactusLayout.zoom = layoutZoom;
  cactusLayout.overlap = mergedOptions.overlap;
  cactusLayout.arcSpan = mergedOptions.arcSpan;
  cactusLayout.sizeGrowthRate = mergedOptions.sizeGrowthRate;

  // Get NodeData objects from the layout and convert them to the lightweight
  // RenderedNode shape expected by the rest of the component (id, x, y, depth, radius, name).
  const nodeDatas = cactusLayout.render(
    nodes,
    width / 2,
    height / 2,
    mergedOptions.orientation,
  );

  if (!nodeDatas || nodeDatas.length === 0) return [];

  // Map CactusLayout NodeData -> RenderedNode
  const renderedNodes = nodeDatas.map((nd) => {
    const nodeObj = nd.node || {};
    return {
      id: nodeObj.id != null ? nodeObj.id : nd.id,
      x: nd.x,
      y: nd.y,
      depth: nd.depth,
      radius: nd.radius,
      name: nodeObj.name != null ? nodeObj.name : '',
      // Keep original node reference for consumers that need full metadata
      node: nodeObj,
    };
  });

  return renderedNodes;
}

/**
 * Computes zoom limits based on layout dimensions
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Array<any>} nodes - Array of node objects
 * @param {{ overlap: number, arcSpan: number, sizeGrowthRate: number, orientation: number, zoom: number }} mergedOptions - Merged options object
 * @returns {{ minZoomLimit: number, maxZoomLimit: number }} Object containing minZoomLimit and maxZoomLimit
 */
export function computeZoomLimits(width, height, nodes, mergedOptions) {
  if (!nodes?.length) {
    return { minZoomLimit: 0.1, maxZoomLimit: 10 };
  }

  // Reuse the module-level shared layout instance for bounds measurement to
  // avoid allocating a fresh CactusLayout each time. This preserves internal
  // caches and reduces repeated work when computeZoomLimits is called frequently.
  if (!_sharedLayout) {
    _sharedLayout = new CactusLayout(
      width,
      height,
      mergedOptions.zoom, // Use the base zoom from options
      mergedOptions.overlap,
      mergedOptions.arcSpan,
      mergedOptions.sizeGrowthRate,
    );
  } else {
    // Update instance properties for the current measurement request
    _sharedLayout.width = width;
    _sharedLayout.height = height;
    _sharedLayout.zoom = mergedOptions.zoom;
    _sharedLayout.overlap = mergedOptions.overlap;
    _sharedLayout.arcSpan = mergedOptions.arcSpan;
    _sharedLayout.sizeGrowthRate = mergedOptions.sizeGrowthRate;
  }

  const baseNodes = _sharedLayout.render(
    nodes,
    width / 2,
    height / 2,
    mergedOptions.orientation,
  );

  let minRadius = Infinity;
  let maxRadius = 0;

  // Find smallest and largest circle radii from base layout
  baseNodes.forEach((nodeData) => {
    const radius = nodeData.radius;
    minRadius = Math.min(minRadius, radius);
    maxRadius = Math.max(maxRadius, radius);
  });

  // Fallback values if no valid circles found
  if (!isFinite(minRadius) || minRadius <= 0) {
    minRadius = 1;
  }
  if (maxRadius <= 0) {
    maxRadius = 100;
  }

  // Maximum zoom: smallest circle's diameter should be 1/10 of smaller screen dimension
  const targetDiameter = Math.min(width, height) / 10;
  const maxZoomLimit = targetDiameter / (2 * minRadius);

  // Minimum zoom: ensure largest content fits comfortably in view
  // Make sure zoom=1.0 is always allowed as a reasonable starting point
  const minZoomLimit = Math.max(
    0.01,
    Math.min(0.5, Math.min(width, height) / (maxRadius * 8)),
  );

  return {
    minZoomLimit,
    maxZoomLimit,
  };
}

/**
 * Ensures parent references are properly set up on rendered nodes
 * @param {Array<any>} renderedNodes - Array of rendered node data
 * @returns {Array<any>} Nodes with proper parent references
 */
function setupParentReferences(renderedNodes) {
  const nodeMap = new Map();

  // Build lookup map
  renderedNodes.forEach((nodeData) => {
    nodeMap.set(nodeData.node.id, nodeData.node);
  });

  // Set parent references
  renderedNodes.forEach((nodeData) => {
    if (nodeData.node.parent && nodeMap.has(nodeData.node.parent)) {
      nodeData.node.parentRef = nodeMap.get(nodeData.node.parent);
    } else {
      nodeData.node.parentRef = null;
    }
  });

  return renderedNodes;
}

/**
 * Builds lookup maps for efficient node and hierarchy operations
 * @param {Array<any>} renderedNodes - Array of rendered node data
 * @param {{ depths?: Array<any> }} mergedStyle - Merged styles object
 * @returns {Object} Object containing all lookup maps and metadata
 */
export function buildLookupMaps(renderedNodes, mergedStyle) {
  // Ensure parent references are properly set up
  const nodesWithRefs = setupParentReferences(renderedNodes);
  // Create lookup maps for performance
  const nodeIdToRenderedNodeMap = new SvelteMap();
  const leafNodes = new SvelteSet();
  const negativeDepthNodes = new SvelteMap();
  const nodeIdToNodeMap = new SvelteMap();
  const depthStyleCache = new SvelteMap();
  const hierarchicalPathCache = new SvelteMap();
  const parentToChildrenNodeMap = new SvelteMap();

  // Build node mappings - use nodes with proper parent references
  nodesWithRefs.forEach((nodeData) => {
    nodeIdToRenderedNodeMap.set(nodeData.node.id, nodeData);
    nodeIdToNodeMap.set(nodeData.node.id, nodeData.node);
  });

  // Build parent-to-children node map for hierarchy analysis
  nodesWithRefs.forEach((nodeData) => {
    const parentId = nodeData.node.parent;
    if (parentId) {
      if (!parentToChildrenNodeMap.has(parentId)) {
        parentToChildrenNodeMap.set(parentId, []);
      }
      const children = parentToChildrenNodeMap.get(parentId);
      if (children) children.push(nodeData);
    }
  });

  // Build hierarchy analysis maps for faster lookups
  // Create a temporary parent-to-children map from the node structure
  const tempParentToChildrenMap = new SvelteMap();
  nodesWithRefs.forEach((nodeData) => {
    if (nodeData.node.parent) {
      if (!tempParentToChildrenMap.has(nodeData.node.parent)) {
        tempParentToChildrenMap.set(nodeData.node.parent, []);
      }
      const children = tempParentToChildrenMap.get(nodeData.node.parent);
      if (children) children.push(nodeData.node.id);
    }
  });

  // Identify leaves using the parent-children map
  nodesWithRefs.forEach(({ node }) => {
    const hasChildren = tempParentToChildrenMap.has(node.id);
    if (!hasChildren) {
      leafNodes.add(node.id);
    }
  });

  // Cache depth styles for performance
  if (mergedStyle.depths) {
    mergedStyle.depths.forEach((depthStyle) => {
      if (depthStyle.depth >= 0) {
        depthStyleCache.set(depthStyle.depth, depthStyle);
      }
    });
  }

  // Calculate negative depth mappings
  negativeDepthNodes.set(-1, new SvelteSet(leafNodes));

  let currentLevelNodes = new SvelteSet(leafNodes);
  let depthLevel = -2;

  while (currentLevelNodes.size > 0) {
    const nextLevelNodes = new SvelteSet();

    // Get all direct parents of current level
    currentLevelNodes.forEach((nodeId) => {
      const nodeData = nodeIdToNodeMap.get(nodeId);
      if (nodeData && nodeData.parent) {
        nextLevelNodes.add(nodeData.parent);
      }
    });

    if (nextLevelNodes.size === 0) break;

    negativeDepthNodes.set(depthLevel, new SvelteSet(nextLevelNodes));

    // Move upward for next iteration
    currentLevelNodes = nextLevelNodes;
    depthLevel--;
  }

  // Clear hierarchical path cache when layout changes
  hierarchicalPathCache.clear();

  return {
    nodeIdToRenderedNodeMap,
    leafNodes,
    negativeDepthNodes,
    nodeIdToNodeMap,
    depthStyleCache,
    hierarchicalPathCache,
    parentToChildrenNodeMap,
  };
}

/**
 * Updates parent references for hierarchy traversal
 * @param {Array<any>} nodes - Array of node objects
 * @returns {Array<any>} Array of nodes with updated parent references
 */
export function updateParentReferences(nodes) {
  const nodeMap = new Map();

  // First pass: create lookup map
  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  // Second pass: add parent references
  nodes.forEach((node) => {
    if (node.parent && nodeMap.has(node.parent)) {
      node.parentRef = nodeMap.get(node.parent);
    } else {
      node.parentRef = null;
    }
  });

  return nodes;
}

/**
 * Determines if rendering should proceed based on data availability and changes
 * @param {Array<any>} nodes - Array of node objects
 * @param {Array<any>} links - Array of link objects
 * @param {{ overlap: number, arcSpan: number, sizeGrowthRate: number, orientation: number, zoom: number }} mergedOptions - Merged options object
 * @param {{ fill: string, stroke: string, strokeWidth: number }} mergedStyle - Merged styles object
 * @returns {boolean} Whether rendering should proceed
 */
export function shouldRender(nodes, links, mergedOptions, mergedStyle) {
  const hasData = nodes && Array.isArray(nodes) && nodes.length > 0;

  if (!hasData) return false;

  // Prevent unused parameter warnings
  void links;
  void mergedOptions;
  void mergedStyle;

  // Let Svelte's reactivity handle change detection
  return true;
}

/**
 * Filters visible nodes based on screen bounds for performance
 * @param {Array<any>} renderedNodes - Array of rendered node data
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} panX - Pan offset X
 * @param {number} panY - Pan offset Y
 * @param {number} zoom - Current zoom level
 * @param {number} margin - Extra margin for culling
 * @returns {Array<any>} Filtered array of visible nodes
 */
export function filterVisibleNodes(
  renderedNodes,
  width,
  height,
  panX,
  panY,
  zoom,
  margin = 100,
) {
  const bounds = {
    left: -panX - margin,
    right: width - panX + margin,
    top: -panY - margin,
    bottom: height - panY + margin,
  };

  return renderedNodes.filter(({ x, y, radius }) => {
    const scaledRadius = radius * zoom;
    return (
      x + scaledRadius >= bounds.left &&
      x - scaledRadius <= bounds.right &&
      y + scaledRadius >= bounds.top &&
      y - scaledRadius <= bounds.bottom
    );
  });
}

/**
 * Optimizes rendering order for better performance
 * @param {Array<any>} renderedNodes - Array of rendered node data
 * @returns {Array<any>} Nodes sorted by optimal rendering order
 */
export function optimizeRenderingOrder(renderedNodes) {
  // Sort by radius (largest first) for better batching of drawing operations
  return [...renderedNodes].sort((a, b) => b.radius - a.radius);
}
