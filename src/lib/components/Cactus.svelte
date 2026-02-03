<script>
  import { SvelteSet, SvelteMap } from 'svelte/reactivity';

  import { CactusLayout } from '$lib/cactusLayout.js';

  /** @type {{ width: number, height: number, nodes: Array<{id: string, name: string, parent: string|null, weight?: number}>, links?: Array<{source: string, target: string}>, options?: {overlap?: number, arcSpan?: number, sizeGrowthRate?: number, orientation?: number, zoom?: number}, styles?: {fill?: string, fillOpacity?: number, stroke?: string, strokeWidth?: number, strokeOpacity?: number, label?: string, labelFontFamily?: string, lineWidth?: number, line?: string, edge?: string, edgeWidth?: number, highlightFill?: string, highlightStroke?: string, highlight?: boolean, depths?: Array<{depth: number, fill?: string, fillOpacity?: number, stroke?: string, strokeWidth?: number, strokeOpacity?: number, label?: string, labelFontFamily?: string, lineWidth?: number, line?: string, edge?: string, edgeWidth?: number, highlightFill?: string, highlightStroke?: string, highlight?: boolean}>}, pannable?: boolean, zoomable?: boolean }} */
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
    edgeWidth: 2,
    highlightFill: '#ffefef',
    highlightStroke: '#d32f2f',
    highlight: true,
    depths: [],
  };
  const mergedStyle = $derived({ ...defaultStyle, ...styles });

  /** @type {HTMLCanvasElement} */
  let canvas;

  /** @type {CanvasRenderingContext2D|null} */
  let ctx = null;

  let devicePixelRatio = 1;

  /** @type {string|null} */
  let hoveredNodeId = null;

  /** @type {Array<{x: number, y: number, radius: number, node: any, isLeaf: boolean, depth: number}>} */
  let renderedNodes = [];

  /** @type {CactusLayout|null} */
  let cactusLayout = null;

  // Pan and zoom state
  let panX = 0;
  let panY = 0;
  let currentZoom = 1;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  /** @type {number|null} */
  let animationFrameId = null;

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
    if (!nodes?.length) return;

    cactusLayout = new CactusLayout(
      width,
      height,
      mergedOptions.zoom,
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
  }

  function draw() {
    if (!canvas || !ctx || !renderedNodes.length) return;

    // Save the current context state
    ctx.save();

    // Clear the entire canvas
    ctx.clearRect(0, 0, width, height);

    // Apply pan and zoom transformations
    ctx.translate(panX, panY);
    ctx.scale(currentZoom, currentZoom);

    // Draw connecting lines when overlap is negative
    if (mergedOptions.overlap < 0 && ctx) {
      renderedNodes.forEach((nodeData) => {
        const { x, y, node, depth } = nodeData;

        // Find children to draw lines to
        const children = renderedNodes.filter((child) =>
          nodes.find((n) => n.id === child.node.id && n.parent === node.id),
        );

        children.forEach((child) => {
          // Determine line style (check depth styles first)
          let depthStyle = null;
          if (mergedStyle.depths) {
            for (const ds of mergedStyle.depths) {
              if (ds.depth === depth) {
                depthStyle = ds;
                break;
              }
            }
          }

          const currentLineWidth =
            depthStyle?.lineWidth ?? mergedStyle.lineWidth;
          const currentLineColor = depthStyle?.line ?? mergedStyle.line;

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

    // Build a map to identify leaves and calculate negative depths
    /** @type {SvelteSet<string>} */
    const leafNodes = new SvelteSet();
    /** @type {SvelteMap<number, SvelteSet<string>>} */
    const negativeDepthNodes = new SvelteMap();

    // Create node map and identify leaves
    renderedNodes.forEach(({ node }) => {
      const hasChildren = nodes.some((n) => n.parent === node.id);
      if (!hasChildren) {
        leafNodes.add(node.id);
      }
    });

    // Calculate negative depth mappings
    negativeDepthNodes.set(-1, new SvelteSet(leafNodes));

    /** @type {SvelteSet<string>} */
    let currentLevelNodes = new SvelteSet(leafNodes);
    let depthLevel = -2;

    while (currentLevelNodes.size > 0) {
      /** @type {SvelteSet<string>} */
      const nextLevelNodes = new SvelteSet();

      // Get all direct parents of current level
      currentLevelNodes.forEach((nodeId) => {
        const nodeData = nodes.find((n) => n.id === nodeId);
        if (nodeData && nodeData.parent) {
          nextLevelNodes.add(nodeData.parent);
        }
      });

      if (nextLevelNodes.size === 0) break;

      /** @type {SvelteSet<string>} */
      const filteredNodes = new SvelteSet();
      nextLevelNodes.forEach((nodeId) => {
        const hasChildInSameLevel = Array.from(nextLevelNodes).some(
          (otherId) => {
            if (otherId === nodeId) return false;
            const otherNodeData = nodes.find((n) => n.id === otherId);
            return otherNodeData && otherNodeData.parent === nodeId;
          },
        );

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

        // Find applicable depth style
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

        // Get style values with depth-specific overrides
        const currentFill = depthStyle?.fill ?? mergedStyle.fill;
        const currentFillOpacity =
          depthStyle?.fillOpacity ?? mergedStyle.fillOpacity;
        const currentStroke = depthStyle?.stroke ?? mergedStyle.stroke;
        const currentStrokeWidth =
          depthStyle?.strokeWidth ?? mergedStyle.strokeWidth;
        const currentStrokeOpacity =
          depthStyle?.strokeOpacity ?? mergedStyle.strokeOpacity;
        const currentLabel = depthStyle?.label ?? mergedStyle.label;
        const currentLabelFontFamily =
          depthStyle?.labelFontFamily ?? mergedStyle.labelFontFamily;
        const currentHighlight = depthStyle?.highlight ?? mergedStyle.highlight;

        // Check if this node is hovered and highlighting is enabled
        const isHovered = hoveredNodeId === node.id && currentHighlight;
        const finalFill = isHovered
          ? (depthStyle?.highlightFill ?? mergedStyle.highlightFill)
          : currentFill;
        const finalStroke = isHovered
          ? (depthStyle?.highlightStroke ?? mergedStyle.highlightStroke)
          : currentStroke;

        // Apply styling - skip if fill or stroke is 'none'
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);

        if (finalFill !== 'none') {
          ctx.globalAlpha = currentFillOpacity;
          ctx.fillStyle = finalFill;
          ctx.fill();
        }

        if (finalStroke !== 'none' && currentStrokeWidth > 0) {
          ctx.globalAlpha = currentStrokeOpacity;
          ctx.strokeStyle = finalStroke;
          ctx.lineWidth = currentStrokeWidth;
          ctx.stroke();
        }

        // Reset alpha for text
        ctx.globalAlpha = 1.0;

        // Add text if radius is large enough and label is not 'none'
        if (radius > 6 && currentLabel !== 'none') {
          ctx.fillStyle = currentLabel;
          const fontSize = Math.min(14, Math.max(8, radius / 3));
          ctx.font = `${fontSize}px ${currentLabelFontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const text = String(node.name || node.id);
          const maxWidth = radius * 1.8;
          let displayText = text;

          const textWidth = ctx.measureText(displayText).width;
          if (textWidth > maxWidth && displayText.length > 3) {
            const ratio = maxWidth / textWidth;
            const truncateLength = Math.floor(displayText.length * ratio);
            displayText =
              displayText.substring(0, Math.max(1, truncateLength - 3)) + '...';
          }

          ctx.fillText(displayText, x, y);
        }
      },
    );

    // Draw hierarchical edge bundling for links AFTER nodes
    if (links?.length && cactusLayout && ctx) {
      // Group links by their hierarchical paths for bundling
      /** @type {Array<{link: any, sourceNode: any, targetNode: any, hierarchicalPath: any[], lca: any}>} */
      const validLinks = [];

      // First pass: collect all valid links and build hierarchical paths
      links.forEach((link) => {
        const sourceNode = renderedNodes.find((n) => n.node.id === link.source);
        const targetNode = renderedNodes.find((n) => n.node.id === link.target);

        if (sourceNode && targetNode) {
          // Filter links based on hover state
          if (hoveredNodeId !== null) {
            if (
              link.source !== hoveredNodeId &&
              link.target !== hoveredNodeId
            ) {
              return; // Skip this link - not connected to hovered node
            }
          }

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
          let lca = null;
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
          const hierarchicalPath = [sourceNode.node];

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
        // Convert hierarchical path to coordinates
        const pathCoords = hierarchicalPath
          .map((/** @type {any} */ node) => {
            const nodeData = renderedNodes.find((n) => n.node === node);
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

        if (currentEdgeWidth > 0 && currentEdgeColor !== 'none' && ctx) {
          ctx.strokeStyle = currentEdgeColor;
          ctx.lineWidth = currentEdgeWidth;

          if (pathCoords.length === 2) {
            // Simple direct line
            ctx.beginPath();
            ctx.moveTo(pathCoords[0]?.x ?? 0, pathCoords[0]?.y ?? 0);
            ctx.lineTo(pathCoords[1]?.x ?? 0, pathCoords[1]?.y ?? 0);
            ctx.stroke();
          } else if (pathCoords.length > 2) {
            // Draw smooth curve through hierarchical path points
            ctx.beginPath();
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
            ctx.stroke();
          }
        }
      });
    }

    // Restore the context state
    ctx.restore();
  }

  function render() {
    if (!canvas || !nodes?.length) return;
    setupCanvas();
    calculateLayout();
    draw();
  }

  function scheduleRender() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(() => {
      draw();
      animationFrameId = null;
    });
  }

  $effect(() => {
    render();
  });

  // Re-render when links change
  $effect(() => {
    if (links) {
      scheduleRender();
    }
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
      // Transform mouse coordinates to account for pan and zoom
      const transformedMouseX = (mouseX - panX) / currentZoom;
      const transformedMouseY = (mouseY - panY) / currentZoom;

      // Find which circle is being hovered
      let newHoveredNodeId = null;
      for (const nodeData of renderedNodes) {
        const { x, y, radius, node } = nodeData;
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
    if (!zoomable) return;

    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, currentZoom * zoomFactor));

    // Zoom towards mouse position
    const zoomRatio = newZoom / currentZoom;
    panX = mouseX - (mouseX - panX) * zoomRatio;
    panY = mouseY - (mouseY - panY) * zoomRatio;

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
