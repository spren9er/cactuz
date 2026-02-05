/**
 * CactusLayout
 *
 * Based on the paper
 * CactusTree: A Tree Drawing Approach for Hierarchical Edge Bundling
 * by Tommy Dang and Angus Forbes
 *
 * This implementation renders hierarchical datasets using a fractal-based
 * technique that recursively stacks child nodes on parent nodes.
 */

/**
 * @typedef {Object} TreeNode
 * @property {string|number} id - Unique identifier
 * @property {string} name - Display name
 * @property {string|number|null} parent - Parent node ID
 * @property {number} [weight] - Optional explicit weight
 * @property {TreeNode[]} [children] - Child nodes (built internally)
 * @property {TreeNode|null} [parentRef] - Parent node reference (built internally)
 */

/**
 * @typedef {Object} NodeData
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 * @property {number} radius - Node radius
 * @property {TreeNode} node - Reference to original tree node
 * @property {boolean} isLeaf - Whether this is a leaf node
 * @property {number} depth - Depth in hierarchy (0 = root)
 * @property {number} angle - Angle in radians (direction from parent to this node)
 */

/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} BoundingBox
 * @property {number} minX - Minimum X coordinate
 * @property {number} maxX - Maximum X coordinate
 * @property {number} minY - Minimum Y coordinate
 * @property {number} maxY - Maximum Y coordinate
 * @property {number} width - Width of bounding box
 * @property {number} height - Height of bounding box
 */

/**
 * @typedef {Object} ChildInfo
 * @property {TreeNode} child - Child node
 * @property {number} weight - Child node weight
 * @property {number} radius - Child node radius
 */

export class CactusLayout {
  /**
   * @param {number} width - Target width in pixels
   * @param {number} height - Target height in pixels
   * @param {number} zoom - Zoom factor
   * @param {number} overlap - Overlap factor (0 = no overlap, 1 = maximum overlap, negative values for gaps)
   * @param {number} arcSpan - Arc span in radians
   * @param {number} sizeGrowthRate - Growth rate for node sizes based on weight
   */
  constructor(
    width,
    height,
    zoom = 1,
    overlap = 0,
    arcSpan = Math.PI,
    sizeGrowthRate = 0.75, // Size growth rate between parent and child nodes (as in original paper)
  ) {
    this.width = width;
    this.height = height;
    this.zoom = zoom;
    this.overlap = overlap;
    this.arcSpan = arcSpan;
    this.sizeGrowthRate = sizeGrowthRate;

    /** @type {NodeData[]} */
    this.nodes = [];
    this.globalScale = 1;

    // Performance optimization caches
    this.weightCache = new Map();
    this.hierarchyCache = new Map();
    this.lastDataHash = null;
  }

  /**
   * Get radius of a node based on its weight (Algorithm 3 from paper)
   * @param {number} weight - The weight (number of leaf nodes) in the subtree
   * @returns {number} The radius for the node
   */
  getRadius(weight) {
    return Math.pow(weight, this.sizeGrowthRate);
  }

  /**
   * Calculate the weight of a node (number of leaf nodes in subtree)
   * @param {TreeNode} node - The node to calculate weight for
   * @returns {number} Total weight of the node
   */
  weight(node) {
    // Check cache first for performance
    if (this.weightCache.has(node.id)) {
      return this.weightCache.get(node.id);
    }

    let weight;
    if (node.weight !== undefined && node.weight !== null) {
      weight = node.weight;
    } else if (!node.children || node.children.length === 0) {
      weight = 1;
    } else {
      let totalWeight = 0;
      for (const child of node.children) {
        totalWeight += this.weight(child); // Recursive calls will hit cache
      }
      weight = totalWeight;
    }

    // Cache the result
    this.weightCache.set(node.id, weight);
    return weight;
  }

  /**
   * Sort child nodes by weight: leaf nodes first, then larger subtrees
   * @param {TreeNode[]} childList - List of child nodes
   * @returns {TreeNode[]} Sorted list of child nodes
   */
  sortChildNodesByWeight(childList) {
    // Use cached weights for efficient sorting
    return childList.slice().sort((a, b) => {
      const weightA = this.weightCache.get(a.id) || this.weight(a);
      const weightB = this.weightCache.get(b.id) || this.weight(b);
      return weightA - weightB;
    });
  }

