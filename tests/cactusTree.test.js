import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CactusTree } from '$lib/cactusTree.js';

/**
 * CactusTree requires a canvas element. We create a minimal mock
 * that satisfies the constructor and internal setupCanvas usage.
 */
function createMockCanvas() {
  const mockCtx = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({
      width: 40,
      actualBoundingBoxAscent: 6,
      actualBoundingBoxDescent: 2,
    })),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    font: '10px sans-serif',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    lineCap: 'butt',
    lineJoin: 'miter',
    globalCompositeOperation: 'source-over',
  };

  const canvas = /** @type {any} */ ({
    width: 0,
    height: 0,
    style: { width: '', height: '' },
    getContext: vi.fn(() => mockCtx),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    })),
  });

  // drawLabels accesses ctx.canvas for label layout dimensions
  /** @type {any} */ (mockCtx).canvas = canvas;

  return { canvas, ctx: mockCtx };
}

const sampleNodes = [
  { id: 'root', name: 'Root', parent: null },
  { id: 'a', name: 'A', parent: 'root' },
  { id: 'b', name: 'B', parent: 'root' },
  { id: 'c', name: 'C', parent: 'a' },
  { id: 'd', name: 'D', parent: 'a' },
];

const sampleEdges = [{ source: 'c', target: 'd' }];

// ── Constructor & basic config ──────────────────────────────────────────────

describe('CactusTree constructor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('creates an instance with default config', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(tree.width).toBe(800);
    expect(tree.height).toBe(600);
    expect(tree.nodes).toEqual([]);
    expect(tree.edges).toEqual([]);
    expect(tree.pannable).toBe(true);
    expect(tree.zoomable).toBe(true);
    expect(tree.collapsible).toBe(true);

    tree.destroy();
  });

  it('uses canvas dimensions when width/height not provided', () => {
    const { canvas } = createMockCanvas();
    canvas.width = 400;
    canvas.height = 300;
    const tree = new CactusTree(canvas);

    expect(tree.width).toBe(400);
    expect(tree.height).toBe(300);

    tree.destroy();
  });

  it('accepts nodes and edges in config', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    expect(tree.nodes).toBe(sampleNodes);
    expect(tree.edges).toBe(sampleEdges);

    tree.destroy();
  });
});

// ── mergeOptions (tested indirectly via mergedOptions) ──────────────────────

describe('mergeOptions (via CactusTree.mergedOptions)', () => {
  it('uses default options when none provided', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(tree.mergedOptions.overlap).toBe(0.5);
    expect(tree.mergedOptions.arcSpan).toBe((5 * Math.PI) / 4);
    expect(tree.mergedOptions.sizeGrowthRate).toBe(0.75);
    expect(tree.mergedOptions.orientation).toBe(Math.PI / 2);
    expect(tree.mergedOptions.zoom).toBe(1.0);
    expect(tree.mergedOptions.numLabels).toBe(20);
    expect(tree.mergedOptions.edges.bundlingStrength).toBe(0.97);
    expect(tree.mergedOptions.edges.filterMode).toBe('mute');
    expect(tree.mergedOptions.edges.muteOpacity).toBe(0.1);

    tree.destroy();
  });

  it('overrides specific options while keeping defaults', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      options: { overlap: 0.8, numLabels: 10 },
    });

    expect(tree.mergedOptions.overlap).toBe(0.8);
    expect(tree.mergedOptions.numLabels).toBe(10);
    // Defaults preserved
    expect(tree.mergedOptions.arcSpan).toBe((5 * Math.PI) / 4);
    expect(tree.mergedOptions.sizeGrowthRate).toBe(0.75);

    tree.destroy();
  });

  it('deep merges edges sub-object', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      options: { edges: { bundlingStrength: 0.5 } },
    });

    expect(tree.mergedOptions.edges.bundlingStrength).toBe(0.5);
    // Other edge defaults preserved
    expect(tree.mergedOptions.edges.filterMode).toBe('mute');
    expect(tree.mergedOptions.edges.muteOpacity).toBe(0.1);

    tree.destroy();
  });

  it('deep merges partial edges options', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      options: { edges: { filterMode: 'hide' } },
    });

    expect(tree.mergedOptions.edges.filterMode).toBe('hide');
    expect(tree.mergedOptions.edges.bundlingStrength).toBe(0.97);
    expect(tree.mergedOptions.edges.muteOpacity).toBe(0.1);

    tree.destroy();
  });
});

