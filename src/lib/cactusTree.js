/**
 * CactusTree
 *
 * Encapsulates all options, styles, layout computation, canvas management,
 * and mouse/touch interaction.
 */

import { setupCanvas } from './canvasUtils.js';
import { drawNodes } from './drawNode.js';
import * as drawEdge from './drawEdge.js';
import { drawConnectingLinks } from './drawLink.js';
import { drawLabels, clearLabelLayoutCache } from './drawLabel.js';
import { createMouseHandlers } from './mouseHandlers.js';
import {
  calculateLayout,
  computeZoomLimitsFromNodes,
  buildLookupMaps,
} from './layoutUtils.js';
import { buildLeafVoronoi } from './voronoiHover.js';
import {
  easeInOutCubic,
  getDescendantIds,
  computeCollapsedPositions,
} from './collapseAnimation.js';

// ── Default options & styles ────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  overlap: 0.5,
  arcSpan: (5 * Math.PI) / 4,
  sizeGrowthRate: 0.75,
  orientation: Math.PI / 2,
  zoom: 1.0,
  numLabels: 20,
  collapseDuration: 300,
  edges: {
    bundlingStrength: 0.97,
    filterMode: 'mute',
    muteOpacity: 0.1,
    edgePoint: 'center',
  },
};

const DEFAULT_STYLE = {
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
        strokeWidth: 1,
        padding: 0,
        length: 5,
      },
    },
  },
  link: {
    strokeColor: '#aaaaaa',
    strokeOpacity: 1,
    strokeWidth: 1,
  },
  highlight: {
    node: {
      strokeColor: '#333333',
    },
    edge: {
      strokeOpacity: 1,
    },
    edgeNode: {
      strokeColor: '#777777',
    },
    label: {
      inner: {},
      outer: {
        link: {},
      },
    },
  },
  depths: [],
};

/** @import { EdgeOptions, Options, Styles } from '$lib/types.js' */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** @param {Options} [userOptions] */
function mergeOptions(userOptions) {
  const merged = { ...DEFAULT_OPTIONS, ...userOptions };
  merged.edges = { ...DEFAULT_OPTIONS.edges, ...(userOptions?.edges || {}) };
  return merged;
}

/** @param {Styles} [userStyles] */
function mergeStyles(userStyles) {
  const s = /** @type {Record<string, any>} */ (userStyles || {});

  /** @param {string} key */
  const mergeGroup = (key) => {
    const d = /** @type {Record<string, any>} */ (DEFAULT_STYLE);
    const merged = { ...(d[key] || {}), ...(s[key] || {}) };
    if (merged && typeof merged === 'object' && 'highlight' in merged)
      delete merged.highlight;
    return merged;
  };

  return {
    node: mergeGroup('node'),
    edge: mergeGroup('edge'),
    edgeNode: mergeGroup('edgeNode'),
    label: {
      ...DEFAULT_STYLE.label,
      ...(s.label || {}),
      inner: { ...DEFAULT_STYLE.label.inner, ...(s.label?.inner || {}) },
      outer: {
        ...DEFAULT_STYLE.label.outer,
        ...(s.label?.outer || {}),
        link: {
          ...DEFAULT_STYLE.label.outer.link,
          ...(s.label?.outer?.link || {}),
        },
      },
    },
    link: { ...(DEFAULT_STYLE.link || {}), ...(s.link || {}) },
    highlight: {
      node: {
        ...((DEFAULT_STYLE.highlight && DEFAULT_STYLE.highlight.node) || {}),
        ...((s.highlight && s.highlight.node) || {}),
      },
      edge: {
        ...((DEFAULT_STYLE.highlight && DEFAULT_STYLE.highlight.edge) || {}),
        ...((s.highlight && s.highlight.edge) || {}),
      },
      edgeNode: {
        ...((DEFAULT_STYLE.highlight && DEFAULT_STYLE.highlight.edgeNode) ||
          {}),
        ...((s.highlight && s.highlight.edgeNode) || {}),
      },
      label: {
        ...((DEFAULT_STYLE.highlight && DEFAULT_STYLE.highlight.label) || {}),
        ...((s.highlight && s.highlight.label) || {}),
        inner: {
          ...(DEFAULT_STYLE.highlight?.label?.inner || {}),
          ...(s.highlight?.label?.inner || {}),
        },
        outer: {
          ...(DEFAULT_STYLE.highlight?.label?.outer || {}),
          ...(s.highlight?.label?.outer || {}),
          link: {
            ...(DEFAULT_STYLE.highlight?.label?.outer?.link || {}),
            ...(s.highlight?.label?.outer?.link || {}),
          },
        },
      },
    },
    depths: s.depths ?? DEFAULT_STYLE.depths,
  };
}