  /**
   * Order sibling nodes - maximum weight in the center
   * @param {TreeNode[]} orderedList - List of nodes sorted by weight
   * @returns {TreeNode[]} List with max weight nodes in center
   */
  orderMaxInCenter(orderedList) {
    // Optimized center ordering using array pushing instead of expensive splicing
    const left = [];
    const right = [];

    for (let i = 0; i < orderedList.length; i++) {
      if (i % 2 === 0) {
        left.push(orderedList[i]);
      } else {
        right.unshift(orderedList[i]);
      }
    }

    return [...left, ...right];
  }

  /**
   * Main CactusLayout layout algorithm
   * @param {TreeNode} currentNode - The current node to draw
   * @param {number} x - X coordinate of the node center
   * @param {number} y - Y coordinate of the node center
   * @param {number} alpha - Orientation angle in radians (direction from parent)
   * @param {((nodeData: NodeData) => void)|null} drawCallback - Callback function to draw circles
   * @param {number} depth - Current depth in the tree (0 = root)
   */
  drawCactusLayout(currentNode, x, y, alpha, drawCallback, depth = 0) {
    const childList = currentNode.children || [];

    const nodeWeight = this.weight(currentNode); // Uses cache
    const radius = this.getRadius(nodeWeight);

    // Use Map for O(1) lookups instead of O(n) array.find()
    const childInfoMap = new Map();
    let totalArcNeeded = 0;

    for (const child of childList) {
      const childWeight = this.weight(child); // Uses cache
      const childRadius = this.getRadius(childWeight);
      const childInfo = { child, weight: childWeight, radius: childRadius };
      childInfoMap.set(child, childInfo);
      totalArcNeeded += 2 * childRadius;
    }

    const gapSpace = this.arcSpan * 0.1;
    const spacePerCircle =
      totalArcNeeded > 0 ? (this.arcSpan - gapSpace) / totalArcNeeded : 0;

    const nodeData = {
      x: x,
      y: y,
      radius: radius,
      node: currentNode,
      isLeaf: childList.length === 0,
      depth: depth,
      angle: alpha,
    };

    this.nodes.push(nodeData);

    if (childList.length === 0) {
      return;
    }

    const orderedList = this.sortChildNodesByWeight(childList);
    const centeredList = this.orderMaxInCenter(orderedList);

    let childAlpha = alpha - this.arcSpan / 2;

    for (const child of centeredList) {
      const info = childInfoMap.get(child); // O(1) lookup!
      if (!info) continue;

      const childRadius = info.radius;
      const childDiameter = 2 * childRadius;

      const diameterArc = childDiameter * spacePerCircle;
      const gap = childList.length > 0 ? gapSpace / childList.length : 0;
      const angleSpan = diameterArc + gap;

      childAlpha += angleSpan / 2;

      const currentOverlap = this.overlap;
      const distance = radius + childRadius * (1 - 2 * currentOverlap);
      const x2 = x + distance * Math.cos(childAlpha);
      const y2 = y + distance * Math.sin(childAlpha);

      this.drawCactusLayout(child, x2, y2, childAlpha, drawCallback, depth + 1);

      childAlpha += angleSpan / 2;
    }
  }

  /**
   * Find the lowest common ancestor of two nodes
   * @param {TreeNode} node1 - First node
   * @param {TreeNode} node2 - Second node
   * @returns {TreeNode|null} The lowest common ancestor node
   */
  findLowestCommonAncestor(node1, node2) {
    /**
     * @param {TreeNode} node
     * @returns {TreeNode[]}
     */
    const getAncestors = (node) => {
      /** @type {TreeNode[]} */
      const ancestors = [];
      /** @type {TreeNode|null|undefined} */
      let current = node;
      while (current) {
        ancestors.push(current);
        current = current.parentRef;
      }
      return ancestors;
    };

    const ancestors1 = getAncestors(node1);
    const ancestors2 = getAncestors(node2);

    for (let i = ancestors1.length - 1; i >= 0; i--) {
      for (let j = ancestors2.length - 1; j >= 0; j--) {
        if (ancestors1[i] === ancestors2[j]) {
          return ancestors1[i];
        }
      }
    }
    return null;
  }

