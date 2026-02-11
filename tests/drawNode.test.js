import { describe, it, expect, vi } from 'vitest';
import {
  readStyleProp,
  readNestedStyleProp,
  resolveDepthStyle,
  calculateNodeStyle,
  drawNode,
  drawNodes,
  isPointInNode,
  findHoveredNode,
} from '$lib/drawNode.js';

// ── readStyleProp ───────────────────────────────────────────────────────────

describe('readStyleProp', () => {
  it('returns depth style value when present', () => {
    const depthStyle = { node: { fillColor: '#ff0000' } };
    const mergedStyle = { node: { fillColor: '#00ff00' } };
    expect(readStyleProp(depthStyle, mergedStyle, 'node', 'fillColor')).toBe(
      '#ff0000',
    );
  });

  it('falls back to merged style when depth style missing', () => {
    const mergedStyle = { node: { fillColor: '#00ff00' } };
    expect(readStyleProp(null, mergedStyle, 'node', 'fillColor')).toBe(
      '#00ff00',
    );
  });

  it('falls back to merged style when depth style group missing', () => {
    const depthStyle = { edge: { strokeColor: '#ff0000' } };
    const mergedStyle = { node: { fillColor: '#00ff00' } };
    expect(readStyleProp(depthStyle, mergedStyle, 'node', 'fillColor')).toBe(
      '#00ff00',
    );
  });

  it('falls back to default when both are missing', () => {
    expect(readStyleProp(null, null, 'node', 'fillColor', '#333333')).toBe(
      '#333333',
    );
  });

  it('returns undefined as default when no default specified', () => {
    expect(readStyleProp(null, null, 'node', 'fillColor')).toBeUndefined();
  });

  it('depth value of 0 is treated as defined', () => {
    const depthStyle = { node: { strokeWidth: 0 } };
    const mergedStyle = { node: { strokeWidth: 2 } };
    expect(readStyleProp(depthStyle, mergedStyle, 'node', 'strokeWidth')).toBe(
      0,
    );
  });

  it('depth value of false is treated as defined', () => {
    const depthStyle = { node: { visible: false } };
    const mergedStyle = { node: { visible: true } };
    expect(readStyleProp(depthStyle, mergedStyle, 'node', 'visible')).toBe(
      false,
    );
  });
});

// ── readNestedStyleProp ─────────────────────────────────────────────────────

describe('readNestedStyleProp', () => {
  it('returns depth nested value when present', () => {
    const depthStyle = { label: { inner: { textColor: '#ff0000' } } };
    const mergedStyle = { label: { inner: { textColor: '#00ff00' } } };
    expect(
      readNestedStyleProp(
        depthStyle,
        mergedStyle,
        'label',
        'inner',
        'textColor',
      ),
    ).toBe('#ff0000');
  });

  it('falls back to merged nested value', () => {
    const mergedStyle = { label: { inner: { textColor: '#00ff00' } } };
    expect(
      readNestedStyleProp(null, mergedStyle, 'label', 'inner', 'textColor'),
    ).toBe('#00ff00');
  });

  it('falls back to default value', () => {
    expect(
      readNestedStyleProp(null, null, 'label', 'inner', 'textColor', '#333'),
    ).toBe('#333');
  });

  it('handles missing inner group in depth style', () => {
    const depthStyle = { label: {} };
    const mergedStyle = { label: { inner: { textColor: '#00ff00' } } };
    expect(
      readNestedStyleProp(
        depthStyle,
        mergedStyle,
        'label',
        'inner',
        'textColor',
      ),
    ).toBe('#00ff00');
  });
});

// ── resolveDepthStyle ───────────────────────────────────────────────────────

