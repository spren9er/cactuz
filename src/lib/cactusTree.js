/**
 * CactusTree: A Tree Drawing Approach for Hierarchical Edge Bundling
 * Based on the paper by Tommy Dang and Angus Forbes
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

export class CactusTree {
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
    if (node.weight !== undefined && node.weight !== null) {
      return node.weight;
    }

    if (!node.children || node.children.length === 0) {
      return 1;
    }

    let totalWeight = 0;
    for (const child of node.children) {
      totalWeight += this.weight(child);
    }
    return totalWeight;
  }

  /**
   * Sort child nodes by weight: leaf nodes first, then larger subtrees
   * @param {TreeNode[]} childList - List of child nodes
   * @returns {TreeNode[]} Sorted list of child nodes
   */
  sortChildNodesByWeight(childList) {
    return childList.slice().sort((a, b) => {
      const weightA = this.weight(a);
      const weightB = this.weight(b);
      return weightA - weightB;
    });
  }

  /**
   * Order sibling nodes - maximum weight in the center
   * @param {TreeNode[]} orderedList - List of nodes sorted by weight
   * @returns {TreeNode[]} List with max weight nodes in center
   */
  orderMaxInCenter(orderedList) {
    /** @type {TreeNode[]} */
    const centeredList = [];

    for (const node of orderedList) {
      const middleIndex = Math.floor(centeredList.length / 2);
      centeredList.splice(middleIndex, 0, node);
    }

    return centeredList;
  }

  /**
   * Main CactusTree layout algorithm
   * @param {TreeNode} currentNode - The current node to draw
   * @param {number} x - X coordinate of the node center
   * @param {number} y - Y coordinate of the node center
   * @param {number} alpha - Orientation angle in radians (direction from parent)
   * @param {((nodeData: NodeData) => void)|null} drawCallback - Callback function to draw circles
   * @param {number} depth - Current depth in the tree (0 = root)
   */
  drawCactusTree(currentNode, x, y, alpha, drawCallback, depth = 0) {
    const childList = currentNode.children || [];

    const nodeWeight = this.weight(currentNode);
    const radius = this.getRadius(nodeWeight);

    let totalArcNeeded = 0;
    /** @type {ChildInfo[]} */
    const childInfo = [];
    for (const child of childList) {
      const childWeight = this.weight(child);
      const childRadius = this.getRadius(childWeight);
      childInfo.push({ child, weight: childWeight, radius: childRadius });
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
    };

    this.nodes.push(nodeData);

    if (childList.length === 0) {
      return;
    }

    const orderedList = this.sortChildNodesByWeight(childList);
    const centeredList = this.orderMaxInCenter(orderedList);

    let childAlpha = alpha - this.arcSpan / 2;

    for (const child of centeredList) {
      const info = childInfo.find((ci) => ci.child === child);
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

      this.drawCactusTree(child, x2, y2, childAlpha, drawCallback, depth + 1);

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
   * @param {number} beta - Bundling strength (0 = straight line, 1 = full bundling)
   * @returns {Point[]} Array of {x, y} points for the bundled path
   */
  generateBundledPath(sourceNode, targetNode, beta = 0.85) {
    const source = sourceNode.node;
    const target = targetNode.node;

    const lca = this.findLowestCommonAncestor(source, target);
    if (!lca) {
      return [
        { x: sourceNode.x, y: sourceNode.y },
        { x: targetNode.x, y: targetNode.y },
      ];
    }

    /** @type {NodeData[]} */
    const pathNodes = [];

    let current = source.parentRef;
    while (current && current !== lca) {
      const nodeData = this.nodes.find((n) => n.node === current);
      if (nodeData) pathNodes.push(nodeData);
      current = current.parentRef;
    }

    const lcaData = this.nodes.find((n) => n.node === lca);
    if (lcaData) pathNodes.push(lcaData);

    /** @type {NodeData[]} */
    const targetPath = [];
    current = target.parentRef;
    while (current && current !== lca) {
      const nodeData = this.nodes.find((n) => n.node === current);
      if (nodeData) targetPath.unshift(nodeData);
      current = current.parentRef;
    }
    pathNodes.push(...targetPath);

    /** @type {Point[]} */
    const points = [];
    points.push({ x: sourceNode.x, y: sourceNode.y });

    if (pathNodes.length > 0) {
      for (let i = 0; i < pathNodes.length; i++) {
        const bundledX =
          sourceNode.x +
          beta * (pathNodes[i].x - sourceNode.x) +
          (1 - beta) *
            ((i + 1) / (pathNodes.length + 1)) *
            (targetNode.x - sourceNode.x);
        const bundledY =
          sourceNode.y +
          beta * (pathNodes[i].y - sourceNode.y) +
          (1 - beta) *
            ((i + 1) / (pathNodes.length + 1)) *
            (targetNode.y - sourceNode.y);
        points.push({ x: bundledX, y: bundledY });
      }
    }

    points.push({ x: targetNode.x, y: targetNode.y });
    return points;
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

    // Handle both array input and legacy tree input
    let root;
    if (Array.isArray(input)) {
      root = this.buildHierarchyFromArray(input);
    } else {
      root = input;
      this.setParentReferences(root, null);
    }

    const refOverlap = this.overlap;
    const refArcSpan = this.arcSpan;

    this.overlap = 0;
    this.arcSpan = Math.PI;

    this.drawCactusTree(root, 0, 0, startAngle, null);

    const bbox = this.calculateBoundingBox();

    const scaleX = bbox.width > 0 ? this.width / bbox.width : 1;
    const scaleY = bbox.height > 0 ? this.height / bbox.height : 1;
    this.globalScale = Math.min(scaleX, scaleY) * this.zoom * 0.95;

    this.overlap = refOverlap;
    this.arcSpan = refArcSpan;

    this.nodes = [];
    this.drawCactusTree(root, 0, 0, startAngle, null);

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
  module.exports = CactusTree;
}
