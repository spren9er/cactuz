import { describe, it, expect } from 'vitest';
import { CactusLayout } from '$lib/cactusLayout.js';

const sampleNodes = [
  { id: 'root', name: 'Root', parent: null },
  { id: 'a', name: 'A', parent: 'root' },
  { id: 'b', name: 'B', parent: 'root' },
  { id: 'c', name: 'C', parent: 'a' },
  { id: 'd', name: 'D', parent: 'a' },
  { id: 'e', name: 'E', parent: 'b' },
];

// ── Constructor ─────────────────────────────────────────────────────────────

describe('CactusLayout constructor', () => {
  it('sets default parameters', () => {
    const layout = new CactusLayout(800, 600);
    expect(layout.width).toBe(800);
    expect(layout.height).toBe(600);
    expect(layout.zoom).toBe(1);
    expect(layout.overlap).toBe(0);
    expect(layout.arcSpan).toBe(Math.PI);
    expect(layout.sizeGrowthRate).toBe(0.75);
  });

  it('accepts custom parameters', () => {
    const layout = new CactusLayout(800, 600, 2, 0.5, Math.PI * 2, 0.8);
    expect(layout.zoom).toBe(2);
    expect(layout.overlap).toBe(0.5);
    expect(layout.arcSpan).toBe(Math.PI * 2);
    expect(layout.sizeGrowthRate).toBe(0.8);
  });
});

// ── getShared ───────────────────────────────────────────────────────────────

describe('CactusLayout.getShared', () => {
  it('returns a CactusLayout instance', () => {
    const layout = CactusLayout.getShared(800, 600);
    expect(layout).toBeInstanceOf(CactusLayout);
  });

  it('returns the same instance on repeated calls', () => {
    const layout1 = CactusLayout.getShared(800, 600);
    const layout2 = CactusLayout.getShared(1024, 768);
    expect(layout1).toBe(layout2);
    expect(layout2.width).toBe(1024);
    expect(layout2.height).toBe(768);
  });
});

// ── getRadius ───────────────────────────────────────────────────────────────

describe('getRadius', () => {
  it('returns 1 for weight 1', () => {
    const layout = new CactusLayout(800, 600);
    expect(layout.getRadius(1)).toBe(1);
  });

  it('scales with sizeGrowthRate', () => {
    const layout = new CactusLayout(800, 600, 1, 0, Math.PI, 0.75);
    const r4 = layout.getRadius(4);
    // 4^0.75 = 2^1.5 ≈ 2.828
    expect(r4).toBeCloseTo(Math.pow(4, 0.75), 5);
  });

  it('returns 0 for weight 0', () => {
    const layout = new CactusLayout(800, 600);
    expect(layout.getRadius(0)).toBe(0);
  });
});

// ── weight ──────────────────────────────────────────────────────────────────

describe('weight', () => {
  it('returns 1 for leaf node', () => {
    const layout = new CactusLayout(800, 600);
    const leaf = /** @type {any} */ ({ id: 'leaf', children: [] });
    expect(layout.weight(leaf)).toBe(1);
  });

  it('returns sum of children weights for parent', () => {
    const layout = new CactusLayout(800, 600);
    const leaf1 = { id: 'l1', children: [] };
    const leaf2 = { id: 'l2', children: [] };
    const parent = /** @type {any} */ ({ id: 'p', children: [leaf1, leaf2] });

    expect(layout.weight(parent)).toBe(2);
  });

  it('uses explicit weight when provided', () => {
    const layout = new CactusLayout(800, 600);
    const node = /** @type {any} */ ({ id: 'n', weight: 5, children: [] });
    expect(layout.weight(node)).toBe(5);
  });

  it('caches weight calculations', () => {
    const layout = new CactusLayout(800, 600);
    const leaf = /** @type {any} */ ({ id: 'leaf', children: [] });

    layout.weight(leaf);
    expect(layout.weightCache.has('leaf')).toBe(true);
    expect(layout.weightCache.get('leaf')).toBe(1);
  });

  it('calculates recursively for deep trees', () => {
    const layout = new CactusLayout(800, 600);
    const l1 = { id: 'l1', children: [] };
    const l2 = { id: 'l2', children: [] };
    const l3 = { id: 'l3', children: [] };
    const mid = { id: 'mid', children: [l1, l2] };
    const root = /** @type {any} */ ({ id: 'root', children: [mid, l3] });

    expect(layout.weight(root)).toBe(3);
  });
});

// ── sortChildNodesByWeight ──────────────────────────────────────────────────