describe('resolveDepthStyle', () => {
  it('returns positive depth style from cache', () => {
    const depthStyleCache = new Map();
    const style2 = { depth: 2, node: { fillColor: '#ff0000' } };
    depthStyleCache.set(2, style2);

    const result = resolveDepthStyle(
      2,
      'node1',
      { depths: [] },
      depthStyleCache,
      new Map(),
    );
    expect(result).toBe(style2);
  });

  it('returns null when no matching depth style', () => {
    const result = resolveDepthStyle(
      5,
      'node1',
      { depths: [] },
      new Map(),
      new Map(),
    );
    expect(result).toBeNull();
  });

  it('negative depth overrides positive depth', () => {
    const depthStyleCache = new Map();
    const positiveStyle = { depth: 3, node: { fillColor: '#ff0000' } };
    depthStyleCache.set(3, positiveStyle);

    const negativeStyle = { depth: -1, node: { fillColor: '#00ff00' } };
    const negativeDepthNodes = new Map();
    negativeDepthNodes.set(-1, new Set(['node1', 'node2']));

    const mergedStyle = { depths: [positiveStyle, negativeStyle] };

    const result = resolveDepthStyle(
      3,
      'node1',
      mergedStyle,
      depthStyleCache,
      negativeDepthNodes,
    );
    // Negative depth merges on top: fillColor from negative wins
    expect(result.node.fillColor).toBe('#00ff00');
  });

  it('last matching negative depth wins (not first)', () => {
    const negativeStyle1 = { depth: -2, node: { fillColor: '#ff0000' } };
    const negativeStyle2 = { depth: -1, node: { fillColor: '#00ff00' } };
    const negativeDepthNodes = new Map();
    negativeDepthNodes.set(-2, new Set(['node1']));
    negativeDepthNodes.set(-1, new Set(['node1']));

    const mergedStyle = { depths: [negativeStyle1, negativeStyle2] };

    const result = resolveDepthStyle(
      3,
      'node1',
      mergedStyle,
      new Map(),
      negativeDepthNodes,
    );
    // Last matching negative depth wins: fillColor from -1 overrides -2
    expect(result.node.fillColor).toBe('#00ff00');
  });

  it('skips negative depth when node is not in its set', () => {
    const negativeStyle = { depth: -1, node: { fillColor: '#00ff00' } };
    const negativeDepthNodes = new Map();
    negativeDepthNodes.set(-1, new Set(['other_node']));

    const mergedStyle = { depths: [negativeStyle] };

    const result = resolveDepthStyle(
      0,
      'node1',
      mergedStyle,
      new Map(),
      negativeDepthNodes,
    );
    expect(result).toBeNull();
  });

  it('handles null mergedStyle.depths', () => {
    const result = resolveDepthStyle(
      0,
      'node1',
      { depths: null },
      new Map(),
      new Map(),
    );
    expect(result).toBeNull();
  });

  it('handles undefined mergedStyle', () => {
    const result = resolveDepthStyle(
      0,
      'node1',
      undefined,
      new Map(),
      new Map(),
    );
    expect(result).toBeNull();
  });
});

// ── calculateNodeStyle ──────────────────────────────────────────────────────