// ── CactusTree class ────────────────────────────────────────────────────────

export class CactusTree {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ width?: number, height?: number, nodes?: any[], edges?: any[], options?: Options, styles?: Styles, pannable?: boolean, zoomable?: boolean, collapsible?: boolean }} config
   */
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = null;

    // Config
    this.width = config.width ?? canvas.width;
    this.height = config.height ?? canvas.height;
    this.nodes = config.nodes ?? [];
    this.edges = config.edges ?? [];
    this.pannable = config.pannable ?? true;
    this.zoomable = config.zoomable ?? true;
    this.collapsible = config.collapsible ?? true;

    // Merged options / styles
    this.mergedOptions = mergeOptions(config.options);
    this.mergedStyle = mergeStyles(config.styles);

    // Layout state
    /** @type {any[]} */
    this.renderedNodes = [];
    this.nodeIdToRenderedNodeMap = new Map();
    this.leafNodes = new Set();
    this.negativeDepthNodes = new Map();
    this.depthStyleCache = new Map();
    this.hierarchicalPathCache = new Map();
    this.parentToChildrenNodeMap = new Map();

    // Interaction state
    /** @type {string|null} */
    this.hoveredNodeId = null;
    this.panX = 0;
    this.panY = 0;
    this.currentZoom = this.mergedOptions.zoom;
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Touch state
    /** @type {any[]} */
    this.touches = [];
    this.lastTouchDistance = 0;

    // Voronoi-based leaf hover
    /** @type {number} Extra hover radius (px in screen coords) added to each leaf's circle */
    this.leafHoverTolerance = 12;
    /** @type {import('./voronoiHover.js').VoronoiData | null} */
    this._voronoiData = null;

    // Zoom limits
    this.minZoomLimit = 0.1;
    this.maxZoomLimit = 10;

    // Animation frame id
    this._animationFrameId = null;

    // Collapse state
    /** @type {Set<string>} */
    this.collapsedNodeIds = new Set();
    /** @type {Set<string>} Node IDs excluded from labeling (descendants of collapsed nodes) */
    this._collapsedDescendantIds = new Set();
    /** @type {Map<string, {x: number, y: number}>} */
    this._animatedPositions = new Map();
    /** @type {number|null} */
    this._collapseAnimFrameId = null;
    this._isCollapseAnimating = false;

    // Event handler refs (for cleanup)
    this._boundHandlers = null;

    // Initial setup
    this._setupMouseHandlers();
    this._scheduleRender();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Update configuration. Any subset of the config properties may be provided.
   * Triggers a full re-render.
   * @param {{ width?: number, height?: number, nodes?: any[], edges?: any[], options?: Options, styles?: Styles, pannable?: boolean, zoomable?: boolean, collapsible?: boolean }} config
   */
  update(config) {
    if (!config) return;

    let needsHandlerRebind = false;

    if (config.width !== undefined) this.width = config.width;
    if (config.height !== undefined) this.height = config.height;
    if (config.options !== undefined)
      this.mergedOptions = mergeOptions(config.options);
    if (config.styles !== undefined)
      this.mergedStyle = mergeStyles(config.styles);
    if (config.nodes !== undefined) {
      const nodesChanged = config.nodes !== this.nodes;
      this.nodes = config.nodes;
      if (nodesChanged) {
        this.currentZoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.collapsedNodeIds.clear();
        this._collapsedDescendantIds.clear();
        this._animatedPositions.clear();
        if (this._collapseAnimFrameId) {
          cancelAnimationFrame(this._collapseAnimFrameId);
          this._collapseAnimFrameId = null;
        }
        this._isCollapseAnimating = false;
      }
    }
    if (config.edges !== undefined) this.edges = config.edges;
    if (config.pannable !== undefined) {
      this.pannable = config.pannable;
      needsHandlerRebind = true;
    }
    if (config.zoomable !== undefined) {
      this.zoomable = config.zoomable;
      needsHandlerRebind = true;
    }
    if (config.collapsible !== undefined) {
      this.collapsible = config.collapsible;
    }

    if (needsHandlerRebind) {
      this._removeMouseHandlers();
      this._setupMouseHandlers();
    }

    this._scheduleRender();
  }

  /**
   * Force a full render (layout + draw).
   */
  render() {
    this._render();
  }

  /**
   * Force a lightweight redraw (no layout recalculation).
   */
  draw() {
    this._draw();
  }

  /**
   * Clean up event listeners and cancel pending animation frames.
   */
  destroy() {
    this._removeMouseHandlers();

    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    if (this._collapseAnimFrameId) {
      cancelAnimationFrame(this._collapseAnimFrameId);
      this._collapseAnimFrameId = null;
    }
  }

  // ── Internal: layout & drawing ──────────────────────────────────────────

  _calculateLayoutAndMaps() {
    clearLabelLayoutCache();

    if (!this.nodes?.length) {
      this.renderedNodes = [];
      this.nodeIdToRenderedNodeMap = new Map();
      this.leafNodes = new Set();
      this.negativeDepthNodes = new Map();
      this.depthStyleCache = new Map();
      this.hierarchicalPathCache = new Map();
      this.parentToChildrenNodeMap = new Map();
      return;
    }

    const layoutZoom = this.mergedOptions.zoom * this.currentZoom;
    this.renderedNodes = calculateLayout(
      this.width,
      this.height,
      layoutZoom,
      this.nodes,
      this.mergedOptions,
    );

    const lookupMaps = /** @type {any} */ (
      buildLookupMaps(this.renderedNodes, this.mergedStyle)
    );

    this.nodeIdToRenderedNodeMap = lookupMaps.nodeIdToRenderedNodeMap;
    this.leafNodes = lookupMaps.leafNodes;
    this.negativeDepthNodes = lookupMaps.negativeDepthNodes;
    this.depthStyleCache = lookupMaps.depthStyleCache;
    this.hierarchicalPathCache = lookupMaps.hierarchicalPathCache;
    this.parentToChildrenNodeMap = lookupMaps.parentToChildrenNodeMap;

    if (this.renderedNodes?.length) {
      const limits = computeZoomLimitsFromNodes(
        this.width,
        this.height,
        this.renderedNodes,
        this.currentZoom,
      );
      this.minZoomLimit = limits.minZoomLimit;
      this.maxZoomLimit = limits.maxZoomLimit;

      if (this.currentZoom < this.minZoomLimit) {
        this.currentZoom = this.minZoomLimit;
      } else if (this.currentZoom > this.maxZoomLimit) {
        this.currentZoom = this.maxZoomLimit;
      }
    }

    // Build Voronoi triangulation for leaf hover tolerance
    this._voronoiData = buildLeafVoronoi(this.renderedNodes, this.leafNodes);

    // Re-apply collapsed positions and descendant exclusion after layout recalculation
    if (this.collapsedNodeIds.size > 0 && !this._isCollapseAnimating) {
      this._animatedPositions = computeCollapsedPositions(
        this.collapsedNodeIds,
        this.parentToChildrenNodeMap,
        this.nodeIdToRenderedNodeMap,
      );
      this._rebuildCollapsedDescendantIds();
    }
  }

  _draw() {
    if (!this.canvas || !this.ctx) return;

    const drawableNodes = this._getDrawableNodes();
    const drawableNodeMap =
      this._animatedPositions.size > 0
        ? this._buildDrawableNodeMap(drawableNodes)
        : this.nodeIdToRenderedNodeMap;

    // Nodes excluding collapsed descendants (for links and labels)
    const visibleNodes =
      this._collapsedDescendantIds.size > 0
        ? drawableNodes.filter((n) => !this._collapsedDescendantIds.has(n.id))
        : drawableNodes;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);

    // Draw connecting parent->child links (only when overlap < 0)
    drawConnectingLinks(
      this.ctx,
      visibleNodes,
      this.parentToChildrenNodeMap,
      this.mergedStyle,
      this.depthStyleCache,
      this.mergedOptions.overlap,
      this.negativeDepthNodes,
      this._collapsedDescendantIds.size > 0
        ? this._collapsedDescendantIds
        : undefined,
    );

    // Compute visible edge node ids
    const edgeNodeIds = drawEdge.computeVisibleEdgeNodeIds(
      this.edges,
      drawableNodeMap,
      this.hoveredNodeId,
    );

    const edgeNodeIdSet = new Set();
    if (edgeNodeIds && edgeNodeIds.length) {
      for (const id of edgeNodeIds) {
        edgeNodeIdSet.add(id);
      }
    }

    // Compute all edge node ids (nodes that appear in any edge)
    const allEdgeNodeIds = new Set();
    for (const edge of this.edges || []) {
      allEdgeNodeIds.add(edge.source);
      allEdgeNodeIds.add(edge.target);
    }

    // Node highlight set
    const nodeHighlightedIds = (() => {
      const s = new Set();
      if (!this.hoveredNodeId) return s;
      s.add(this.hoveredNodeId);

      for (const edge of this.edges || []) {
        if (
          edge.source === this.hoveredNodeId &&
          edgeNodeIdSet.has(edge.target)
        ) {
          s.add(edge.target);
        } else if (
          edge.target === this.hoveredNodeId &&
          edgeNodeIdSet.has(edge.source)
        ) {
          s.add(edge.source);
        }
      }
      return s;
    })();

    // Edge highlight set
    const edgeHighlightedNodeIds = (() => {
      if (!this.hoveredNodeId) return null;
      const s = new Set();
      s.add(this.hoveredNodeId);
      return s;
    })();

    // Draw all nodes in DFS order (keeps subtrees intact when overlapping)
    drawNodes(
      this.ctx,
      drawableNodes,
      this.leafNodes,
      this.hoveredNodeId,
      this.mergedStyle,
      this.depthStyleCache,
      this.negativeDepthNodes,
      nodeHighlightedIds,
      allEdgeNodeIds,
    );

    // Draw edges on top of all nodes
    drawEdge.drawEdges(
      this.ctx,
      this.edges,
      drawableNodeMap,
      this.hierarchicalPathCache,
      this.mergedStyle,
      this.hoveredNodeId,
      edgeHighlightedNodeIds,
      Number(this.mergedOptions?.edges?.bundlingStrength ?? 0.97),
      this.mergedOptions?.edges ?? {},
      this.depthStyleCache,
      this.negativeDepthNodes,
    );

    // Draw labels (collapsed descendants already excluded from visibleNodes)
    drawLabels(
      this.ctx,
      visibleNodes,
      this.leafNodes,
      this.hoveredNodeId,
      nodeHighlightedIds,
      this.mergedStyle,
      this.depthStyleCache,
      this.negativeDepthNodes,
      this.mergedOptions.numLabels,
      this.panX,
      this.panY,
    );

    this.ctx.restore();
  }

  /**
   * Returns renderedNodes with animated position overrides applied.
   * @returns {any[]}
   */
  _getDrawableNodes() {
    if (this._animatedPositions.size === 0) {
      return this.renderedNodes;
    }

    return this.renderedNodes.map((node) => {
      const override = this._animatedPositions.get(node.id);
      if (override) {
        return { ...node, x: override.x, y: override.y };
      }
      return node;
    });
  }

  /**
   * Builds a temporary node map from drawable nodes for edge coordinate lookups.
   * @param {any[]} drawableNodes
   * @returns {Map<string, any>}
   */
  _buildDrawableNodeMap(drawableNodes) {
    const map = new Map();
    for (const node of drawableNodes) {
      map.set(node.id, node);
    }
    return map;
  }

  /**
   * Handle click/tap on a node: toggle collapse/expand of its subtree.
   * @param {string} nodeId
   */
  _handleNodeClick(nodeId) {
    if (!this.collapsible) return;
    if (this.leafNodes.has(nodeId)) return;

    const isCollapsed = this.collapsedNodeIds.has(nodeId);
    const descendantIds = getDescendantIds(
      nodeId,
      this.parentToChildrenNodeMap,
    );
    if (descendantIds.length === 0) return;

    const anchorNode = this.nodeIdToRenderedNodeMap.get(nodeId);
    if (!anchorNode) return;

    if (isCollapsed) {
      this.collapsedNodeIds.delete(nodeId);
    } else {
      this.collapsedNodeIds.add(nodeId);
      // On collapse: exclude descendants from labeling BEFORE animation
      this._rebuildCollapsedDescendantIds();
    }

    this._startCollapseAnimation(descendantIds, anchorNode, !isCollapsed);
  }

  /**
   * Start a collapse or expand animation for the given descendant nodes.
   * @param {string[]} descendantIds
   * @param {{x: number, y: number}} anchorNode
   * @param {boolean} isCollapsing
   */
  _startCollapseAnimation(descendantIds, anchorNode, isCollapsing) {
    if (this._collapseAnimFrameId) {
      cancelAnimationFrame(this._collapseAnimFrameId);
      this._collapseAnimFrameId = null;
    }

    const duration = this.mergedOptions.collapseDuration ?? 300;

    // Snapshot start positions
    const startPositions = new Map();
    for (const id of descendantIds) {
      const current = this._animatedPositions.get(id);
      const original = this.nodeIdToRenderedNodeMap.get(id);
      const source = current || original;
      if (source) {
        startPositions.set(id, { x: source.x, y: source.y });
      }
    }

    // Compute target positions
    const targetPositions = new Map();
    for (const id of descendantIds) {
      if (isCollapsing) {
        targetPositions.set(id, { x: anchorNode.x, y: anchorNode.y });
      } else {
        const original = this.nodeIdToRenderedNodeMap.get(id);
        if (original) {
          // Check if this node is a descendant of another still-collapsed node
          const collapsedAnchor = this._findCollapsedAnchor(id);
          if (collapsedAnchor) {
            targetPositions.set(id, {
              x: collapsedAnchor.x,
              y: collapsedAnchor.y,
            });
          } else {
            targetPositions.set(id, { x: original.x, y: original.y });
          }
        }
      }
    }

    const startTime = performance.now();
    this._isCollapseAnimating = true;

    const animate = (/** @type {number} */ now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(t);

      for (const id of descendantIds) {
        const start = startPositions.get(id);
        const target = targetPositions.get(id);
        if (start && target) {
          this._animatedPositions.set(id, {
            x: start.x + (target.x - start.x) * eased,
            y: start.y + (target.y - start.y) * eased,
          });
        }
      }

      this._draw();

      if (t < 1) {
        this._collapseAnimFrameId = requestAnimationFrame(animate);
      } else {
        this._isCollapseAnimating = false;
        this._collapseAnimFrameId = null;

        // On expand complete, remove overrides for nodes at their original positions
        // and re-include descendants in labeling
        if (!isCollapsing) {
          for (const id of descendantIds) {
            const target = targetPositions.get(id);
            const original = this.nodeIdToRenderedNodeMap.get(id);
            if (
              target &&
              original &&
              target.x === original.x &&
              target.y === original.y
            ) {
              this._animatedPositions.delete(id);
            }
          }
          this._rebuildCollapsedDescendantIds();
        }

        this._draw();
      }
    };

    this._collapseAnimFrameId = requestAnimationFrame(animate);
  }

  /**
   * Find if a node belongs to a still-collapsed ancestor's subtree.
   * @param {string} nodeId
   * @returns {{x: number, y: number}|null}
   */
  _findCollapsedAnchor(nodeId) {
    if (this.collapsedNodeIds.size === 0) return null;

    for (const collapsedId of this.collapsedNodeIds) {
      const descendants = getDescendantIds(
        collapsedId,
        this.parentToChildrenNodeMap,
      );
      if (descendants.includes(nodeId)) {
        return this.nodeIdToRenderedNodeMap.get(collapsedId) || null;
      }
    }

    return null;
  }

  /**
   * Rebuild _collapsedDescendantIds from current collapsedNodeIds.
   */
  _rebuildCollapsedDescendantIds() {
    this._collapsedDescendantIds.clear();
    for (const collapsedId of this.collapsedNodeIds) {
      const descendants = getDescendantIds(
        collapsedId,
        this.parentToChildrenNodeMap,
      );
      for (const id of descendants) {
        this._collapsedDescendantIds.add(id);
      }
    }
  }

  _render() {
    if (!this.canvas || !this.nodes?.length) return;

    this.ctx = setupCanvas(this.canvas, this.width, this.height);
    this._calculateLayoutAndMaps();
    this._draw();
  }

  _scheduleRender() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
    }

    this._animationFrameId = requestAnimationFrame(() => {
      this._render();
      this._animationFrameId = null;
    });
  }

  // ── Internal: event handling ────────────────────────────────────────────

  _setupMouseHandlers() {
    const self = this;

    const mutableState = {
      get canvas() {
        return self.canvas;
      },
      get hoveredNodeId() {
        return self.hoveredNodeId;
      },
      set hoveredNodeId(value) {
        self.hoveredNodeId = value;
      },
      get renderedNodes() {
        return self.renderedNodes;
      },
      get panX() {
        return self.panX;
      },
      set panX(value) {
        self.panX = value;
      },
      get panY() {
        return self.panY;
      },
      set panY(value) {
        self.panY = value;
      },
      get currentZoom() {
        return self.currentZoom;
      },
      set currentZoom(value) {
        self.currentZoom = value;
      },
      get isDragging() {
        return self.isDragging;
      },
      set isDragging(value) {
        self.isDragging = value;
      },
      get lastMouseX() {
        return self.lastMouseX;
      },
      set lastMouseX(value) {
        self.lastMouseX = value;
      },
      get lastMouseY() {
        return self.lastMouseY;
      },
      set lastMouseY(value) {
        self.lastMouseY = value;
      },
      get minZoomLimit() {
        return self.minZoomLimit;
      },
      get maxZoomLimit() {
        return self.maxZoomLimit;
      },
      get touches() {
        return self.touches;
      },
      set touches(value) {
        self.touches = value;
      },
      get lastTouchDistance() {
        return self.lastTouchDistance;
      },
      set lastTouchDistance(value) {
        self.lastTouchDistance = value;
      },
      get voronoiData() {
        return self._voronoiData;
      },
      get leafHoverTolerance() {
        return self.leafHoverTolerance;
      },
      pannable: self.pannable,
      zoomable: self.zoomable,
      onNodeClick: (/** @type {string} */ nodeId) =>
        self._handleNodeClick(nodeId),
      _mouseDownX: 0,
      _mouseDownY: 0,
      _touchStartX: 0,
      _touchStartY: 0,
    };

    const handlers = createMouseHandlers(
      mutableState,
      this.width,
      this.height,
      () => this._scheduleRender(),
    );

    this._boundHandlers = handlers;
    this._mutableState = mutableState;

    this.canvas.addEventListener('mousemove', handlers.onMouseMove);
    this.canvas.addEventListener('mousedown', handlers.onMouseDown);
    this.canvas.addEventListener('mouseup', handlers.onMouseUp);
    this.canvas.addEventListener('mouseleave', handlers.onMouseLeave);
    this.canvas.addEventListener('wheel', handlers.onWheel, { passive: false });
    this.canvas.addEventListener('touchstart', handlers.onTouchStart, {
      passive: false,
    });
    this.canvas.addEventListener('touchmove', handlers.onTouchMove, {
      passive: false,
    });
    this.canvas.addEventListener('touchend', handlers.onTouchEnd, {
      passive: false,
    });
  }

  _removeMouseHandlers() {
    if (!this._boundHandlers) return;

    const h = this._boundHandlers;
    this.canvas.removeEventListener('mousemove', h.onMouseMove);
    this.canvas.removeEventListener('mousedown', h.onMouseDown);
    this.canvas.removeEventListener('mouseup', h.onMouseUp);
    this.canvas.removeEventListener('mouseleave', h.onMouseLeave);
    this.canvas.removeEventListener('wheel', h.onWheel);
    this.canvas.removeEventListener('touchstart', h.onTouchStart);
    this.canvas.removeEventListener('touchmove', h.onTouchMove);
    this.canvas.removeEventListener('touchend', h.onTouchEnd);

    this._boundHandlers = null;
    this._mutableState = null;
  }
}