describe('sortChildNodesByWeight', () => {
  it('sorts children by weight ascending', () => {
    const layout = new CactusLayout(800, 600);
    const l1 = { id: 'l1', children: [] };
    const l2 = { id: 'l2', children: [] };
    const heavy = /** @type {any} */ ({ id: 'heavy', children: [l1, l2] });
    const light = /** @type {any} */ ({ id: 'light', children: [] });

    // Precompute weights
    layout.weight(heavy);
    layout.weight(light);

    const sorted = layout.sortChildNodesByWeight([heavy, light]);
    expect(sorted[0].id).toBe('light');
    expect(sorted[1].id).toBe('heavy');
  });

  it('does not mutate the original array', () => {
    const layout = new CactusLayout(800, 600);
    const a = /** @type {any} */ ({ id: 'a', children: [] });
    const b = /** @type {any} */ ({ id: 'b', weight: 5, children: [] });
    const original = [b, a];

    layout.weight(a);
    layout.weight(b);

    const sorted = layout.sortChildNodesByWeight(original);
    expect(original[0].id).toBe('b');
    expect(sorted[0].id).toBe('a');
  });
});

// ── orderMaxInCenter ────────────────────────────────────────────────────────

describe('orderMaxInCenter', () => {
  it('places max weight in center', () => {
    const layout = new CactusLayout(800, 600);
    const items = /** @type {any[]} */ ([
      { id: '1' },
      { id: '2' },
      { id: '3' },
      { id: '4' },
      { id: '5' },
    ]);

    const centered = layout.orderMaxInCenter(items);
    expect(centered.length).toBe(5);
    // Last item (heaviest when sorted ascending) should be near center
    expect(centered).toContain(items[4]);
  });

  it('handles single element', () => {
    const layout = new CactusLayout(800, 600);
    const centered = layout.orderMaxInCenter(
      /** @type {any[]} */ ([{ id: 'only' }]),
    );
    expect(centered.length).toBe(1);
    expect(centered[0].id).toBe('only');
  });

  it('handles empty list', () => {
    const layout = new CactusLayout(800, 600);
    expect(layout.orderMaxInCenter([])).toEqual([]);
  });
});

// ── buildHierarchyFromArray ─────────────────────────────────────────────────

describe('buildHierarchyFromArray', () => {
  it('builds tree from flat node array', () => {
    const layout = new CactusLayout(800, 600);
    /** @type {any} */
    const root = layout.buildHierarchyFromArray(sampleNodes);

    expect(root.id).toBe('root');
    expect(root.children.length).toBe(2);
    expect(root.parentRef).toBeNull();
  });

  it('sets parentRef on child nodes', () => {
    const layout = new CactusLayout(800, 600);
    const nodes = [
      { id: 'root', name: 'Root', parent: null },
      { id: 'child', name: 'Child', parent: 'root' },
    ];
    /** @type {any} */
    const root = layout.buildHierarchyFromArray(nodes);

    expect(root.children[0].parentRef).toBe(root);
  });

  it('returns empty node for empty array', () => {
    const layout = new CactusLayout(800, 600);
    const root = layout.buildHierarchyFromArray([]);
    expect(root.id).toBe('empty');
  });

  it('handles nodes with missing parents gracefully', () => {
    const layout = new CactusLayout(800, 600);
    const nodes = [
      { id: 'root', name: 'Root', parent: null },
      { id: 'orphan', name: 'Orphan', parent: 'nonexistent' },
    ];
    const root = layout.buildHierarchyFromArray(nodes);
    expect(root.id).toBe('root');
    expect(root.children.length).toBe(0);
  });
});

// ── hashData ────────────────────────────────────────────────────────────────

describe('hashData', () => {
  it('produces different hashes for different data', () => {
    const layout = new CactusLayout(800, 600);
    const hash1 = layout.hashData(sampleNodes);
    const hash2 = layout.hashData([{ id: 'x', name: 'X', parent: null }]);
    expect(hash1).not.toBe(hash2);
  });

  it('produces same hash for same data', () => {
    const layout = new CactusLayout(800, 600);
    const hash1 = layout.hashData(sampleNodes);
    const hash2 = layout.hashData(sampleNodes);
    expect(hash1).toBe(hash2);
  });

  it('handles single node input', () => {
    const layout = new CactusLayout(800, 600);
    const hash = layout.hashData(
      /** @type {any} */ ({ id: 'root', name: 'Root' }),
    );
    expect(hash).toContain('single');
  });
});

// ── render ──────────────────────────────────────────────────────────────────

