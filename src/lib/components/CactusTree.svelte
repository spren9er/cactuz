<script>
  import { onMount } from 'svelte';
  import { SvelteSet, SvelteMap } from 'svelte/reactivity';

  import { setupCanvas } from '$lib/components/cactusTree/canvasUtils.js';
  import { drawNodes } from '$lib/components/cactusTree/drawNode.js';
  import {
    drawEdges,
    drawConnectingLines,
  } from '$lib/components/cactusTree/drawEdge.js';
  import { drawLabels } from '$lib/components/cactusTree/drawLabel.js';
  import { createMouseHandlers } from '$lib/components/cactusTree/mouseHandlers.js';
  import {
    calculateLayout,
    computeZoomLimits,
    buildLookupMaps,
  } from '$lib/components/cactusTree/layoutUtils.js';

  /** @type {{
      width: number,
      height: number,
      nodes: Array<{ id: string, name: string, parent: string | null, weight?: number }>,
      links?: Array<{ source: string, target: string }>,
      options?: {
        overlap?: number,
        arcSpan?: number,
        sizeGrowthRate?: number,
        orientation?: number,
        zoom?: number,
        numLabels?: number,
        bundlingStrength?: number
      },
      styles?: {
        node?: {
          fillColor?: string,
          fillOpacity?: number,
          strokeColor?: string,
          strokeOpacity?: number,
          strokeWidth?: number,
          highlight?: {
            fillColor?: string,
            fillOpacity?: number,
            strokeColor?: string,
            strokeOpacity?: number,
            strokeWidth?: number,
          }
        },
        edge?: {
          strokeColor?: string,
          strokeOpacity?: number,
          strokeWidth?: number,
          highlight?: {
            strokeColor?: string,
            strokeOpacity?: number,
            strokeWidth?: number
          }
        },
        label?: {
          textColor?: string,
          textOpacity?: number,
          fontFamily?: string,
          minFontSize?: number,
          maxFontSize?: number,
          fontWeight?: string,
          padding?: number,
          link?: {
            strokeColor?: string,
            strokeOpacity?: number,
            strokeWidth?: number,
            length?: number,
            padding?: number,
          },
          highlight?: {
            textColor?: string,
            textOpacity?: number,
            fontWeight?: string,
          }
        },
        line?: {
          strokeColor?: string,
          strokeOpacity?: number,
          strokeWidth?: number
        },
        depths?: Array<{
          depth: number,
          node?: {
            fillColor?: string,
            fillOpacity?: number,
            strokeColor?: string,
            strokeOpacity?: number,
            strokeWidth?: number,
            highlight?: {
              fillColor?: string,
              fillOpacity?: number,
              strokeColor?: string,
              strokeOpacity?: number,
              strokeWidth?: number,
            }
          },
          label?: {
            textColor?: string,
            textOpacity?: number,
            fontFamily?: string,
            minFontSize?: number,
            maxFontSize?: number,
            fontWeight?: string,
            padding?: number,
            link?: {
              strokeColor?: string,
              strokeOpacity?: number,
              strokeWidth?: number,
              length?: number,
              padding?: number,
            },
            highlight?: {
              textColor?: string,
              textOpacity?: number,
              fontWeight?: string,
            }
          },
          line?: {
            strokeColor?: string,
            strokeOpacity?: number,
            strokeWidth?: number
          }
        }>
      },
      pannable?: boolean,
      zoomable?: boolean
    }} */
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
    orientation: Math.PI / 2,
    zoom: 1.0,
    numLabels: 30,
    bundlingStrength: 0.97,
  };

  const defaultStyle = {
    node: {
      fillColor: '#efefef',
      fillOpacity: 1,
      strokeColor: '#333333',
      strokeOpacity: 1,
      strokeWidth: 1,
      highlight: {
        fillColor: '#ffcc99',
        fillOpacity: 1,
        strokeColor: '#ff6600',
        strokeOpacity: 1,
        strokeWidth: 1,
        enabled: true,
      },
    },
    edge: {
      strokeColor: '#ff6b6b',
      strokeOpacity: 0.1,
      strokeWidth: 1,
      highlight: {
        strokeColor: '#ff6600',
        strokeOpacity: 1,
        strokeWidth: 1,
      },
    },
    label: {
      textColor: '#333333',
      textOpacity: 1,
      fontFamily: 'monospace',
      minFontSize: 8,
      maxFontSize: 14,
      fontWeight: 'normal',
      padding: 1,
      link: {
        strokeColor: '#333333',
        strokeOpacity: 1,
        strokeWidth: 0.5,
        padding: 0,
      },
      highlight: {
        textColor: undefined,
        textOpacity: undefined,
        fontWeight: undefined,
      },
    },
    line: {
      strokeColor: '#333333',
      strokeOpacity: 1,
      strokeWidth: 1,
    },
    depths: [],
  };

  // Merge options and styles
  const mergedOptions = $derived({ ...defaultOptions, ...options });
  const mergedStyle = $derived({
    node: {
      ...(defaultStyle.node || {}),
      ...(styles.node || {}),
      highlight: {
        ...((defaultStyle.node && defaultStyle.node.highlight) || {}),
        ...((styles.node && styles.node.highlight) || {}),
      },
    },
    edge: {
      ...(defaultStyle.edge || {}),
      ...(styles.edge || {}),
      highlight: {
        ...((defaultStyle.edge && defaultStyle.edge.highlight) || {}),
        ...((styles.edge && styles.edge.highlight) || {}),
      },
    },
    label: { ...(defaultStyle.label || {}), ...(styles.label || {}) },
    line: { ...(defaultStyle.line || {}), ...(styles.line || {}) },
    depths: styles.depths ?? defaultStyle.depths,
  });

  // Canvas and context
  /** @type {HTMLCanvasElement} */
  let canvas;
  /** @type {CanvasRenderingContext2D|null} */
  let ctx = $state(null);

  // Layout and rendering state (no reactive state for these)
  /** @type {Array<any>} */
  let renderedNodes = [];
  let nodeIdToRenderedNodeMap = new SvelteMap();
  let leafNodes = new SvelteSet();
  let negativeDepthNodes = new SvelteMap();
  let depthStyleCache = new SvelteMap();
  let hierarchicalPathCache = new SvelteMap();
  let parentToChildrenNodeMap = new SvelteMap();

  // Interaction state
  let hoveredNodeId = $state(null);
  let panX = $state(0);
  let panY = $state(0);
  let currentZoom = $state(1.0);
  let isDragging = $state(false);
  let lastMouseX = $state(0);
  let lastMouseY = $state(0);

  // Touch state
  /** @type {Touch[]} */
  let touches = $state([]);
  let lastTouchDistance = $state(0);

  // Zoom limits (computed each render)
  let minZoomLimit = $state(0.1);
  let maxZoomLimit = $state(10);

  // Animation frame for render scheduling
  /** @type {number|null} */
  let animationFrameId = null;

  // Calculate layout and build lookup maps (called on each render)
  function calculateLayoutAndMaps() {
    if (!nodes?.length) {
      renderedNodes = [];
      return;
    }

    // Calculate layout with current zoom
    const layoutZoom = mergedOptions.zoom * currentZoom;
    renderedNodes = calculateLayout(
      width,
      height,
      layoutZoom,
      nodes,
      mergedOptions,
    );

    // Build lookup maps
    const lookupMaps =
      /** @type {{ nodeIdToRenderedNodeMap: any, leafNodes: any, negativeDepthNodes: any, nodeIdToNodeMap: any, depthStyleCache: any, hierarchicalPathCache: any, parentToChildrenNodeMap: any }} */ (
        buildLookupMaps(renderedNodes, mergedStyle)
      );

    // Update maps
    nodeIdToRenderedNodeMap = lookupMaps.nodeIdToRenderedNodeMap;
    leafNodes = lookupMaps.leafNodes;
    negativeDepthNodes = lookupMaps.negativeDepthNodes;
    depthStyleCache = lookupMaps.depthStyleCache;
    hierarchicalPathCache = lookupMaps.hierarchicalPathCache;
    parentToChildrenNodeMap = lookupMaps.parentToChildrenNodeMap;

    // Update zoom limits
    if (nodes?.length) {
      const limits =
        /** @type {{ minZoomLimit: number, maxZoomLimit: number }} */ (
          computeZoomLimits(width, height, nodes, mergedOptions)
        );
      minZoomLimit = limits.minZoomLimit;
      maxZoomLimit = limits.maxZoomLimit;

      // Reset zoom if it's outside the new limits
      if (currentZoom < minZoomLimit || currentZoom > maxZoomLimit) {
        currentZoom = 1.0;
        panX = 0;
        panY = 0;
      }
    }
  }

  // Main draw function
  function draw() {
    if (!canvas || !ctx) return;

    // Clear and set up canvas context
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Apply only pan transform (zoom is handled in layout calculation)
    ctx.translate(panX, panY);

    // Draw connecting lines (if overlap < 0)
    drawConnectingLines(
      ctx,
      renderedNodes,
      parentToChildrenNodeMap,
      mergedStyle,
      depthStyleCache,
      mergedOptions.overlap,
      negativeDepthNodes,
    );

    // Draw nodes
    drawNodes(
      ctx,
      renderedNodes,
      hoveredNodeId,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
    );

    // Draw edges
    const edgeNodeIds = drawEdges(
      ctx,
      links,
      nodeIdToRenderedNodeMap,
      hierarchicalPathCache,
      mergedStyle,
      hoveredNodeId,
      parentToChildrenNodeMap,
      Number(mergedOptions?.bundlingStrength ?? 0.97),
    );
    // Only expose visible node ids while hovering; otherwise keep empty so styles reset on unhover.
    const visibleNodeIds = hoveredNodeId ? new Set(edgeNodeIds) : new Set();

    // Draw labels (pass hover + visible nodes so labels/links can apply highlight & filtering)
    drawLabels(
      ctx,
      renderedNodes,
      leafNodes,
      hoveredNodeId,
      visibleNodeIds,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
      mergedOptions.numLabels,
      panX,
      panY,
    );

    ctx.restore();
  }

  // Render function (matches original pattern)
  function render() {
    if (!canvas || !nodes?.length) {
      return;
    }

    // Setup canvas on every render like the original
    ctx = setupCanvas(canvas, width, height);
    calculateLayoutAndMaps();
    draw();
  }

  // Schedule render function (matches original)
  function scheduleRender() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = requestAnimationFrame(() => {
      render();
      animationFrameId = null;
    });
  }

  // Initialize canvas on mount
  onMount(() => {
    if (canvas) {
      currentZoom = mergedOptions.zoom;
      scheduleRender();
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  });

  // Create mouse handlers as derived to ensure proper timing and avoid canvas issues
  const mouseHandlers = $derived.by(() => {
    // Don't create handlers until canvas is ready
    if (!canvas) return null;

    const mutableState = {
      // Use a static reference to prevent reactive dependencies
      canvas: canvas,
      get hoveredNodeId() {
        return hoveredNodeId;
      },
      set hoveredNodeId(value) {
        hoveredNodeId = value;
      },
      get renderedNodes() {
        return renderedNodes;
      },
      get panX() {
        return panX;
      },
      set panX(value) {
        panX = value;
      },
      get panY() {
        return panY;
      },
      set panY(value) {
        panY = value;
      },
      get currentZoom() {
        return currentZoom;
      },
      set currentZoom(value) {
        currentZoom = value;
      },
      get isDragging() {
        return isDragging;
      },
      set isDragging(value) {
        isDragging = value;
      },
      get lastMouseX() {
        return lastMouseX;
      },
      set lastMouseX(value) {
        lastMouseX = value;
      },
      get lastMouseY() {
        return lastMouseY;
      },
      set lastMouseY(value) {
        lastMouseY = value;
      },
      get minZoomLimit() {
        return minZoomLimit;
      },
      get maxZoomLimit() {
        return maxZoomLimit;
      },
      get touches() {
        return touches;
      },
      set touches(value) {
        touches = value;
      },
      get lastTouchDistance() {
        return lastTouchDistance;
      },
      set lastTouchDistance(value) {
        lastTouchDistance = value;
      },
      pannable,
      zoomable,
    };

    return createMouseHandlers(mutableState, width, height, scheduleRender);
  });

  $effect(() => {
    void nodes;
    void links;
    void mergedOptions.overlap;
    void mergedOptions.arcSpan;
    void mergedOptions.sizeGrowthRate;
    void mergedOptions.orientation;
    void mergedOptions.zoom;
    void currentZoom;
    void panX;
    void panY;
    void width;
    void height;

    if (nodes?.length > 0 && canvas) {
      scheduleRender();
    }
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  style="display: block; cursor: default;"
  onmousemove={mouseHandlers?.onMouseMove}
  onmousedown={mouseHandlers?.onMouseDown}
  onmouseup={mouseHandlers?.onMouseUp}
  onmouseleave={mouseHandlers?.onMouseLeave}
  onwheel={mouseHandlers?.onWheel}
  ontouchstart={mouseHandlers?.onTouchStart}
  ontouchmove={mouseHandlers?.onTouchMove}
  ontouchend={mouseHandlers?.onTouchEnd}
>
</canvas>