describe('calculateNodeStyle', () => {
  const defaultMergedStyle = {
    node: {
      fillColor: '#efefef',
      fillOpacity: 1,
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
    },
    depths: [],
  };

  it('returns base style for non-hovered node', () => {
    const style = calculateNodeStyle(
      { id: 'a' },
      0,
      null,
      defaultMergedStyle,
      new Map(),
      new Map(),
      null,
    );
    expect(style.fill).toBe('#efefef');
    expect(style.fillOpacity).toBe(1);
    expect(style.stroke).toBe('#aaaaaa');
    expect(style.strokeWidth).toBe(1);
    expect(style.isHovered).toBe(false);
  });

  it('returns highlight style for directly hovered node', () => {
    const style = calculateNodeStyle(
      { id: 'a' },
      0,
      'a',
      defaultMergedStyle,
      new Map(),
      new Map(),
      null,
    );
    expect(style.fill).toBe('#dedede');
    expect(style.stroke).toBe('#333333');
    expect(style.isHovered).toBe(true);
  });

  it('returns highlight style for link-highlighted node', () => {
    const highlightedIds = new Set(['a']);
    const style = calculateNodeStyle(
      { id: 'a' },
      0,
      'other',
      defaultMergedStyle,
      new Map(),
      new Map(),
      highlightedIds,
    );
    expect(style.fill).toBe('#dedede');
    expect(style.isHovered).toBe(true);
  });

  it('uses depth style over global style', () => {
    const depthStyleCache = new Map();
    depthStyleCache.set(1, {
      depth: 1,
      node: { fillColor: '#ff0000', strokeColor: '#0000ff' },
    });

    const mergedStyle = {
      ...defaultMergedStyle,
      depths: [
        { depth: 1, node: { fillColor: '#ff0000', strokeColor: '#0000ff' } },
      ],
    };

    const style = calculateNodeStyle(
      { id: 'a' },
      1,
      null,
      mergedStyle,
      depthStyleCache,
      new Map(),
      null,
    );
    expect(style.fill).toBe('#ff0000');
    expect(style.stroke).toBe('#0000ff');
  });

  it('uses depth highlight style over global highlight', () => {
    const depthStyleCache = new Map();
    const depthStyle = {
      depth: 1,
      node: { fillColor: '#ff0000' },
      highlight: { node: { fillColor: '#00ff00' } },
    };
    depthStyleCache.set(1, depthStyle);

    const mergedStyle = {
      ...defaultMergedStyle,
      depths: [depthStyle],
    };

    const style = calculateNodeStyle(
      { id: 'a' },
      1,
      'a',
      mergedStyle,
      depthStyleCache,
      new Map(),
      null,
    );
    expect(style.fill).toBe('#00ff00');
  });

  it('falls back to base style when highlight prop is not set', () => {
    const mergedStyle = {
      node: {
        fillColor: '#efefef',
        fillOpacity: 1,
        strokeColor: '#aaaaaa',
        strokeOpacity: 1,
        strokeWidth: 1,
      },
      highlight: {
        node: {
          fillColor: '#dedede',
        },
      },
      depths: [],
    };

    const style = calculateNodeStyle(
      { id: 'a' },
      0,
      'a',
      mergedStyle,
      new Map(),
      new Map(),
      null,
    );
    // fillColor comes from highlight
    expect(style.fill).toBe('#dedede');
    // strokeColor falls back to base because highlight.node.strokeColor is undefined
    expect(style.stroke).toBe('#aaaaaa');
  });
});

// ── isPointInNode ───────────────────────────────────────────────────────────

describe('isPointInNode', () => {
  it('returns true for point at center', () => {
    expect(isPointInNode(50, 50, 50, 50, 10)).toBe(true);
  });

  it('returns true for point on edge', () => {
    expect(isPointInNode(60, 50, 50, 50, 10)).toBe(true);
  });

  it('returns false for point outside', () => {
    expect(isPointInNode(61, 50, 50, 50, 10)).toBe(false);
  });

  it('returns false for radius < 1', () => {
    expect(isPointInNode(50, 50, 50, 50, 0.5)).toBe(false);
  });
});

// ── findHoveredNode ─────────────────────────────────────────────────────────

describe('findHoveredNode', () => {
  const nodes = [
    { x: 100, y: 100, radius: 50, node: { id: 'big' } },
    { x: 100, y: 100, radius: 20, node: { id: 'small' } },
    { x: 300, y: 300, radius: 30, node: { id: 'far' } },
  ];

  it('returns smallest overlapping node', () => {
    expect(findHoveredNode(100, 100, nodes)).toBe('small');
  });

  it('returns null when no node is hovered', () => {
    expect(findHoveredNode(500, 500, nodes)).toBeNull();
  });

  it('returns the only matching node', () => {
    expect(findHoveredNode(300, 300, nodes)).toBe('far');
  });
});

// ── drawNode ────────────────────────────────────────────────────────────────

