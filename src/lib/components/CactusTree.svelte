<script>
  import { onMount } from 'svelte';
  import { SvelteSet, SvelteMap } from 'svelte/reactivity';

  import { setupCanvas } from '$lib/components/cactusTree/canvasUtils.js';
  import { drawNodes } from '$lib/components/cactusTree/drawNode.js';
  import * as drawEdge from '$lib/components/cactusTree/drawEdge.js';
  import {
    drawLabels,
    clearLabelLayoutCache,
  } from '$lib/components/cactusTree/drawLabel.js';
  import { createMouseHandlers } from '$lib/components/cactusTree/mouseHandlers.js';
  import {
    calculateLayout,
    computeZoomLimitsFromNodes,
    buildLookupMaps,
  } from '$lib/components/cactusTree/layoutUtils.js';

  /**
   * Simplified prop type for the component.
   *
   * The original, deeply nested JSDoc caused parsing issues in the toolchain.
   * This simplified annotation documents the main shape without exhaustive nesting.
   *
   * @typedef {Object} CactusTreeProps
   * @property {number} width
   * @property {number} height
   * @property {Array<Object>} nodes - array of nodes ({ id, name, parent, weight? })
   * @property {Array<Object>} [links] - array of links ({ source, target })
   * @property {Object} [options] - options (overlap, arcSpan, sizeGrowthRate, orientation, zoom, numLabels, edgeOptions)
   * @property {Object} [styles] - style overrides (node, edge, label, line, highlight, depths)
   * @property {boolean} [pannable]
   * @property {boolean} [zoomable]
   */

  /**
   * Local RenderedNode type (lightweight, used for JSDoc typing within this file).
   * This matches the minimal fields the drawing/layout code expects.
   *
   * @typedef {Object} RenderedNode
   * @property {string} id
   * @property {number} x
   * @property {number} y
   * @property {number} depth
   * @property {number} radius
   * @property {string} name
   * @property {Object} [meta]
   */

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
    edgeOptions: {
      bundlingStrength: 0.97,
      strategy: 'hide',
      muteOpacity: 0.2,
    },
  };

  const defaultStyle = {
    node: {
      fillColor: '#efefef',
      fillOpacity: 1,
      strokeColor: '#aaaaaa',
      strokeOpacity: 1,
      strokeWidth: 1,
    },
    edge: {
      strokeColor: '#333333',
      strokeOpacity: 0.1,
      strokeWidth: 1,
    },
    label: {
      inner: {
        textColor: '#333333',
        textOpacity: 1,
        fontFamily: 'monospace',
        fontWeight: 'normal',
        minFontSize: 9,
        maxFontSize: 14,
      },
      outer: {
        textColor: '#333333',
        textOpacity: 1,
        fontFamily: 'monospace',
        fontWeight: 'normal',
        fontSize: 9,
        padding: 1,
        link: {
          strokeColor: '#cccccc',
          strokeOpacity: 1,
          strokeWidth: 0.5,
          padding: 0,
          length: 5,
        },
      },
    },
    line: {
      strokeColor: '#aaaaaa',
      strokeOpacity: 1,
      strokeWidth: 1,
    },
    highlight: {
      node: {
        fillColor: '#dedede',
        fillOpacity: 1,
        strokeColor: '#333333',
        strokeOpacity: 1,
        strokeWidth: 1,
      },
      edge: {
        strokeColor: '#ea575a',
        strokeOpacity: 0.2,
        strokeWidth: 1,
      },
      label: {
        inner: {
          textColor: '#ea575a',
          textOpacity: 1,
          fontWeight: 'bold',
        },
        outer: {
          textColor: '#333333',
          textOpacity: 1,
          fontWeight: 'normal',
        },
      },
    },
    depths: [
      {
        depth: -1,
        node: { fillColor: '#333333', strokeColor: '#333333' },
        label: {
          inner: { textColor: '#efefef' },
        },
        highlight: {
          node: { fillColor: '#ffbbb7', strokeColor: '#ea575a' },
          label: {
            inner: { strokeColor: '#ea575a' },
            outer: { textColor: '#ea575a' },
          },
        },
      },
    ],
  };

  // Merge options and styles using simple derived-style helpers
  const mergedOptions = $derived({ ...defaultOptions, ...options });

  const mergedStyle = $derived({
    node: (() => {
      const s = { ...(defaultStyle.node || {}), ...(styles.node || {}) };
      if (s && typeof s === 'object' && 'highlight' in s) delete s.highlight;
      return s;
    })(),
    edge: (() => {
      const s = { ...(defaultStyle.edge || {}), ...(styles.edge || {}) };
      if (s && typeof s === 'object' && 'highlight' in s) delete s.highlight;
      return s;
    })(),
    label: (() => {
      const s = { ...(defaultStyle.label || {}), ...(styles.label || {}) };
      if (s && typeof s === 'object' && 'highlight' in s) delete s.highlight;
      return s;
    })(),
    line: { ...(defaultStyle.line || {}), ...(styles.line || {}) },
    highlight: {
      node: {
        ...((defaultStyle.highlight && defaultStyle.highlight.node) || {}),
        ...((styles.highlight && styles.highlight.node) || {}),
      },
      edge: {
        ...((defaultStyle.highlight && defaultStyle.highlight.edge) || {}),
        ...((styles.highlight && styles.highlight.edge) || {}),
      },
      label: {
        ...((defaultStyle.highlight && defaultStyle.highlight.label) || {}),
        ...((styles.highlight && styles.highlight.label) || {}),
      },
    },
    depths: styles.depths ?? defaultStyle.depths,
  });

  $effect(() => {
    if (!canvas) return;

    void styles;

    scheduleRender();
  });
  /** @type {HTMLCanvasElement} */
  let canvas;
  /** @type {CanvasRenderingContext2D|null} */
  let ctx = $state(null);

  // Layout and rendering state with explicit types to avoid inference issues.
  /** @type {RenderedNode[]} */
  let renderedNodes = [];

  /** @type {SvelteMap<string, RenderedNode>} */
  let nodeIdToRenderedNodeMap = new SvelteMap();

  /** @type {SvelteSet<string>} */
  let leafNodes = new SvelteSet();

  /**
   * Map from negative depth number (e.g., -1, -2) to a Set of node IDs at that depth.
   * @type {SvelteMap<number, Set<string>>}
   */
  let negativeDepthNodes = new SvelteMap();

  /** @type {SvelteMap<number, any>} */
  let depthStyleCache = new SvelteMap();

  /** @type {SvelteMap<string, any>} */
  let hierarchicalPathCache = new SvelteMap();

  /** @type {SvelteMap<string, any>} */
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

  // Animation frame id
  /** @type {number|null} */
  let animationFrameId = null;

  function calculateLayoutAndMaps() {
    clearLabelLayoutCache();

    if (!nodes?.length) {
      renderedNodes = [];
      // clear maps
      nodeIdToRenderedNodeMap = new SvelteMap();
      leafNodes = new SvelteSet();
      negativeDepthNodes = new SvelteMap();
      depthStyleCache = new SvelteMap();
      hierarchicalPathCache = new SvelteMap();
      parentToChildrenNodeMap = new SvelteMap();
      return;
    }

    const layoutZoom = mergedOptions.zoom * currentZoom;
    renderedNodes = calculateLayout(
      width,
      height,
      layoutZoom,
      nodes,
      mergedOptions,
    );

    // Restore explicit cast for lookup maps so the analyzer knows the expected shape.
    const lookupMaps = /** @type {{
        nodeIdToRenderedNodeMap: SvelteMap<string, RenderedNode>,
        leafNodes: SvelteSet<string>,
        negativeDepthNodes: SvelteMap<number, Set<string>>,
        depthStyleCache: SvelteMap<number, any>,
        hierarchicalPathCache: SvelteMap<string, any>,
        parentToChildrenNodeMap: SvelteMap<string, any>
      }} */ (buildLookupMaps(renderedNodes, mergedStyle));

    nodeIdToRenderedNodeMap = lookupMaps.nodeIdToRenderedNodeMap;
    leafNodes = lookupMaps.leafNodes;
    negativeDepthNodes = lookupMaps.negativeDepthNodes;
    depthStyleCache = lookupMaps.depthStyleCache;
    hierarchicalPathCache = lookupMaps.hierarchicalPathCache;
    parentToChildrenNodeMap = lookupMaps.parentToChildrenNodeMap;

    if (renderedNodes?.length) {
      const limits = computeZoomLimitsFromNodes(
        width,
        height,
        renderedNodes,
        currentZoom,
      );
      minZoomLimit = limits.minZoomLimit;
      maxZoomLimit = limits.maxZoomLimit;

      if (currentZoom < minZoomLimit || currentZoom > maxZoomLimit) {
        currentZoom = 1.0;
        panX = 0;
        panY = 0;
      }
    }
  }

  function draw() {
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panX, panY);

    // Draw connecting parent->child lines (only when overlap < 0)
    drawEdge.drawConnectingLines(
      ctx,
      renderedNodes,
      /** @type {any} */ (parentToChildrenNodeMap),
      mergedStyle,
      /** @type {any} */ (depthStyleCache),
      mergedOptions.overlap,
      /** @type {any} */ (negativeDepthNodes),
    );

    // Compute the set of visible nodes that participate in edges according to current filtering.
    // Use the drawEdge helper (keeps logic centralised and consistent).
    const edgeNodeIds = drawEdge.computeVisibleEdgeNodeIds(
      links,
      /** @type {any} */ (nodeIdToRenderedNodeMap),
      hoveredNodeId,
    );

    const edgeNodeIdSet = new Set();
    if (edgeNodeIds && edgeNodeIds.length) {
      for (const id of edgeNodeIds) {
        edgeNodeIdSet.add(id);
      }
    }

    // Node highlight set: the hovered node AND its directly associated neighbor nodes (when visible).
    // These nodes should be styled as highlighted.
    const nodeHighlightedIds = (() => {
      const s = new Set();
      if (!hoveredNodeId) return s;
      s.add(hoveredNodeId);

      for (const link of links || []) {
        if (link.source === hoveredNodeId && edgeNodeIdSet.has(link.target)) {
          s.add(link.target);
        } else if (
          link.target === hoveredNodeId &&
          edgeNodeIdSet.has(link.source)
        ) {
          s.add(link.source);
        }
      }
      return s;
    })();

    // Edge highlight set: only the hovered node itself — edges are considered highlighted
    // only when one endpoint is the hovered node. This prevents edges between neighbors
    // (neither endpoint being the hovered node) from being treated as highlighted.
    const edgeHighlightedNodeIds = (() => {
      if (!hoveredNodeId) return null;
      const s = new Set();
      s.add(hoveredNodeId);
      return s;
    })();

    // Draw non-leaf nodes first with node-highlight set that includes neighbors.
    drawNodes(
      ctx,
      renderedNodes,
      leafNodes,
      hoveredNodeId,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
      nodeHighlightedIds,
      'nonLeaf',
    );

    // Draw edges — pass only the hovered-node-only set for edge highlighting.
    drawEdge.drawEdges(
      ctx,
      links,
      /** @type {any} */ (nodeIdToRenderedNodeMap),
      /** @type {any} */ (hierarchicalPathCache),
      mergedStyle,
      hoveredNodeId,
      /** @type {any} */ (edgeHighlightedNodeIds),
      Number(mergedOptions?.edgeOptions?.bundlingStrength ?? 0.97),
      mergedOptions?.edgeOptions ?? {},
      /** @type {any} */ (depthStyleCache),
      /** @type {any} */ (negativeDepthNodes),
    );

    // Draw leaf nodes (so they appear on top of edges) with same node highlight set.
    drawNodes(
      ctx,
      renderedNodes,
      leafNodes,
      hoveredNodeId,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
      nodeHighlightedIds,
      'leaf',
    );

    // Draw labels — use nodeHighlightedIds so neighbor labels are also emphasized.
    drawLabels(
      ctx,
      renderedNodes,
      leafNodes,
      hoveredNodeId,
      nodeHighlightedIds,
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
      mergedOptions.numLabels,
      panX,
      panY,
    );

    ctx.restore();
  }

  function render() {
    if (!canvas || !nodes?.length) {
      return;
    }
    ctx = setupCanvas(canvas, width, height);
    calculateLayoutAndMaps();
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

  /**
   * Lightweight redraw — skips layout computation and canvas re-setup.
   * Used for pan, zoom, and hover interactions where only the view transform
   * or highlight state changed, not the underlying data.
   */
  function scheduleDraw() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = requestAnimationFrame(() => {
      if (!canvas || !ctx || !renderedNodes.length) return;
      draw();
      animationFrameId = null;
    });
  }

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

  const mouseHandlers = $derived.by(() => {
    if (!canvas) return null;

    const mutableState = {
      canvas,
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

    return createMouseHandlers(mutableState, width, height, scheduleDraw);
  });

  // Full layout when data, options, dimensions, or zoom change
  $effect(() => {
    void nodes;
    void links;
    void mergedOptions.overlap;
    void mergedOptions.arcSpan;
    void mergedOptions.sizeGrowthRate;
    void mergedOptions.orientation;
    void mergedOptions.zoom;
    void mergedOptions.edgeOptions;
    void currentZoom;
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