// ── mergeStyles (tested indirectly via mergedStyle) ─────────────────────────

describe('mergeStyles (via CactusTree.mergedStyle)', () => {
  it('uses default styles when none provided', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(tree.mergedStyle.node.fillColor).toBe('#efefef');
    expect(tree.mergedStyle.node.strokeColor).toBe('#aaaaaa');
    expect(tree.mergedStyle.edge.strokeColor).toBe('#333333');
    expect(tree.mergedStyle.link.strokeColor).toBe('#aaaaaa');
    expect(tree.mergedStyle.highlight.node.strokeColor).toBe('#333333');
    expect(tree.mergedStyle.highlight.edge.strokeOpacity).toBe(1);

    tree.destroy();
  });

  it('overrides node style while keeping other defaults', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      styles: { node: { fillColor: '#ff0000' } },
    });

    expect(tree.mergedStyle.node.fillColor).toBe('#ff0000');
    // Other node defaults preserved
    expect(tree.mergedStyle.node.strokeColor).toBe('#aaaaaa');
    expect(tree.mergedStyle.node.strokeWidth).toBe(1);
    expect(tree.mergedStyle.node.fillOpacity).toBe(1);

    tree.destroy();
  });

  it('deep merges label.inner without losing defaults', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      styles: { label: { inner: { textColor: '#ff0000' } } },
    });

    expect(tree.mergedStyle.label.inner.textColor).toBe('#ff0000');
    // Other inner defaults preserved
    expect(tree.mergedStyle.label.inner.textOpacity).toBe(1);
    expect(tree.mergedStyle.label.inner.fontFamily).toBe('monospace');
    expect(tree.mergedStyle.label.inner.fontWeight).toBe('normal');
    expect(tree.mergedStyle.label.inner.minFontSize).toBe(9);
    expect(tree.mergedStyle.label.inner.maxFontSize).toBe(14);

    tree.destroy();
  });

  it('deep merges label.outer without losing defaults', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      styles: { label: { outer: { fontSize: 12 } } },
    });

    expect(tree.mergedStyle.label.outer.fontSize).toBe(12);
    // Other outer defaults preserved
    expect(tree.mergedStyle.label.outer.textColor).toBe('#333333');
    expect(tree.mergedStyle.label.outer.fontFamily).toBe('monospace');
    expect(tree.mergedStyle.label.outer.padding).toBe(1);

    tree.destroy();
  });

  it('deep merges label.outer.link without losing defaults', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      styles: { label: { outer: { link: { strokeColor: '#ff0000' } } } },
    });

    expect(tree.mergedStyle.label.outer.link.strokeColor).toBe('#ff0000');
    // Other link defaults preserved
    expect(tree.mergedStyle.label.outer.link.strokeOpacity).toBe(1);
    expect(tree.mergedStyle.label.outer.link.strokeWidth).toBe(1);
    expect(tree.mergedStyle.label.outer.link.padding).toBe(0);
    expect(tree.mergedStyle.label.outer.link.length).toBe(5);

    tree.destroy();
  });

  it('deep merges highlight.label.inner without losing other inner props', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      styles: {
        highlight: {
          label: {
            inner: {
              textColor: '#00ff00',
              textOpacity: 0.8,
              fontWeight: 'bold',
            },
          },
        },
      },
    });

    expect(tree.mergedStyle.highlight.label.inner.textColor).toBe('#00ff00');
    expect(tree.mergedStyle.highlight.label.inner.textOpacity).toBe(0.8);
    expect(tree.mergedStyle.highlight.label.inner.fontWeight).toBe('bold');

    tree.destroy();
  });

  it('deep merges highlight.label preserving both inner and outer', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      styles: {
        highlight: {
          label: {
            inner: { textColor: '#ff0000' },
            outer: { fontWeight: 'bold', textColor: '#00ff00' },
          },
        },
      },
    });

    // inner preserved
    expect(tree.mergedStyle.highlight.label.inner.textColor).toBe('#ff0000');
    // outer preserved
    expect(tree.mergedStyle.highlight.label.outer.fontWeight).toBe('bold');
    expect(tree.mergedStyle.highlight.label.outer.textColor).toBe('#00ff00');

    tree.destroy();
  });

  it('partial highlight.label.outer does not clobber inner', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      styles: {
        highlight: {
          label: {
            inner: { textColor: '#aaa' },
            outer: { fontWeight: 'bold' },
          },
        },
      },
    });

    // Both sub-objects should be present and independent
    expect(tree.mergedStyle.highlight.label.inner.textColor).toBe('#aaa');
    expect(tree.mergedStyle.highlight.label.outer.fontWeight).toBe('bold');

    tree.destroy();
  });

  it('passes through depths array', () => {
    const { canvas } = createMockCanvas();
    const depths = [
      { depth: 0, node: { fillColor: '#000' } },
      { depth: -1, node: { fillColor: '#fff' } },
    ];
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      styles: { depths },
    });

    expect(tree.mergedStyle.depths).toBe(depths);

    tree.destroy();
  });

  it('uses empty depths array as default', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(tree.mergedStyle.depths).toEqual([]);

    tree.destroy();
  });
});

