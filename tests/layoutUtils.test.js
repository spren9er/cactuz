import { describe, it, expect } from 'vitest';
import {
  calculateLayout,
  computeZoomLimitsFromNodes,
  buildLookupMaps,
} from '$lib/layoutUtils.js';

const sampleNodes = [
  { id: 'root', name: 'Root', parent: null },
  { id: 'a', name: 'A', parent: 'root' },
  { id: 'b', name: 'B', parent: 'root' },
  { id: 'c', name: 'C', parent: 'a' },
  { id: 'd', name: 'D', parent: 'a' },
  { id: 'e', name: 'E', parent: 'b' },
];

const defaultOptions = {
  overlap: 0.5,
  arcSpan: (5 * Math.PI) / 4,
  sizeGrowthRate: 0.75,
  orientation: Math.PI / 2,
  zoom: 1.0,
};

// ── calculateLayout ─────────────────────────────────────────────────────────

describe('calculateLayout', () => {
  it('returns empty array for empty nodes', () => {
    expect(calculateLayout(800, 600, 1, [], defaultOptions)).toEqual([]);
  });

  it('returns empty array for null nodes', () => {
    expect(calculateLayout(800, 600, 1, null, defaultOptions)).toEqual([]);
  });

  it('returns rendered nodes for valid input', () => {
    const result = calculateLayout(800, 600, 1, sampleNodes, defaultOptions);

    expect(result.length).toBe(sampleNodes.length);
    for (const nd of result) {
      expect(nd).toHaveProperty('id');
      expect(nd).toHaveProperty('x');
      expect(nd).toHaveProperty('y');
      expect(nd).toHaveProperty('depth');
      expect(nd).toHaveProperty('radius');
      expect(nd).toHaveProperty('node');
      expect(typeof nd.x).toBe('number');
      expect(typeof nd.y).toBe('number');
    }
  });

  it('includes all original node IDs', () => {
    const result = calculateLayout(800, 600, 1, sampleNodes, defaultOptions);
    const ids = result.map((nd) => nd.id);

    for (const node of sampleNodes) {
      expect(ids).toContain(node.id);
    }
  });

  it('root node has depth 0', () => {
    const result = calculateLayout(800, 600, 1, sampleNodes, defaultOptions);
    const root = result.find((nd) => nd.id === 'root');

    expect(root).toBeDefined();
    expect(root.depth).toBe(0);
  });
});

// ── computeZoomLimitsFromNodes ──────────────────────────────────────────────

describe('computeZoomLimitsFromNodes', () => {
  it('returns default limits for empty nodes', () => {
    const limits = computeZoomLimitsFromNodes(800, 600, [], 1);
    expect(limits.minZoomLimit).toBe(0.1);
    expect(limits.maxZoomLimit).toBe(10);
  });

  it('computes limits from rendered nodes', () => {
    const nodes = [{ radius: 5 }, { radius: 50 }, { radius: 100 }];

    const limits = computeZoomLimitsFromNodes(800, 600, nodes, 1);

    expect(limits.minZoomLimit).toBeGreaterThan(0);
    expect(limits.maxZoomLimit).toBeGreaterThan(limits.minZoomLimit);
    expect(typeof limits.minZoomLimit).toBe('number');
    expect(typeof limits.maxZoomLimit).toBe('number');
  });

  it('handles nodes with zero radius', () => {
    const nodes = [{ radius: 0 }, { radius: 50 }];
    const limits = computeZoomLimitsFromNodes(800, 600, nodes, 1);

    expect(limits.minZoomLimit).toBeGreaterThan(0);
    expect(limits.maxZoomLimit).toBeGreaterThan(0);
  });

  it('accounts for interactive zoom factor', () => {
    const nodes = [{ radius: 10 }, { radius: 100 }];

    const limits1 = computeZoomLimitsFromNodes(800, 600, nodes, 1);
    const limits2 = computeZoomLimitsFromNodes(800, 600, nodes, 2);

    // Different zoom factors should produce different limits
    expect(limits1.maxZoomLimit).not.toBe(limits2.maxZoomLimit);
  });
});

// ── buildLookupMaps ─────────────────────────────────────────────────────────