  /**
   * Generate hierarchical edge bundling path between two nodes
   * @param {NodeData} sourceNode - Source node data
   * @param {NodeData} targetNode - Target node data
   * @param {number} tension - Bundling tension (0 = straight line, 1 = full bundling)
   * @returns {Point[]} Array of {x, y} points for the bundled path
   */
  generateBundledPath(sourceNode, targetNode, tension = 0.85) {
    const source = sourceNode.node;
    const target = targetNode.node;

    // Find the path through the hierarchy
    const sourcePath = this.getPathToRoot(source);
    const targetPath = this.getPathToRoot(target);

    // Find the lowest common ancestor
    let lca = null;
    for (let i = 0; i < Math.min(sourcePath.length, targetPath.length); i++) {
      if (
        sourcePath[sourcePath.length - 1 - i] ===
        targetPath[targetPath.length - 1 - i]
      ) {
        lca = sourcePath[sourcePath.length - 1 - i];
      } else {
        break;
      }
    }

    if (!lca) {
      return [
        { x: sourceNode.x, y: sourceNode.y },
        { x: targetNode.x, y: targetNode.y },
      ];
    }

    // Build the full hierarchical path
    const lcaIndex = sourcePath.indexOf(lca);
    const hierarchicalNodes = [
      ...sourcePath.slice(0, lcaIndex + 1),
      ...targetPath.slice(0, targetPath.indexOf(lca)).reverse(),
    ];

    // Convert to NodeData positions
    const pathPoints = hierarchicalNodes
      .map((node) => {
        const nodeData = this.nodes.find((n) => n.node === node);
        return nodeData ? { x: nodeData.x, y: nodeData.y } : null;
      })
      .filter((p) => p !== null);

    if (pathPoints.length < 2) {
      return [
        { x: sourceNode.x, y: sourceNode.y },
        { x: targetNode.x, y: targetNode.y },
      ];
    }

    // Generate spline curve with tension (reduced segments for performance)
    return this.generateSplineCurve(pathPoints, tension, 8);
  }

  /**
   * Get path from node to root
   * @param {TreeNode} node - Starting node
   * @returns {TreeNode[]} Path to root
   */
  getPathToRoot(node) {
    const path = [];
    /** @type {TreeNode|null} */
    let current = node;
    while (current) {
      path.push(current);
      current = current.parentRef || null;
    }
    return path;
  }

