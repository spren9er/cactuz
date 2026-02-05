<script>
  import { SvelteSet, SvelteMap } from 'svelte/reactivity';

  import { CactusLayout } from '$lib/cactusLayout.js';

  /** @type {{ width: number, height: number, nodes: Array<{id: string, name: string, parent: string|null, weight?: number}>, links?: Array<{source: string, target: string}>, options?: {overlap?: number, arcSpan?: number, sizeGrowthRate?: number, orientation?: number, zoom?: number}, styles?: {fill?: string, fillOpacity?: number, stroke?: string, strokeWidth?: number, strokeOpacity?: number, label?: string, labelFontFamily?: string, lineWidth?: number, line?: string, edge?: string, edgeWidth?: number, edgeOpacity?: number, highlightFill?: string, highlightStroke?: string, highlight?: boolean, labelLimit?: number, depths?: Array<{depth: number, fill?: string, fillOpacity?: number, stroke?: string, strokeWidth?: number, strokeOpacity?: number, label?: string, labelFontFamily?: string, lineWidth?: number, line?: string, highlightFill?: string, highlightStroke?: string, highlight?: boolean}>}, pannable?: boolean, zoomable?: boolean }} */
  let {
    width,
    height,
    nodes,
    links = [],
    options = {},
    styles = {},
    pannable = true,
    zoomable = true,
  } = $props();

  const defaultOptions = {
    overlap: 0.5,
    arcSpan: (5 * Math.PI) / 4,
    sizeGrowthRate: 0.75,
    orientation: -Math.PI / 2,
    zoom: 1.0,
  };
  const mergedOptions = $derived({ ...defaultOptions, ...options });

  const defaultStyle = {
    fill: '#efefef',
    fillOpacity: 1,
    stroke: '#333333',
    strokeWidth: 1,
    strokeOpacity: 1,
    label: '#333333',
    labelFontFamily: 'monospace',
    lineWidth: 1,
    line: '#333333',
    edge: '#ff6b6b',
    edgeWidth: 1,
    edgeOpacity: 0.1,
    highlightFill: '#ffcc99',
    highlightStroke: '#ff6600',
    highlight: true,
    labelLimit: 50,
  };
  const mergedStyle = $derived({ ...defaultStyle, ...styles });

  /** @type {HTMLCanvasElement} */
  let canvas;

  /** @type {CanvasRenderingContext2D|null} */
  let ctx = null;

  let devicePixelRatio = 1;

  /** @type {string|null} */
  let hoveredNodeId = null;

  /** @type {Array<{x: number, y: number, radius: number, node: any, isLeaf: boolean, depth: number, angle: number}>} */
  let renderedNodes = [];

  /** @type {SvelteMap<string, any>} */
  let nodeIdToRenderedNodeMap = new SvelteMap();

  // Performance counters for radius filtering
  let totalNodes = 0;
  let filteredNodes = 0;
  let renderedNodesCount = 0;

  // Cached hierarchy analysis (moved from draw function)
  let leafNodes = new SvelteSet();
  let negativeDepthNodes = new SvelteMap();
  let nodeIdToNodeMap = new SvelteMap();

  /** @type {SvelteMap<number, any>} */
  let depthStyleCache = new SvelteMap();

  /** @type {SvelteMap<string, any[]>} */
  let hierarchicalPathCache = new SvelteMap();

  /** @type {SvelteMap<string, any[]>} */
  let parentToChildrenNodeMap = new SvelteMap();

  /** @type {CactusLayout|null} */
  let cactusLayout = null;

  // Pan and zoom state
  let panX = 0;
  let panY = 0;
  let currentZoom = 1;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Zoom limits computed upfront after layout calculation
  let minZoomLimit = 0.01;
  let maxZoomLimit = 100.0;

  /** @type {number|null} */
  let animationFrameId = null;

  // Drawing constants
  const TEXT_PADDING = 2;

  /**
   * Get rendering performance statistics
   * @returns {{total: number, rendered: number, filtered: number, filterRatio: number}} Performance metrics
   */
  export function getPerformanceStats() {
    return {
      total: totalNodes,
      rendered: renderedNodesCount,
      filtered: filteredNodes,
      filterRatio: totalNodes > 0 ? filteredNodes / totalNodes : 0,
    };
  }

  function setupCanvas() {
    if (!canvas) return;

    devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function calculateLayout() {
    if (!nodes?.length) {
      renderedNodes = [];
      return;
    }

    cactusLayout = new CactusLayout(
      width,
      height,
      mergedOptions.zoom * currentZoom,
      mergedOptions.overlap,
      mergedOptions.arcSpan,
      mergedOptions.sizeGrowthRate,
    );

    renderedNodes = cactusLayout.render(
      nodes,
      width / 2,
      height / 2,
      mergedOptions.orientation,
    );

    buildLookupMaps();
    computeZoomLimits();
  }

  function computeZoomLimits() {
    // Calculate limits based on base layout (zoom = 1.0) to get correct bounds
    // First, calculate base layout without zoom factor
    const baseLayout = new CactusLayout(
      width,
      height,
      mergedOptions.zoom, // Use base zoom, not multiplied by currentZoom
      mergedOptions.overlap,
      mergedOptions.arcSpan,
      mergedOptions.sizeGrowthRate,
    );

    const baseNodes = baseLayout.render(
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
    maxZoomLimit = targetDiameter / (2 * minRadius);

    // Minimum zoom: ensure largest content fits comfortably in view
    // Make sure zoom=1.0 is always allowed as a reasonable starting point
    minZoomLimit = Math.max(
      0.01,
      Math.min(0.5, Math.min(width, height) / (maxRadius * 8)),
    );
  }

  function buildLookupMaps() {
    // Clear and rebuild node lookup map
    nodeIdToRenderedNodeMap.clear();
    renderedNodes.forEach((nodeData) => {
      nodeIdToRenderedNodeMap.set(nodeData.node.id, nodeData);
    });

    // Clear and rebuild depth style cache
    depthStyleCache.clear();
    if (mergedStyle.depths) {
      mergedStyle.depths.forEach((ds) => {
        depthStyleCache.set(ds.depth, ds);
      });
    }

    // Build parent-to-children node map efficiently (O(n) instead of O(n²))
    parentToChildrenNodeMap.clear();
    renderedNodes.forEach((nodeData) => {
      const parentId = nodeData.node.parent;
      if (parentId) {
        if (!parentToChildrenNodeMap.has(parentId)) {
          parentToChildrenNodeMap.set(parentId, []);
        }
        const children = parentToChildrenNodeMap.get(parentId);
        if (children) children.push(nodeData);
      }
    });

    // Build hierarchy analysis maps (moved from draw function for performance)
    // Build parent-to-children map for faster lookups from original nodes
    const tempParentToChildrenMap = new SvelteMap();
    nodes.forEach((node) => {
      if (node.parent) {
        if (!tempParentToChildrenMap.has(node.parent)) {
          tempParentToChildrenMap.set(node.parent, []);
        }
        const children = tempParentToChildrenMap.get(node.parent);
        if (children) children.push(node.id);
      }
    });

    // Identify leaves using the parent-children map
    leafNodes.clear();
    renderedNodes.forEach(({ node }) => {
      const hasChildren = tempParentToChildrenMap.has(node.id);
      if (!hasChildren) {
        leafNodes.add(node.id);
      }
    });

    // Calculate negative depth mappings
    negativeDepthNodes.clear();
    negativeDepthNodes.set(-1, new SvelteSet(leafNodes));

    // Build node id to node map for faster lookups
    nodeIdToNodeMap.clear();
    nodes.forEach((node) => {
      nodeIdToNodeMap.set(node.id, node);
    });

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

      const filteredNodes = new SvelteSet();

      // Build parent-child relationships efficiently for this level
      const levelParentMap = new SvelteMap();
      nextLevelNodes.forEach((nodeId) => {
        const nodeData = nodeIdToNodeMap.get(nodeId);
        if (nodeData && nodeData.parent) {
          if (!levelParentMap.has(nodeData.parent)) {
            levelParentMap.set(nodeData.parent, []);
          }
          levelParentMap.get(nodeData.parent).push(nodeId);
        }
      });

      // Filter nodes that don't have children in the same level
      nextLevelNodes.forEach((nodeId) => {
        const hasChildInSameLevel = levelParentMap.has(nodeId);
        if (!hasChildInSameLevel) {
          filteredNodes.add(nodeId);
        }
      });

      if (filteredNodes.size > 0) {
        negativeDepthNodes.set(depthLevel, filteredNodes);
      }

      currentLevelNodes = nextLevelNodes;
      depthLevel--;
    }

    // Clear hierarchical path cache when layout changes
    hierarchicalPathCache.clear();
  }

  /**
   * @param {any} depthStyle
   * @param {any} mergedStyle
   * @param {string} property
   */
  function getEffectiveStyle(depthStyle, mergedStyle, property) {
    return depthStyle?.[property] ?? mergedStyle[property];
  }

  function setupCanvasContext() {
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(panX, panY);
  }

  function drawConnectingLines() {
    if (mergedOptions.overlap >= 0 || !ctx) return;

    renderedNodes.forEach((nodeData) => {
      const { x, y, node, depth } = nodeData;
      const children = parentToChildrenNodeMap.get(node.id) || [];

      children.forEach((child) => {
        const depthStyle = depthStyleCache.get(depth);
        const currentLineWidth = getEffectiveStyle(
          depthStyle,
          mergedStyle,
          'lineWidth',
        );
        const currentLineColor = getEffectiveStyle(
          depthStyle,
          mergedStyle,
          'line',
        );

        if (currentLineWidth > 0 && currentLineColor !== 'none' && ctx) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(child.x, child.y);
          ctx.strokeStyle = currentLineColor;
          ctx.lineWidth = currentLineWidth;
          ctx.stroke();
        }
      });
    });
  }

  /**
   * Main rendering function with performance optimization for large datasets
   *
   * This function implements radius-based culling to improve performance when
   * rendering thousands of nodes. Nodes with screen-space radius less than 1px
   * are skipped during rendering since they would be too small to see anyway.
   *
   * Performance benefits:
   * - Reduces fill/stroke operations for tiny nodes
   * - Skips text rendering for invisible labels
   * - Improves hover detection by ignoring micro-nodes
   * - Can provide 30-50% performance improvement with deep hierarchies
   */
  function draw() {
    if (!canvas || !ctx || !renderedNodes.length) return;

    // Reset performance counters
    totalNodes = renderedNodes.length;
    filteredNodes = 0;
    renderedNodesCount = 0;

    setupCanvasContext();
    drawConnectingLines();

    // Collect visible node IDs from valid links for leaf label filtering
    /** @type {SvelteSet<string>} */
    const visibleNodeIds = new SvelteSet();

    // Use pre-calculated hierarchy analysis (moved to buildLookupMaps for performance)

    // First pass: Draw circles only (no labels)

    renderedNodes.forEach(
      (
        /** @type {{ x: number, y: number, radius: number, node: any, depth: number }} */ {
          x,
          y,
          radius,
          node,
          depth,
        },
      ) => {
        if (!ctx) return;

        // Skip nodes with screen radius less than 1px for performance
        const screenRadius = radius;
        if (screenRadius < 1) {
          filteredNodes++;
          return;
        }

        renderedNodesCount++;

        // Find applicable depth style using cache
        let depthStyle = depthStyleCache.get(depth);

        // Handle negative depths if no direct match
        if (!depthStyle && mergedStyle.depths) {
          for (const ds of mergedStyle.depths) {
            if (ds.depth < 0) {
              const nodesAtThisNegativeDepth = negativeDepthNodes.get(ds.depth);
              if (
                nodesAtThisNegativeDepth &&
                nodesAtThisNegativeDepth.has(node.id)
              ) {
                depthStyle = ds;
                break;
              }
            }
          }
        }

        // Get style values with depth-specific overrides
        const currentFill = depthStyle?.fill ?? mergedStyle.fill;
        const currentFillOpacity =
          depthStyle?.fillOpacity ?? mergedStyle.fillOpacity;
        const currentStroke = depthStyle?.stroke ?? mergedStyle.stroke;
        const currentStrokeWidth =
          depthStyle?.strokeWidth ?? mergedStyle.strokeWidth;
        const currentStrokeOpacity =
          depthStyle?.strokeOpacity ?? mergedStyle.strokeOpacity;
        const currentHighlight = depthStyle?.highlight ?? mergedStyle.highlight;

        // Check if this node is hovered and highlighting is enabled
        const isHovered = hoveredNodeId === node.id && currentHighlight;
        const finalFill = isHovered
          ? (depthStyle?.highlightFill ?? mergedStyle.highlightFill)
          : currentFill;
        const finalStroke = isHovered
          ? (depthStyle?.highlightStroke ?? mergedStyle.highlightStroke)
          : currentStroke;

        // Create circle path
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);

        // Batch fill operations
        if (finalFill !== 'none') {
          if (ctx.globalAlpha !== currentFillOpacity) {
            ctx.globalAlpha = currentFillOpacity;
          }
          if (ctx.fillStyle !== finalFill) {
            ctx.fillStyle = finalFill;
          }
          ctx.fill();
        }

        // Batch stroke operations
        if (finalStroke !== 'none' && currentStrokeWidth > 0) {
          if (ctx.globalAlpha !== currentStrokeOpacity) {
            ctx.globalAlpha = currentStrokeOpacity;
          }
          if (ctx.strokeStyle !== finalStroke) {
            ctx.strokeStyle = finalStroke;
          }
          if (ctx.lineWidth !== currentStrokeWidth) {
            ctx.lineWidth = currentStrokeWidth;
          }
          ctx.stroke();
        }

        // Reset alpha only if changed
        if (ctx.globalAlpha !== 1.0) {
          ctx.globalAlpha = 1.0;
        }
      },
    );

    // Second pass: Draw hierarchical edge bundling
    // Group links by their hierarchical paths for bundling
    /** @type {Array<{link: any, sourceNode: any, targetNode: any, hierarchicalPath: any[], lca: any}>} */
    const validLinks = [];

    if (links?.length && cactusLayout && ctx) {
      // First pass: collect all valid links and build hierarchical paths
      links.forEach((link) => {
        const sourceNode = nodeIdToRenderedNodeMap.get(link.source);
        const targetNode = nodeIdToRenderedNodeMap.get(link.target);

        if (sourceNode && targetNode) {
          // Filter links based on hover state (only for leaf nodes)
          if (hoveredNodeId !== null) {
            const hoveredNode = nodeIdToRenderedNodeMap.get(hoveredNodeId);
            const isLeafNode =
              hoveredNode && !parentToChildrenNodeMap.has(hoveredNodeId);

            if (isLeafNode) {
              if (
                link.source !== hoveredNodeId &&
                link.target !== hoveredNodeId
              ) {
                return; // Skip this link - not connected to hovered leaf node
              }
            }
          }

          // Build hierarchical path using cache
          const cacheKey = `${link.source}-${link.target}`;
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
            for (
              let i = 0;
              i < Math.min(sourcePath.length, targetPath.length);
              i++
            ) {
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
            if (
              hierarchicalPath[hierarchicalPath.length - 1] !== targetNode.node
            ) {
              hierarchicalPath.push(targetNode.node);
            }

            hierarchicalPathCache.set(cacheKey, hierarchicalPath);
          }

          validLinks.push({
            link,
            sourceNode,
            targetNode,
            hierarchicalPath,
            lca,
          });
        }
      });

      // Group links by shared path segments for bundling
      validLinks.forEach(({ sourceNode, targetNode, hierarchicalPath }) => {
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

        const currentEdgeColor = mergedStyle.edge;
        const currentEdgeWidth = mergedStyle.edgeWidth;

        // Use full opacity only when hovering over leaf nodes with links
        let isFilteringLinks = false;
        if (hoveredNodeId !== null) {
          const hoveredNode = nodeIdToRenderedNodeMap.get(hoveredNodeId);
          const isLeafNode =
            hoveredNode && !parentToChildrenNodeMap.has(hoveredNodeId);
          isFilteringLinks = isLeafNode;
        }
        const currentEdgeOpacity = isFilteringLinks
          ? 1.0
          : mergedStyle.edgeOpacity;

        if (currentEdgeWidth > 0 && currentEdgeColor !== 'none' && ctx) {
          // Set style only if different from current
          if (ctx.strokeStyle !== currentEdgeColor) {
            ctx.strokeStyle = currentEdgeColor;
          }
          if (ctx.globalAlpha !== currentEdgeOpacity) {
            ctx.globalAlpha = currentEdgeOpacity;
          }
          if (ctx.lineWidth !== currentEdgeWidth) {
            ctx.lineWidth = currentEdgeWidth;
          }

          ctx.beginPath();

          if (pathCoords.length === 2) {
            // Simple direct line
            ctx.moveTo(pathCoords[0]?.x ?? 0, pathCoords[0]?.y ?? 0);
            ctx.lineTo(pathCoords[1]?.x ?? 0, pathCoords[1]?.y ?? 0);
          } else if (pathCoords.length > 2) {
            // Draw smooth curve through hierarchical path points
            ctx.moveTo(pathCoords[0]?.x ?? 0, pathCoords[0]?.y ?? 0);

            // Use quadratic curves between consecutive points
            for (let i = 1; i < pathCoords.length; i++) {
              const currentPoint = pathCoords[i];
              if (!currentPoint) continue;

              if (i === pathCoords.length - 1) {
                // Last segment - line to target
                ctx.lineTo(currentPoint.x, currentPoint.y);
              } else {
                // Create smooth curve through intermediate points
                const nextPoint = pathCoords[i + 1];
                if (nextPoint) {
                  const cpx = (currentPoint.x + nextPoint.x) / 2;
                  const cpy = (currentPoint.y + nextPoint.y) / 2;
                  ctx.quadraticCurveTo(
                    currentPoint.x,
                    currentPoint.y,
                    cpx,
                    cpy,
                  );
                }
              }
            }
          }
          ctx.stroke();

          // Reset alpha only if changed
          if (ctx.globalAlpha !== 1.0) {
            ctx.globalAlpha = 1.0;
          }
        }
      });
    }

    if (links?.length && validLinks.length) {
      validLinks.forEach(({ link }) => {
        visibleNodeIds.add(link.source);
        visibleNodeIds.add(link.target);
      });
    }

    // Third pass: Draw labels on top
    renderedNodes.forEach(
      (
        /** @type {{ x: number, y: number, radius: number, node: any, depth: number, angle: number, isLeaf: boolean }} */ {
          x,
          y,
          radius,
          node,
          depth,
          angle,
        },
      ) => {
        if (!ctx) return;

        // Skip labels for nodes with screen radius less than 1px for performance
        const screenRadius = radius;
        if (screenRadius < 1) return;

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
              if (
                nodesAtThisNegativeDepth &&
                nodesAtThisNegativeDepth.has(node.id)
              ) {
                depthStyle = ds;
                break;
              }
            }
          }
        }

        const currentLabel = depthStyle?.label ?? mergedStyle.label;
        const currentLabelFontFamily =
          depthStyle?.labelFontFamily ?? mergedStyle.labelFontFamily;

        const isActualLeaf = leafNodes.has(node.id);

        // Check if leaf node should show label based on link visibility and leaf count
        // Only bypass 50-leaf limit when hovering specifically over leaf nodes
        const isHoveringLeafNode =
          hoveredNodeId !== null && leafNodes.has(hoveredNodeId);
        const shouldShowLeafLabel =
          isActualLeaf &&
          (isHoveringLeafNode
            ? visibleNodeIds.has(node.id)
            : leafNodes.size <= mergedStyle.labelLimit);

        // Add text conditions
        if (
          shouldShowLeafLabel ||
          (!isActualLeaf &&
            radius > 10 &&
            currentLabel !== 'none' &&
            currentLabel !== 'transparent')
        ) {
          const text = String(node.name || node.id);

          if (shouldShowLeafLabel) {
            // For leaf nodes: use font size based on screen radius
            const fontSize = Math.max(8, Math.min(12, radius * 0.3));
            ctx.fillStyle = currentLabel;
            ctx.font = `${fontSize}px ${currentLabelFontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Calculate position outside the circle with proper padding

            // Determine if text is on left half (angle between 90° and 270°)
            const normalizedAngle =
              ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            const isLeftHalf =
              normalizedAngle > Math.PI / 2 &&
              normalizedAngle < (3 * Math.PI) / 2;

            // Calculate base position at circle edge + padding
            const baseX = x + (radius + TEXT_PADDING) * Math.cos(angle);
            const baseY = y + (radius + TEXT_PADDING) * Math.sin(angle);

            // Save context for rotation
            ctx.save();

            if (isLeftHalf) {
              // For left labels: make readable by rotating 180° additional
              // and position so text starts from left and ends at circle

              // Move to position where text should end (at circle)
              ctx.translate(baseX, baseY);
              // Rotate to make readable (flip the text)
              ctx.rotate(angle + Math.PI);

              // Set right alignment so text ends at the translated position
              ctx.textAlign = 'right';
            } else {
              // For right half: normal positioning and rotation
              ctx.translate(baseX, baseY);
              ctx.rotate(angle);
              ctx.textAlign = 'left';
            }

            // Draw text at origin (already translated)
            ctx.fillText(text, 0, 0);

            // Restore context
            ctx.restore();
          } else {
            // For non-leaf nodes: use existing logic
            ctx.fillStyle = currentLabel;
            const fontSize = Math.min(14, Math.max(7, radius / 3));
            ctx.font = `${fontSize}px ${currentLabelFontFamily}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const maxWidth = radius * 1.8;
            let displayText = text;

            const textWidth = ctx.measureText(displayText).width;
            if (textWidth > maxWidth && displayText.length > 3) {
              const ratio = maxWidth / textWidth;
              const truncateLength = Math.floor(displayText.length * ratio);
              displayText =
                displayText.substring(0, Math.max(1, truncateLength - 3)) + '…';
            }

            ctx.fillText(displayText, x, y);
          }
        }
      },
    );

    // Restore the context state
    ctx.restore();
  }

  function render() {
    if (!canvas || !nodes?.length) {
      return;
    }

    setupCanvas();
    calculateLayout();
    draw();
  }

  function scheduleRender() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(() => {
      render();
      animationFrameId = null;
    });
  }

  // Use $derived to create a reactive trigger for rendering
  const shouldRender = $derived.by(() => {
    // Track all the dependencies that should trigger a re-render
    const hasData = nodes?.length > 0;
    const deps = {
      width,
      height,
      nodesLength: nodes?.length || 0,
      linksLength: links?.length || 0,
      overlap: mergedOptions.overlap,
      arcSpan: mergedOptions.arcSpan,
      sizeGrowthRate: mergedOptions.sizeGrowthRate,
      orientation: mergedOptions.orientation,
      zoom: mergedOptions.zoom,
      fill: mergedStyle.fill,
      stroke: mergedStyle.stroke,
      strokeWidth: mergedStyle.strokeWidth,
    };

    return hasData ? deps : null;
  });

  // Single $effect that responds to the derived reactive state
  $effect(() => {
    if (shouldRender) scheduleRender();
  });

  /** @param {MouseEvent} event */
  function handleMouseMove(event) {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Handle panning
    if (isDragging && pannable) {
      const deltaX = mouseX - lastMouseX;
      const deltaY = mouseY - lastMouseY;
      panX += deltaX;
      panY += deltaY;
      scheduleRender();
    }

    lastMouseX = mouseX;
    lastMouseY = mouseY;

    // Handle hovering (only if not dragging and we have rendered nodes)
    if (!isDragging && renderedNodes.length) {
      // Transform mouse coordinates to account for pan only
      const transformedMouseX = mouseX - panX;
      const transformedMouseY = mouseY - panY;

      // Find which circle is being hovered
      let newHoveredNodeId = null;
      for (const nodeData of renderedNodes) {
        const { x, y, radius, node } = nodeData;

        // Skip hover detection for nodes with screen radius less than 1px
        const screenRadius = radius;
        if (screenRadius < 1) continue;

        const distance = Math.sqrt(
          (transformedMouseX - x) ** 2 + (transformedMouseY - y) ** 2,
        );
        if (distance <= radius) {
          newHoveredNodeId = node.id;
          break;
        }
      }

      // Only re-render if hover state changed
      if (newHoveredNodeId !== hoveredNodeId) {
        hoveredNodeId = newHoveredNodeId;
        scheduleRender();
      }
    }
  }

  /** @param {MouseEvent} event */
  function handleMouseDown(event) {
    if (!pannable) return;

    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    lastMouseX = event.clientX - rect.left;
    lastMouseY = event.clientY - rect.top;

    // Prevent text selection during drag
    event.preventDefault();
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleMouseLeave() {
    isDragging = false;
    if (hoveredNodeId !== null) {
      hoveredNodeId = null;
      scheduleRender();
    }
  }

  /** @param {WheelEvent} event */
  function handleWheel(event) {
    if (!zoomable || !canvas) return;

    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate proposed zoom
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const proposedZoom = currentZoom * zoomFactor;

    // Check if at bounds to prevent bouncing
    if (proposedZoom > maxZoomLimit && currentZoom >= maxZoomLimit) {
      return; // At max bound, don't zoom further
    }
    if (proposedZoom < minZoomLimit && currentZoom <= minZoomLimit) {
      return; // At min bound, don't zoom further
    }

    // Apply zoom within precomputed bounds
    const newZoom = Math.max(
      minZoomLimit,
      Math.min(maxZoomLimit, proposedZoom),
    );

    // Calculate zoom-to-point: keep the world point under the mouse fixed
    const centerX = width / 2;
    const centerY = height / 2;

    // World coordinates of the point under the mouse before zoom
    const worldX = (mouseX - centerX - panX) / currentZoom;
    const worldY = (mouseY - centerY - panY) / currentZoom;

    // After zoom, calculate new pan to keep the same world point under the mouse
    // mouseX = centerX + panX + worldX * newZoom
    // Therefore: panX = mouseX - centerX - worldX * newZoom
    panX = mouseX - centerX - worldX * newZoom;
    panY = mouseY - centerY - worldY * newZoom;

    // Update zoom
    currentZoom = newZoom;

    scheduleRender();
  }
</script>

<canvas
  bind:this={canvas}
  onmousemove={handleMouseMove}
  onmousedown={handleMouseDown}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseLeave}
  onwheel={handleWheel}
></canvas>
