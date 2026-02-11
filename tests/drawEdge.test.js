import { describe, it, expect, vi } from 'vitest';
import {
  buildHierarchicalPath,
  pathToCoordinates,
  shouldFilterEdge,
  drawEdge,
  computeVisibleEdgeNodeIds,
} from '$lib/drawEdge.js';

// ── buildHierarchicalPath ───────────────────────────────────────────────────

describe('buildHierarchicalPath', () => {
  it('builds a path between two leaf nodes with common ancestor', () => {
    const root = { id: 'root', parentRef: null };
    const child1 = { id: 'child1', parentRef: root };
    const child2 = { id: 'child2', parentRef: root };

    const sourceNode = { node: child1 };
    const targetNode = { node: child2 };
    const cache = new Map();

    const { hierarchicalPath } = buildHierarchicalPath(
      sourceNode,
      targetNode,
      cache,
    );

    expect(hierarchicalPath).toBeDefined();
    expect(hierarchicalPath.length).toBeGreaterThanOrEqual(2);
    expect(hierarchicalPath[0]).toBe(child1);
    expect(hierarchicalPath[hierarchicalPath.length - 1]).toBe(child2);
  });

  it('caches the result', () => {
    const root = { id: 'root', parentRef: null };
    const a = { id: 'a', parentRef: root };
    const b = { id: 'b', parentRef: root };

    const cache = new Map();
    buildHierarchicalPath({ node: a }, { node: b }, cache);

    expect(cache.has('a-b')).toBe(true);
  });

  it('builds path for directly connected nodes', () => {
    const parent = { id: 'parent', parentRef: null };
    const child = { id: 'child', parentRef: parent };

    const cache = new Map();
    const { hierarchicalPath } = buildHierarchicalPath(
      { node: child },
      { node: parent },
      cache,
    );

    expect(hierarchicalPath[0]).toBe(child);
  });
});

// ── pathToCoordinates ───────────────────────────────────────────────────────

describe('pathToCoordinates', () => {
  it('returns source and target for empty path', () => {
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 100 };
    const coords = pathToCoordinates([], new Map(), source, target);
    expect(coords).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it('resolves path nodes via node map', () => {
    const nodeMap = new Map();
    nodeMap.set('a', { x: 10, y: 20 });
    nodeMap.set('b', { x: 50, y: 60 });
    nodeMap.set('c', { x: 90, y: 100 });

    const path = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const source = { x: 10, y: 20 };
    const target = { x: 90, y: 100 };

    const coords = pathToCoordinates(path, nodeMap, source, target);
    expect(coords.length).toBe(3);
    expect(coords[0]).toEqual({ x: 10, y: 20 });
    expect(coords[1]).toEqual({ x: 50, y: 60 });
    expect(coords[2]).toEqual({ x: 90, y: 100 });
  });

  it('falls back to parentRef when node not in map', () => {
    const nodeMap = new Map();
    nodeMap.set('parent', { x: 50, y: 50 });

    const path = [{ id: 'missing', parentRef: { id: 'parent' } }];
    const source = { x: 0, y: 0 };
    const target = { x: 100, y: 100 };

    const coords = pathToCoordinates(path, nodeMap, source, target);
    expect(coords.length).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates consecutive duplicate points', () => {
    const nodeMap = new Map();
    nodeMap.set('a', { x: 10, y: 20 });
    nodeMap.set('b', { x: 10, y: 20 });
    nodeMap.set('c', { x: 90, y: 100 });

    const path = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const source = { x: 10, y: 20 };
    const target = { x: 90, y: 100 };

    const coords = pathToCoordinates(path, nodeMap, source, target);
    // Should deduplicate consecutive (10,20) points
    for (let i = 1; i < coords.length; i++) {
      const same =
        coords[i].x === coords[i - 1].x && coords[i].y === coords[i - 1].y;
      expect(same).toBe(false);
    }
  });
});

// ── shouldFilterEdge ────────────────────────────────────────────────────────

describe('shouldFilterEdge', () => {
  it('returns false when no node is hovered', () => {
    expect(shouldFilterEdge({ source: 'a', target: 'b' }, null)).toBe(false);
  });

  it('returns false when edge is connected to hovered node', () => {
    expect(shouldFilterEdge({ source: 'a', target: 'b' }, 'a')).toBe(false);
    expect(shouldFilterEdge({ source: 'a', target: 'b' }, 'b')).toBe(false);
  });

  it('returns true when edge is not connected to hovered leaf', () => {
    const nodeMap = new Map();
    nodeMap.set('hoveredLeaf', { node: { children: [] } });

    expect(
      shouldFilterEdge({ source: 'a', target: 'b' }, 'hoveredLeaf', nodeMap),
    ).toBe(true);
  });

  it('returns false when hovered node has children (non-leaf)', () => {
    const nodeMap = new Map();
    nodeMap.set('parent', {
      node: { children: [{ id: 'child' }] },
    });

    expect(
      shouldFilterEdge({ source: 'a', target: 'b' }, 'parent', nodeMap),
    ).toBe(false);
  });
});

// ── computeVisibleEdgeNodeIds ───────────────────────────────────────────────

describe('computeVisibleEdgeNodeIds', () => {
  it('returns empty array for no edges', () => {
    expect(computeVisibleEdgeNodeIds([], new Map(), null)).toEqual([]);
  });

  it('returns all node ids from visible edges', () => {
    const nodeMap = new Map();
    nodeMap.set('a', { x: 0, y: 0 });
    nodeMap.set('b', { x: 1, y: 1 });
    nodeMap.set('c', { x: 2, y: 2 });

    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ];

    const result = computeVisibleEdgeNodeIds(edges, nodeMap, null);
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
  });

  it('filters edges when hovering a leaf node', () => {
    const nodeMap = new Map();
    nodeMap.set('leaf1', { node: { children: [] } });
    nodeMap.set('leaf2', { node: { children: [] } });
    nodeMap.set('leaf3', { node: { children: [] } });

    const edges = [
      { source: 'leaf1', target: 'leaf2' },
      { source: 'leaf2', target: 'leaf3' },
    ];

    const result = computeVisibleEdgeNodeIds(edges, nodeMap, 'leaf1');
    expect(result).toContain('leaf1');
    expect(result).toContain('leaf2');
    // leaf3 should be filtered because its edge (leaf2->leaf3) is not connected to leaf1
    expect(result).not.toContain('leaf3');
  });
});