describe('render', () => {
  it('returns positioned node data', () => {
    const layout = new CactusLayout(800, 600, 1, 0.5, Math.PI, 0.75);
    const result = layout.render(sampleNodes, 400, 300, Math.PI / 2);

    expect(result.length).toBe(sampleNodes.length);
    for (const nd of result) {
      expect(nd).toHaveProperty('x');
      expect(nd).toHaveProperty('y');
      expect(nd).toHaveProperty('radius');
      expect(nd).toHaveProperty('node');
      expect(nd).toHaveProperty('isLeaf');
      expect(nd).toHaveProperty('depth');
      expect(nd).toHaveProperty('angle');
      expect(typeof nd.x).toBe('number');
      expect(typeof nd.y).toBe('number');
      expect(nd.radius).toBeGreaterThan(0);
    }
  });

  it('returns nodes sorted by depth ascending', () => {
    const layout = new CactusLayout(800, 600, 1, 0.5, Math.PI, 0.75);
    const result = layout.render(sampleNodes, 400, 300);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].depth).toBeGreaterThanOrEqual(result[i - 1].depth);
    }
  });

  it('root node has depth 0', () => {
    const layout = new CactusLayout(800, 600, 1, 0.5, Math.PI, 0.75);
    const result = layout.render(sampleNodes, 400, 300);
    const root = result.find((n) => n.node.id === 'root');

    expect(root).toBeDefined();
    expect(/** @type {NonNullable<typeof root>} */ (root).depth).toBe(0);
    expect(/** @type {NonNullable<typeof root>} */ (root).isLeaf).toBe(false);
  });

  it('identifies leaf nodes correctly', () => {
    const layout = new CactusLayout(800, 600, 1, 0.5, Math.PI, 0.75);
    const result = layout.render(sampleNodes, 400, 300);

    const c = /** @type {NonNullable<ReturnType<typeof result.find>>} */ (
      result.find((n) => n.node.id === 'c')
    );
    const d = /** @type {NonNullable<ReturnType<typeof result.find>>} */ (
      result.find((n) => n.node.id === 'd')
    );
    const e = /** @type {NonNullable<ReturnType<typeof result.find>>} */ (
      result.find((n) => n.node.id === 'e')
    );

    expect(c.isLeaf).toBe(true);
    expect(d.isLeaf).toBe(true);
    expect(e.isLeaf).toBe(true);
  });

  it('root node has largest radius', () => {
    const layout = new CactusLayout(800, 600, 1, 0.5, Math.PI, 0.75);
    const result = layout.render(sampleNodes, 400, 300);
    const root = result.find((n) => n.node.id === 'root');
    const maxRadius = Math.max(...result.map((n) => n.radius));

    expect(/** @type {NonNullable<typeof root>} */ (root).radius).toBe(
      maxRadius,
    );
  });

  it('handles single-node input', () => {
    const layout = new CactusLayout(800, 600, 1, 0, Math.PI, 0.75);
    const result = layout.render(
      [{ id: 'only', name: 'Only', parent: null }],
      400,
      300,
    );

    expect(result.length).toBe(1);
    expect(result[0].depth).toBe(0);
    expect(result[0].isLeaf).toBe(true);
  });

  it('produces different positions for different zoom levels', () => {
    const layout1 = new CactusLayout(800, 600, 1, 0.5, Math.PI, 0.75);
    const result1 = layout1.render(sampleNodes, 400, 300);

    const layout2 = new CactusLayout(800, 600, 2, 0.5, Math.PI, 0.75);
    const result2 = layout2.render(sampleNodes, 400, 300);

    const root1 = /** @type {NonNullable<ReturnType<typeof result1.find>>} */ (
      result1.find((n) => n.node.id === 'root')
    );
    const root2 = /** @type {NonNullable<ReturnType<typeof result2.find>>} */ (
      result2.find((n) => n.node.id === 'root')
    );

    // Zoomed version should have larger radii
    expect(root2.radius).toBeGreaterThan(root1.radius);
  });

  it('caches hierarchy for repeated renders', () => {
    const layout = new CactusLayout(800, 600, 1, 0.5, Math.PI, 0.75);
    layout.render(sampleNodes, 400, 300);
    const hash = layout.lastDataHash;

    layout.render(sampleNodes, 400, 300);
    expect(layout.lastDataHash).toBe(hash);
    expect(layout.hierarchyCache.has(hash)).toBe(true);
  });
});

// ── calculateBoundingBox ────────────────────────────────────────────────────

describe('calculateBoundingBox', () => {
  it('returns zero box for empty nodes', () => {
    const layout = new CactusLayout(800, 600);
    layout.nodes = [];
    const box = layout.calculateBoundingBox();

    expect(box.width).toBe(0);
    expect(box.height).toBe(0);
  });

  it('calculates correct bounding box', () => {
    const layout = new CactusLayout(800, 600);
    layout.nodes = /** @type {any[]} */ ([
      { x: 100, y: 100, radius: 20 },
      { x: 200, y: 200, radius: 30 },
    ]);
    const box = layout.calculateBoundingBox();

    expect(box.minX).toBe(80);
    expect(box.maxX).toBe(230);
    expect(box.minY).toBe(80);
    expect(box.maxY).toBe(230);
    expect(box.width).toBe(150);
    expect(box.height).toBe(150);
  });
});

// ── calculateMaxDepth ───────────────────────────────────────────────────────

describe('calculateMaxDepth', () => {
  it('returns 0 for leaf node', () => {
    const layout = new CactusLayout(800, 600);
    expect(
      layout.calculateMaxDepth(/** @type {any} */ ({ children: [] })),
    ).toBe(0);
  });

  it('returns correct depth for tree', () => {
    const layout = new CactusLayout(800, 600);
    const tree = /** @type {any} */ ({
      children: [{ children: [{ children: [] }] }, { children: [] }],
    });
    expect(layout.calculateMaxDepth(tree)).toBe(2);
  });
});