// ── update ──────────────────────────────────────────────────────────────────

describe('CactusTree.update', () => {
  it('updates width and height', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    tree.update({ width: 1024, height: 768 });

    expect(tree.width).toBe(1024);
    expect(tree.height).toBe(768);

    tree.destroy();
  });

  it('updates nodes and edges', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    tree.update({ nodes: sampleNodes, edges: sampleEdges });

    expect(tree.nodes).toBe(sampleNodes);
    expect(tree.edges).toBe(sampleEdges);

    tree.destroy();
  });

  it('updates options with deep merge', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    tree.update({ options: { edges: { filterMode: 'hide' } } });

    expect(tree.mergedOptions.edges.filterMode).toBe('hide');
    expect(tree.mergedOptions.edges.bundlingStrength).toBe(0.97);

    tree.destroy();
  });

  it('updates styles with deep merge', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    tree.update({
      styles: { label: { inner: { textColor: '#ff0000' } } },
    });

    expect(tree.mergedStyle.label.inner.textColor).toBe('#ff0000');
    expect(tree.mergedStyle.label.inner.fontFamily).toBe('monospace');

    tree.destroy();
  });

  it('does nothing for null config', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(() => tree.update(/** @type {any} */ (null))).not.toThrow();

    tree.destroy();
  });

  it('rebinds handlers when pannable changes', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    const removeCount = canvas.removeEventListener.mock.calls.length;
    tree.update({ pannable: false });

    expect(tree.pannable).toBe(false);
    expect(canvas.removeEventListener.mock.calls.length).toBeGreaterThan(
      removeCount,
    );

    tree.destroy();
  });
});

// ── destroy ─────────────────────────────────────────────────────────────────

describe('CactusTree.destroy', () => {
  it('removes event listeners', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    tree.destroy();

    expect(canvas.removeEventListener).toHaveBeenCalled();
  });

  it('can be called multiple times safely', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(() => {
      tree.destroy();
      tree.destroy();
    }).not.toThrow();
  });
});

// ── Collapse/Expand feature ─────────────────────────────────────────────────