// ── drawEdge ────────────────────────────────────────────────────────────────

describe('drawEdge', () => {
  function createMockCtx() {
    return {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    };
  }

  const mergedStyle = {
    edge: {
      strokeColor: '#333333',
      strokeOpacity: 0.1,
      strokeWidth: 1,
    },
    highlight: {
      edge: {
        strokeColor: '#ea575a',
        strokeOpacity: 0.2,
        strokeWidth: 1,
      },
    },
    depths: [],
  };

  it('returns false for null ctx', () => {
    expect(
      drawEdge(
        null,
        { source: 'a', target: 'b' },
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        new Map(),
        new Map(),
        null,
        mergedStyle,
        null,
      ),
    ).toBe(false);
  });

  it('draws a straight line when bundlingStrength is 0', () => {
    const ctx = createMockCtx();
    const source = { x: 0, y: 0, node: { id: 'a', parentRef: null } };
    const target = { x: 100, y: 100, node: { id: 'b', parentRef: null } };

    const result = drawEdge(
      ctx,
      { source: 'a', target: 'b' },
      source,
      target,
      new Map(),
      new Map(),
      null,
      mergedStyle,
      null,
      null,
      0,
    );

    expect(result).toBe(true);
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('returns false when edge width is 0', () => {
    const ctx = createMockCtx();
    const style = {
      ...mergedStyle,
      edge: { ...mergedStyle.edge, strokeWidth: 0 },
    };

    const result = drawEdge(
      ctx,
      { source: 'a', target: 'b' },
      { x: 0, y: 0, node: { id: 'a', parentRef: null } },
      { x: 10, y: 10, node: { id: 'b', parentRef: null } },
      new Map(),
      new Map(),
      null,
      style,
      null,
    );
    expect(result).toBe(false);
  });

  it('applies mute opacity when muted', () => {
    const ctx = createMockCtx();
    const source = { x: 0, y: 0, node: { id: 'a', parentRef: null } };
    const target = { x: 100, y: 100, node: { id: 'b', parentRef: null } };

    drawEdge(
      ctx,
      { source: 'a', target: 'b' },
      source,
      target,
      new Map(),
      new Map(),
      null,
      mergedStyle,
      null,
      null,
      0.97,
      true,
      0.1,
    );

    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('uses highlight styles for hovered edges', () => {
    const ctx = createMockCtx();
    const source = {
      x: 0,
      y: 0,
      depth: 0,
      id: 'a',
      node: { id: 'a', parentRef: null },
    };
    const target = {
      x: 100,
      y: 100,
      depth: 1,
      id: 'b',
      node: { id: 'b', parentRef: null },
    };

    drawEdge(
      ctx,
      { source: 'a', target: 'b' },
      source,
      target,
      new Map(),
      new Map(),
      new Map(),
      mergedStyle,
      'a',
      new Set(['a']),
      0,
    );

    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('applies highlight opacity for highlighted (non-hovered) edges', () => {
    const ctx = createMockCtx();
    const source = {
      x: 0,
      y: 0,
      depth: 0,
      id: 'a',
      node: { id: 'a', parentRef: null },
    };
    const target = {
      x: 100,
      y: 100,
      depth: 1,
      id: 'b',
      node: { id: 'b', parentRef: null },
    };

    // Hover over 'c', but 'a' is in the highlighted set
    drawEdge(
      ctx,
      { source: 'a', target: 'b' },
      source,
      target,
      new Map(),
      new Map(),
      new Map(),
      mergedStyle,
      'c',
      new Set(['a']),
      0,
    );

    expect(ctx.stroke).toHaveBeenCalled();
  });
});