describe('drawNode', () => {
  /** @returns {any} */
  function createMockCtx() {
    return {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    };
  }

  const mergedStyle = {
    node: {
      fillColor: '#efefef',
      fillOpacity: 1,
      strokeColor: '#aaaaaa',
      strokeOpacity: 1,
      strokeWidth: 1,
    },
    highlight: { node: {} },
    depths: [],
  };

  it('returns false for null ctx', () => {
    expect(
      drawNode(
        /** @type {any} */ (null),
        0,
        0,
        10,
        { id: 'a' },
        0,
        null,
        mergedStyle,
        new Map(),
        new Map(),
        null,
      ),
    ).toBe(false);
  });

  it('returns false for radius < 1', () => {
    const ctx = createMockCtx();
    expect(
      drawNode(
        ctx,
        0,
        0,
        0.5,
        { id: 'a' },
        0,
        null,
        mergedStyle,
        new Map(),
        new Map(),
        null,
      ),
    ).toBe(false);
  });

  it('draws a node and returns true', () => {
    const ctx = createMockCtx();
    const result = drawNode(
      ctx,
      50,
      50,
      20,
      { id: 'a' },
      0,
      null,
      mergedStyle,
      new Map(),
      new Map(),
      null,
    );
    expect(result).toBe(true);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalledWith(50, 50, 20, 0, 2 * Math.PI);
    expect(ctx.fill).toHaveBeenCalled();
  });
});

// ── drawNodes ───────────────────────────────────────────────────────────────

describe('drawNodes', () => {
  /** @returns {any} */
  function createMockCtx() {
    return {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    };
  }

  const mergedStyle = {
    node: {
      fillColor: '#efefef',
      fillOpacity: 1,
      strokeColor: '#aaaaaa',
      strokeOpacity: 1,
      strokeWidth: 1,
    },
    highlight: { node: {} },
    depths: [],
  };

  const renderedNodes = [
    { x: 50, y: 50, radius: 30, node: { id: 'root' }, depth: 0 },
    { x: 100, y: 100, radius: 15, node: { id: 'child' }, depth: 1 },
    { x: 150, y: 150, radius: 5, node: { id: 'leaf' }, depth: 2 },
  ];

  const leafNodes = new Set(['leaf']);

  it('returns zero counts for null ctx', () => {
    const result = drawNodes(
      /** @type {any} */ (null),
      renderedNodes,
      leafNodes,
      null,
      mergedStyle,
      new Map(),
      new Map(),
      null,
    );
    expect(result).toEqual({ rendered: 0, filtered: 0 });
  });

  it('returns zero counts for empty nodes', () => {
    const ctx = createMockCtx();
    const result = drawNodes(
      ctx,
      [],
      leafNodes,
      null,
      mergedStyle,
      new Map(),
      new Map(),
      null,
    );
    expect(result).toEqual({ rendered: 0, filtered: 0 });
  });

  it('draws all nodes in "all" mode', () => {
    const ctx = createMockCtx();
    const result = drawNodes(
      ctx,
      renderedNodes,
      leafNodes,
      null,
      mergedStyle,
      new Map(),
      new Map(),
      null,
      'all',
    );
    expect(result.rendered).toBe(3);
    expect(result.filtered).toBe(0);
  });

  it('draws only non-leaf nodes in "nonLeaf" mode', () => {
    const ctx = createMockCtx();
    const result = drawNodes(
      ctx,
      renderedNodes,
      leafNodes,
      null,
      mergedStyle,
      new Map(),
      new Map(),
      null,
      'nonLeaf',
    );
    expect(result.rendered).toBe(2);
    expect(result.filtered).toBe(1);
  });

  it('draws only leaf nodes in "leaf" mode', () => {
    const ctx = createMockCtx();
    const result = drawNodes(
      ctx,
      renderedNodes,
      leafNodes,
      null,
      mergedStyle,
      new Map(),
      new Map(),
      null,
      'leaf',
    );
    expect(result.rendered).toBe(1);
    expect(result.filtered).toBe(2);
  });
});