describe('CactusTree collapse feature', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('defaults collapsible to true', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(tree.collapsible).toBe(true);

    tree.destroy();
  });

  it('accepts collapsible: false in config', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      collapsible: false,
    });

    expect(tree.collapsible).toBe(false);

    tree.destroy();
  });

  it('initializes collapse state as empty', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(tree.collapsedNodeIds.size).toBe(0);
    expect(tree._collapsedDescendantIds.size).toBe(0);
    expect(tree._animatedPositions.size).toBe(0);
    expect(tree._isCollapseAnimating).toBe(false);

    tree.destroy();
  });

  it('_handleNodeClick does nothing when collapsible is false', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
      collapsible: false,
    });

    vi.advanceTimersByTime(100);

    tree._handleNodeClick('a');

    expect(tree.collapsedNodeIds.size).toBe(0);

    tree.destroy();
  });

  it('_handleNodeClick does nothing for leaf nodes', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    vi.advanceTimersByTime(100);

    tree._handleNodeClick('c');

    expect(tree.collapsedNodeIds.size).toBe(0);

    tree.destroy();
  });

  it('_handleNodeClick adds non-leaf to collapsedNodeIds', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    vi.advanceTimersByTime(100);

    tree._handleNodeClick('a');

    expect(tree.collapsedNodeIds.has('a')).toBe(true);

    tree.destroy();
  });

  it('_handleNodeClick toggles collapse state', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    vi.advanceTimersByTime(100);

    // First click: collapse
    tree._handleNodeClick('a');
    expect(tree.collapsedNodeIds.has('a')).toBe(true);

    // Second click: expand
    tree._handleNodeClick('a');
    expect(tree.collapsedNodeIds.has('a')).toBe(false);

    tree.destroy();
  });

  it('_handleNodeClick populates _collapsedDescendantIds on collapse', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    vi.advanceTimersByTime(100);

    tree._handleNodeClick('a');

    // 'a' has children 'c' and 'd'
    expect(tree._collapsedDescendantIds.has('c')).toBe(true);
    expect(tree._collapsedDescendantIds.has('d')).toBe(true);
    expect(tree._collapsedDescendantIds.has('a')).toBe(false);

    tree.destroy();
  });

  it('_getDrawableNodes returns renderedNodes when nothing animated', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    vi.advanceTimersByTime(100);

    const drawableNodes = tree._getDrawableNodes();
    expect(drawableNodes).toBe(tree.renderedNodes);

    tree.destroy();
  });

  it('_getDrawableNodes applies animated position overrides', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    vi.advanceTimersByTime(100);

    // Manually set an animated position override
    tree._animatedPositions.set('c', { x: 999, y: 888 });

    const drawableNodes = tree._getDrawableNodes();

    // Should be a new array (not the same reference)
    expect(drawableNodes).not.toBe(tree.renderedNodes);

    const overriddenNode = drawableNodes.find((n) => n.id === 'c');
    expect(overriddenNode.x).toBe(999);
    expect(overriddenNode.y).toBe(888);

    // Non-overridden nodes keep original positions
    const normalNode = drawableNodes.find((n) => n.id === 'a');
    const originalNode = tree.renderedNodes.find((n) => n.id === 'a');
    expect(normalNode.x).toBe(originalNode.x);
    expect(normalNode.y).toBe(originalNode.y);

    tree.destroy();
  });

  it('_buildDrawableNodeMap creates map from node array', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    const nodes = [
      { id: 'x', x: 10, y: 20 },
      { id: 'y', x: 30, y: 40 },
    ];
    const map = tree._buildDrawableNodeMap(nodes);

    expect(map.size).toBe(2);
    expect(map.get('x')).toEqual({ id: 'x', x: 10, y: 20 });
    expect(map.get('y')).toEqual({ id: 'y', x: 30, y: 40 });

    tree.destroy();
  });

  it('_rebuildCollapsedDescendantIds rebuilds from collapsedNodeIds', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    vi.advanceTimersByTime(100);

    // Manually add to collapsedNodeIds and rebuild
    tree.collapsedNodeIds.add('root');
    tree._rebuildCollapsedDescendantIds();

    expect(tree._collapsedDescendantIds.has('a')).toBe(true);
    expect(tree._collapsedDescendantIds.has('b')).toBe(true);
    expect(tree._collapsedDescendantIds.has('c')).toBe(true);
    expect(tree._collapsedDescendantIds.has('d')).toBe(true);
    expect(tree._collapsedDescendantIds.has('root')).toBe(false);

    tree.destroy();
  });

  it('update clears collapse state when nodes change', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, {
      width: 800,
      height: 600,
      nodes: sampleNodes,
      edges: sampleEdges,
    });

    vi.advanceTimersByTime(100);

    // Collapse a node
    tree._handleNodeClick('a');
    expect(tree.collapsedNodeIds.size).toBeGreaterThan(0);

    // Update with new nodes
    const newNodes = [
      { id: 'root', name: 'Root', parent: null },
      { id: 'x', name: 'X', parent: 'root' },
    ];
    tree.update({ nodes: newNodes });

    expect(tree.collapsedNodeIds.size).toBe(0);
    expect(tree._collapsedDescendantIds.size).toBe(0);
    expect(tree._animatedPositions.size).toBe(0);

    tree.destroy();
  });

  it('update with collapsible updates the property', () => {
    const { canvas } = createMockCanvas();
    const tree = new CactusTree(canvas, { width: 800, height: 600 });

    expect(tree.collapsible).toBe(true);

    tree.update({ collapsible: false });
    expect(tree.collapsible).toBe(false);

    tree.update({ collapsible: true });
    expect(tree.collapsible).toBe(true);

    tree.destroy();
  });
});
