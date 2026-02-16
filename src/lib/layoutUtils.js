/**
 * Layout utilities for CactusTree
 * Handles layout calculations, lookup maps, and performance optimization
 */

import { CactusLayout } from './cactusLayout.js';
import { expandWildcardDepths } from './colorScale.js';

/** @type {CactusLayout | null} */
let _sharedLayout = null;

/**
 * Calculates the layout using CactusLayout
 *
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} layoutZoom - Layout zoom level (already combined zoom)
 * @param {Array<any>} nodes - Array of node objects (each: { id, name, parent, weight? })
 * @param {{ overlap:number, arcSpan:number, sizeGrowthRate:number, orientation:number, zoom:number }} mergedOptions - Merged options object
 * @returns {Array<any>} Array of rendered node data
 */
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
      id: nodeObj.id != null ? nodeObj.id : '',
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
 * Computes zoom limits directly from already-rendered nodes, avoiding a redundant layout pass.
 * The rendered nodes include the interactive zoom factor, so we divide it out to get base radii.
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Array<any>} renderedNodes - Already computed rendered node array
 * @param {number} [currentInteractiveZoom=1] - The interactive zoom factor applied during layout
 * @returns {{ minZoomLimit: number, maxZoomLimit: number }}
 */
export function computeZoomLimitsFromNodes(
  width,
  height,
  renderedNodes,
  currentInteractiveZoom = 1,
) {
  if (!renderedNodes || renderedNodes.length === 0) {
    return { minZoomLimit: 0.1, maxZoomLimit: 10 };
  }

  let minRadius = Infinity;
  let maxRadius = 0;

  for (const nodeData of renderedNodes) {
    const radius = nodeData.radius;
    if (radius > 0) {
      if (radius < minRadius) minRadius = radius;
      if (radius > maxRadius) maxRadius = radius;
    }
  }

  if (!isFinite(minRadius) || minRadius <= 0) minRadius = 1;
  if (maxRadius <= 0) maxRadius = 100;

  // Divide out interactive zoom to get base radii (zoom=1)
  const zoomFactor = currentInteractiveZoom > 0 ? currentInteractiveZoom : 1;
  const baseMinRadius = minRadius / zoomFactor;
  const baseMaxRadius = maxRadius / zoomFactor;

  const targetDiameter = Math.min(width, height) / 10;
  const maxZoomLimit = targetDiameter / (2 * baseMinRadius);

  const minZoomLimit = Math.max(
    0.01,
    Math.min(0.5, Math.min(width, height) / (baseMaxRadius * 8)),
  );

  return { minZoomLimit, maxZoomLimit };
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
  const nodeIdToRenderedNodeMap = new Map();
  const leafNodes = new Set();
  const negativeDepthNodes = new Map();
  const nodeIdToNodeMap = new Map();
  const depthStyleCache = new Map();
  const hierarchicalPathCache = new Map();
  const parentToChildrenNodeMap = new Map();

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
  const tempParentToChildrenMap = new Map();
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

  // Compute max depth from rendered nodes
  let maxDepth = 0;
  nodesWithRefs.forEach((nodeData) => {
    if (nodeData.depth > maxDepth) maxDepth = nodeData.depth;
  });

  // Expand wildcard depth entries (depth: '*') with color scales
  const expandedDepths = expandWildcardDepths(
    mergedStyle.depths || [],
    maxDepth,
  );

  // Store expanded depths back for resolveDepthStyle to iterate in order
  mergedStyle.depths = expandedDepths;

  // Calculate negative depth mappings
  negativeDepthNodes.set(-1, new Set(leafNodes));

  let currentLevelNodes = new Set(leafNodes);
  let depthLevel = -2;

  while (currentLevelNodes.size > 0) {
    const nextLevelNodes = new Set();

    // Get all direct parents of current level
    currentLevelNodes.forEach((nodeId) => {
      const nodeData = nodeIdToNodeMap.get(nodeId);
      if (nodeData && nodeData.parent) {
        nextLevelNodes.add(nodeData.parent);
      }
    });

    if (nextLevelNodes.size === 0) break;

    negativeDepthNodes.set(depthLevel, new Set(nextLevelNodes));

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