  /**
   * Generate a smooth spline curve through points with tension control
   * @param {Point[]} points - Control points
   * @param {number} tension - Curve tension (0-1)
   * @param {number} segments - Number of segments between points
   * @returns {Point[]} Smooth curve points
   */
  generateSplineCurve(points, tension, segments) {
    if (points.length < 2) return points;
    if (points.length === 2) return points;

    const result = [];

    // Add first point
    result.push(points[0]);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let t = 0; t < segments; t++) {
        const u = t / segments;
        const splinePoint = this.catmullRomSpline(p0, p1, p2, p3, u, tension);
        result.push(splinePoint);
      }
    }

    // Add last point
    result.push(points[points.length - 1]);
    return result;
  }

  /**
   * Catmull-Rom spline interpolation with tension
   * @param {Point} p0 - Control point 0
   * @param {Point} p1 - Control point 1
   * @param {Point} p2 - Control point 2
   * @param {Point} p3 - Control point 3
   * @param {number} t - Parameter (0-1)
   * @param {number} tension - Tension factor
   * @returns {Point} Interpolated point
   */
  catmullRomSpline(p0, p1, p2, p3, t, tension) {
    const t2 = t * t;
    const t3 = t2 * t;

    // Tension-adjusted coefficients
    const factor = tension * 0.5;

    const x =
      2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3;

    const y =
      2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3;

    return {
      x: x * factor + p1.x * (1 - factor) + (p2.x - p1.x) * t * (1 - factor),
      y: y * factor + p1.y * (1 - factor) + (p2.y - p1.y) * t * (1 - factor),
    };
  }

  /**
   * Calculate bounding box of all nodes
   * @returns {BoundingBox} Bounding box with minX, maxX, minY, maxY, width, height
   */
  calculateBoundingBox() {
    if (this.nodes.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    this.nodes.forEach((node) => {
      minX = Math.min(minX, node.x - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      minY = Math.min(minY, node.y - node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
    });

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Main rendering function
   * @param {TreeNode[]|TreeNode} input - Array of nodes or single root node
   * @param {number} startX - Starting X coordinate
   * @param {number} startY - Starting Y coordinate
   * @param {number} startAngle - Starting angle in radians (default: π for upward growth)

   * @returns {NodeData[]} Array of node data with positions and radii
   */
  render(input, startX, startY, startAngle = -Math.PI / 2) {
    this.nodes = [];
    this.weightCache.clear(); // Clear cache for fresh calculation

    // Use cached hierarchy if possible
    const root = this.getCachedHierarchy(input);

    // Store original settings for restoration
    const refOverlap = this.overlap;
    const refArcSpan = this.arcSpan;

    // First pass: calculate layout with standard settings to get bounding box
    this.overlap = 0;
    this.arcSpan = Math.PI;

    this.drawCactusLayout(root, 0, 0, startAngle, null);

    const bbox = this.calculateBoundingBox();

    const scaleX = bbox.width > 0 ? this.width / bbox.width : 1;
    const scaleY = bbox.height > 0 ? this.height / bbox.height : 1;
    this.globalScale = Math.min(scaleX, scaleY) * this.zoom * 0.95;

    // Restore original settings
    this.overlap = refOverlap;
    this.arcSpan = refArcSpan;

    // Second pass: layout with actual settings and apply scaling
    this.nodes = [];
    this.drawCactusLayout(root, 0, 0, startAngle, null);

    const scaledBBox = this.calculateBoundingBox();
    const offsetX =
      this.width / 2 -
      (scaledBBox.minX + scaledBBox.width / 2) * this.globalScale;
    const offsetY =
      this.height / 2 -
      (scaledBBox.minY + scaledBBox.height / 2) * this.globalScale;

    this.nodes.forEach((node) => {
      node.x = node.x * this.globalScale + offsetX;
      node.y = node.y * this.globalScale + offsetY;
      node.radius = node.radius * this.globalScale;
    });

    // Sort nodes by depth in ascending order
    this.nodes.sort((a, b) => a.depth - b.depth);

    return this.nodes;
  }

  /**
   * Build hierarchy from flat array of nodes
   * @param {TreeNode[]} nodeArray - Flat array of nodes
   * @returns {TreeNode} Root node with built hierarchy
   */
  /**
   * Get cached hierarchy or build new one
   * @param {TreeNode[]|TreeNode} input
   * @returns {TreeNode}
   */
  getCachedHierarchy(input) {
    const dataHash = this.hashData(input);

    if (this.lastDataHash === dataHash && this.hierarchyCache.has(dataHash)) {
      return this.hierarchyCache.get(dataHash);
    }

    // Build new hierarchy
    let root;
    if (Array.isArray(input)) {
      root = this.buildHierarchyFromArray(input);
    } else {
      root = input;
      this.setParentReferences(root, null);
    }

    // Cache it
    this.hierarchyCache.set(dataHash, root);
    this.lastDataHash = dataHash;

    return root;
  }

  /**
   * Simple hash function for input data
   * @param {TreeNode[]|TreeNode} input
   * @returns {string}
   */
  hashData(input) {
    if (Array.isArray(input)) {
      // Simple hash to avoid circular reference issues
      const first = input[0] || {};
      const last = input[input.length - 1] || {};
      return `${input.length}-${first.id || 'none'}-${first.name || 'none'}-${last.id || 'none'}-${last.name || 'none'}`;
    }
    // For object input, create a simple hash without circular references
    return `single-${input.id || 'root'}-${input.name || 'unnamed'}`;
  }

  /**
   * Calculate maximum depth of tree for estimation
   * @param {TreeNode} node
   * @returns {number}
   */
  calculateMaxDepth(node) {
    if (!node.children || node.children.length === 0) {
      return 0;
    }

    let maxChildDepth = 0;
    for (const child of node.children) {
      maxChildDepth = Math.max(maxChildDepth, this.calculateMaxDepth(child));
    }

    return maxChildDepth + 1;
  }

  buildHierarchyFromArray(nodeArray) {
    const nodeMap = new Map();

    // Create lookup map
    nodeArray.forEach((node) => {
      node.children = [];
      node.parentRef = null;
      nodeMap.set(node.id, node);
    });

    // Build parent-child relationships
    let root = null;
    nodeArray.forEach((node) => {
      if (node.parent) {
        const parentNode = nodeMap.get(node.parent);
        if (parentNode) {
          parentNode.children.push(node);
          node.parentRef = parentNode;
        }
      } else {
        root = node; // This is the root
      }
    });

    return root || { id: 'empty', name: 'empty', parent: null, children: [] };
  }

  /**
   * Set parent references for all nodes in the tree
   * @param {TreeNode} node - Current node
   * @param {TreeNode|null} parent - Parent node
   */
  setParentReferences(node, parent) {
    node.parentRef = parent;
    if (node.children) {
      for (const child of node.children) {
        this.setParentReferences(child, node);
      }
    }
  }
}

// Export for use in different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CactusLayout;
}