describe('buildLookupMaps', () => {
  function createRenderedNodes() {
    return calculateLayout(800, 600, 1, sampleNodes, defaultOptions);
  }

  it('builds nodeIdToRenderedNodeMap', () => {
    const rendered = createRenderedNodes();
    const maps = buildLookupMaps(rendered, { depths: [] });

    expect(maps.nodeIdToRenderedNodeMap).toBeInstanceOf(Map);
    expect(maps.nodeIdToRenderedNodeMap.size).toBe(sampleNodes.length);

    for (const node of sampleNodes) {
      expect(maps.nodeIdToRenderedNodeMap.has(node.id)).toBe(true);
    }
  });

  it('identifies leaf nodes correctly', () => {
    const rendered = createRenderedNodes();
    const maps = buildLookupMaps(rendered, { depths: [] });

    expect(maps.leafNodes).toBeInstanceOf(Set);
    expect(maps.leafNodes.has('c')).toBe(true);
    expect(maps.leafNodes.has('d')).toBe(true);
    expect(maps.leafNodes.has('e')).toBe(true);
    expect(maps.leafNodes.has('root')).toBe(false);
    expect(maps.leafNodes.has('a')).toBe(false);
    expect(maps.leafNodes.has('b')).toBe(false);
  });

  it('computes negative depth nodes', () => {
    const rendered = createRenderedNodes();
    const maps = buildLookupMaps(rendered, { depths: [] });

    expect(maps.negativeDepthNodes).toBeInstanceOf(Map);

    // -1 should be leaves
    const leaves = maps.negativeDepthNodes.get(-1);
    expect(leaves).toBeDefined();
    expect(leaves.has('c')).toBe(true);
    expect(leaves.has('d')).toBe(true);
    expect(leaves.has('e')).toBe(true);

    // -2 should be parents of leaves
    const parentsOfLeaves = maps.negativeDepthNodes.get(-2);
    expect(parentsOfLeaves).toBeDefined();
    expect(parentsOfLeaves.has('a')).toBe(true);
    expect(parentsOfLeaves.has('b')).toBe(true);

    // -3 should be root
    const grandparents = maps.negativeDepthNodes.get(-3);
    expect(grandparents).toBeDefined();
    expect(grandparents.has('root')).toBe(true);
  });

  it('builds depthStyleCache for positive depths', () => {
    const rendered = createRenderedNodes();
    const depths = [
      { depth: 0, node: { fillColor: '#000' } },
      { depth: 1, node: { fillColor: '#111' } },
      { depth: -1, node: { fillColor: '#fff' } },
    ];

    const maps = buildLookupMaps(rendered, { depths });

    expect(maps.depthStyleCache.has(0)).toBe(true);
    expect(maps.depthStyleCache.has(1)).toBe(true);
    // Negative depths should NOT be in depthStyleCache
    expect(maps.depthStyleCache.has(-1)).toBe(false);
  });

  it('builds parentToChildrenNodeMap', () => {
    const rendered = createRenderedNodes();
    const maps = buildLookupMaps(rendered, { depths: [] });

    expect(maps.parentToChildrenNodeMap).toBeInstanceOf(Map);

    const rootChildren = maps.parentToChildrenNodeMap.get('root');
    expect(rootChildren).toBeDefined();
    expect(rootChildren.length).toBe(2);

    const aChildren = maps.parentToChildrenNodeMap.get('a');
    expect(aChildren).toBeDefined();
    expect(aChildren.length).toBe(2);
  });

  it('sets up parentRef on nodes', () => {
    const rendered = createRenderedNodes();
    buildLookupMaps(rendered, { depths: [] });

    const childA = rendered.find((n) => n.node.id === 'a');
    expect(childA.node.parentRef).toBeDefined();
    expect(childA.node.parentRef.id).toBe('root');
  });

  it('provides empty hierarchicalPathCache', () => {
    const rendered = createRenderedNodes();
    const maps = buildLookupMaps(rendered, { depths: [] });

    expect(maps.hierarchicalPathCache).toBeInstanceOf(Map);
    expect(maps.hierarchicalPathCache.size).toBe(0);
  });
});
