import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Label,
  Anchor,
  Link,
  CircleAwareLabeler,
  LabelPositioner,
  calculateLabelPositions,
} from '$lib/labelPositions.js';

// ── Canvas mock for LabelPositioner ─────────────────────────────────────────

/** @type {any} */
let originalGetContext;

function mockCanvasGetContext() {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(function () {
    return {
      font: '',
      measureText: vi.fn((text) => ({
        width: text.length * 6,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      })),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      textAlign: 'start',
      textBaseline: 'alphabetic',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
    };
  });
}

function restoreCanvasGetContext() {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
}

// ── Label ───────────────────────────────────────────────────────────────────

describe('Label', () => {
  it('creates a label with correct properties', () => {
    const label = new Label('key1', 'Hello', 10, 20, 50, 15);
    expect(label.key).toBe('key1');
    expect(label.name).toBe('Hello');
    expect(label.x).toBe(10);
    expect(label.y).toBe(20);
    expect(label.width).toBe(50);
    expect(label.height).toBe(15);
  });

  it('detects overlapping labels', () => {
    const a = new Label('a', 'A', 0, 0, 50, 20);
    const b = new Label('b', 'B', 25, 10, 50, 20);

    expect(a.overlaps(b)).toBe(true);
    expect(b.overlaps(a)).toBe(true);
  });

  it('detects non-overlapping labels', () => {
    const a = new Label('a', 'A', 0, 0, 50, 20);
    const b = new Label('b', 'B', 100, 100, 50, 20);

    expect(a.overlaps(b)).toBe(false);
    expect(b.overlaps(a)).toBe(false);
  });

  it('treats edge-touching labels as overlapping', () => {
    const a = new Label('a', 'A', 0, 0, 50, 20);
    const b = new Label('b', 'B', 50, 0, 50, 20);

    // The overlap check uses `<` (not `<=`) in the non-overlap condition,
    // so exactly-touching edges ARE considered overlapping
    expect(a.overlaps(b)).toBe(true);
  });

  it('detects clearly separated labels as non-overlapping', () => {
    const a = new Label('a', 'A', 0, 0, 50, 20);
    const b = new Label('b', 'B', 51, 0, 50, 20);

    expect(a.overlaps(b)).toBe(false);
  });

  it('returns correct center', () => {
    const label = new Label('a', 'A', 10, 20, 60, 30);
    const center = label.getCenter();
    expect(center.x).toBe(40);
    expect(center.y).toBe(35);
  });
});

// ── Anchor ──────────────────────────────────────────────────────────────────

describe('Anchor', () => {
  it('creates an anchor with correct properties', () => {
    const anchor = new Anchor(100, 200, 30);
    expect(anchor.x).toBe(100);
    expect(anchor.y).toBe(200);
    expect(anchor.radius).toBe(30);
  });

  it('calculates distance to a point', () => {
    const anchor = new Anchor(0, 0, 10);
    expect(anchor.distanceTo(3, 4)).toBe(5);
  });

  it('returns 0 for same position', () => {
    const anchor = new Anchor(50, 50, 10);
    expect(anchor.distanceTo(50, 50)).toBe(0);
  });
});

// ── Link ────────────────────────────────────────────────────────────────────

describe('Link', () => {
  it('creates a link with computed length', () => {
    const link = new Link(0, 0, 3, 4);
    expect(link.x1).toBe(0);
    expect(link.y1).toBe(0);
    expect(link.x2).toBe(3);
    expect(link.y2).toBe(4);
    expect(link.length).toBe(5);
  });

  it('handles zero-length link', () => {
    const link = new Link(10, 10, 10, 10);
    expect(link.length).toBe(0);
  });
});

// ── CircleAwareLabeler ──────────────────────────────────────────────────────

describe('CircleAwareLabeler', () => {
  it('creates a labeler with correct defaults', () => {
    const labels = [new Label('a', 'A', 0, 0, 50, 20)];
    const anchors = [new Anchor(100, 100, 30)];
    const allNodes = [{ x: 100, y: 100, radius: 30 }];

    const labeler = new CircleAwareLabeler(labels, anchors, allNodes, 800, 600);

    expect(labeler.labels.length).toBe(1);
    expect(labeler.anchors.length).toBe(1);
    expect(labeler.width).toBe(800);
    expect(labeler.height).toBe(600);
  });

  it('does not mutate original labels array reference', () => {
    const labels = [new Label('a', 'A', 10, 10, 50, 20)];

    const labeler = new CircleAwareLabeler(
      labels,
      [new Anchor(100, 100, 30)],
      [{ x: 100, y: 100, radius: 30 }],
      800,
      600,
    );

    // Adding to internal array should not affect original
    labeler.labels.push(new Label('b', 'B', 0, 0, 20, 10));
    expect(labels.length).toBe(1);
  });

  it('runs simulated annealing without errors', () => {
    const labels = [
      new Label('a', 'A', 0, 0, 50, 20),
      new Label('b', 'B', 10, 10, 50, 20),
    ];
    const anchors = [new Anchor(100, 100, 30), new Anchor(200, 200, 30)];
    const allNodes = [
      { x: 100, y: 100, radius: 30 },
      { x: 200, y: 200, radius: 30 },
    ];

    const labeler = new CircleAwareLabeler(labels, anchors, allNodes, 800, 600);

    expect(() => labeler.call(10)).not.toThrow();
    expect(labeler.accept + labeler.reject).toBeGreaterThan(0);
  });

  it('computes energy for a label', () => {
    const labels = [new Label('a', 'A', 0, 0, 50, 20)];
    const anchors = [new Anchor(100, 100, 30)];
    const allNodes = [{ x: 100, y: 100, radius: 30 }];

    const labeler = new CircleAwareLabeler(labels, anchors, allNodes, 800, 600);

    const energy = labeler.energy(0);
    expect(typeof energy).toBe('number');
    expect(energy).toBeGreaterThanOrEqual(0);
  });

  it('detects line segment intersection', () => {
    const labeler = new CircleAwareLabeler([], [], [], 800, 600);

    // Crossing X pattern
    expect(labeler.intersect(0, 10, 0, 10, 0, 10, 10, 0)).toBe(true);

    // Parallel lines
    expect(labeler.intersect(0, 10, 0, 10, 0, 10, 5, 15)).toBe(false);
  });

  it('detects label overlapping circle', () => {
    const labeler = new CircleAwareLabeler([], [], [], 800, 600);

    // Label overlapping with circle
    expect(labeler.labelOverlapsCircle(90, 90, 50, 20, 100, 100, 30)).toBe(
      true,
    );

    // Label far from circle
    expect(labeler.labelOverlapsCircle(500, 500, 50, 20, 100, 100, 30)).toBe(
      false,
    );
  });

  it('respects fixed labels during energy calculation', () => {
    const labels = [new Label('a', 'A', 10, 10, 50, 20)];
    const anchors = [new Anchor(100, 100, 30)];
    const allNodes = [{ x: 100, y: 100, radius: 30 }];
    const fixedLabels = [new Label('fixed', 'Fixed', 10, 10, 50, 20)];

    const labeler = new CircleAwareLabeler(
      labels,
      anchors,
      allNodes,
      800,
      600,
      { fixedLabels },
    );

    // Energy should be higher due to overlap with fixed label
    const energy = labeler.energy(0);
    expect(energy).toBeGreaterThan(0);
  });

  it('cooling schedule reduces temperature', () => {
    const labeler = new CircleAwareLabeler([], [], [], 800, 600);
    const newTemp = labeler.coolingSchedule(1.0, 1.0, 10);
    expect(newTemp).toBe(0.9);
  });
});

// ── LabelPositioner ─────────────────────────────────────────────────────────

describe('LabelPositioner', () => {
  beforeEach(() => {
    mockCanvasGetContext();
  });

  afterEach(() => {
    restoreCanvasGetContext();
  });

  const sampleRenderedNodes = [
    { x: 400, y: 300, radius: 80, node: { id: 'root', name: 'Root' } },
    { x: 300, y: 200, radius: 40, node: { id: 'a', name: 'Child A' } },
    { x: 500, y: 200, radius: 20, node: { id: 'b', name: 'Small' } },
  ];

  it('creates a positioner', () => {
    const positioner = new LabelPositioner(
      sampleRenderedNodes,
      800,
      600,
      'monospace',
      10,
    );

    expect(positioner.renderedNodes).toBe(sampleRenderedNodes);
    expect(positioner.width).toBe(800);
    expect(positioner.height).toBe(600);

    positioner.dispose();
  });

  it('can fit label inside large circle', () => {
    const positioner = new LabelPositioner([], 800, 600);
    // Small label, large circle
    expect(positioner.canFitInsideCircle(20, 12, 100)).toBe(true);

    positioner.dispose();
  });

  it('cannot fit label inside small circle', () => {
    const positioner = new LabelPositioner([], 800, 600);
    // Large label, small circle
    expect(positioner.canFitInsideCircle(200, 20, 5)).toBe(false);

    positioner.dispose();
  });

  it('calculates label positions', () => {
    const positioner = new LabelPositioner(
      sampleRenderedNodes,
      800,
      600,
      'monospace',
      10,
    );

    const result = positioner.calculate();

    expect(result.labels).toBeDefined();
    expect(result.links).toBeDefined();
    expect(Array.isArray(result.labels)).toBe(true);
    expect(Array.isArray(result.links)).toBe(true);
    expect(result.labels.length).toBeGreaterThan(0);

    for (const label of result.labels) {
      expect(label).toHaveProperty('nodeId');
      expect(label).toHaveProperty('text');
      expect(label).toHaveProperty('x');
      expect(label).toHaveProperty('y');
      expect(label).toHaveProperty('width');
      expect(label).toHaveProperty('height');
      expect(label).toHaveProperty('isInside');
    }

    positioner.dispose();
  });

  it('produces inside labels for nodes with large radius', () => {
    const bigNodes = [
      { x: 400, y: 300, radius: 200, node: { id: 'big', name: 'Big' } },
    ];

    const positioner = new LabelPositioner(bigNodes, 800, 600, 'monospace', 10);
    const result = positioner.calculate();

    const insideLabels = result.labels.filter((l) => l.isInside);
    expect(insideLabels.length).toBe(1);

    positioner.dispose();
  });

  it('produces outside labels for nodes with small radius', () => {
    const smallNodes = [
      { x: 400, y: 300, radius: 3, node: { id: 'small', name: 'Tiny' } },
    ];

    const positioner = new LabelPositioner(
      smallNodes,
      800,
      600,
      'monospace',
      10,
    );
    const result = positioner.calculate();

    const outsideLabels = result.labels.filter((l) => !l.isInside);
    expect(outsideLabels.length).toBe(1);

    positioner.dispose();
  });

  it('generates links for outside labels', () => {
    const smallNodes = [
      { x: 400, y: 300, radius: 3, node: { id: 'small', name: 'Label' } },
    ];

    const positioner = new LabelPositioner(
      smallNodes,
      800,
      600,
      'monospace',
      10,
    );
    const result = positioner.calculate();

    expect(result.links.length).toBeGreaterThan(0);
    for (const link of result.links) {
      expect(link).toHaveProperty('x1');
      expect(link).toHaveProperty('y1');
      expect(link).toHaveProperty('x2');
      expect(link).toHaveProperty('y2');
      expect(link).toHaveProperty('nodeId');
    }

    positioner.dispose();
  });

  it('respects preserved positions', () => {
    const nodes = [
      { x: 400, y: 300, radius: 3, node: { id: 'n', name: 'Node' } },
    ];

    const preservedPositions = new Map();
    preservedPositions.set('n', { x: 500, y: 400, width: 50, height: 15 });

    const positioner = new LabelPositioner(nodes, 800, 600, 'monospace', 10, {
      preservedPositions,
    });
    const result = positioner.calculate();

    // Label should use preserved position
    const label = result.labels.find((l) => l.nodeId === 'n');
    expect(label).toBeDefined();

    positioner.dispose();
  });

  it('cleans up canvas on dispose', () => {
    const positioner = new LabelPositioner([], 800, 600);
    expect(positioner.canvas).not.toBeNull();

    positioner.dispose();
    expect(positioner.canvas).toBeNull();
    expect(positioner.ctx).toBeNull();
  });

  it('measures text width', () => {
    const positioner = new LabelPositioner([], 800, 600, 'monospace', 10);
    const width = positioner.measureTextWidth('Hello', 2);

    expect(typeof width).toBe('number');
    expect(width).toBeGreaterThan(0);

    positioner.dispose();
  });

  it('determines if label should be shown', () => {
    const positioner = new LabelPositioner([], 800, 600);

    expect(
      positioner.shouldShowLabel({ node: { name: 'Test', id: 'a' } }),
    ).toBe(true);
    expect(
      positioner.shouldShowLabel({ node: { name: '', id: '' } }),
    ).toBeFalsy();

    positioner.dispose();
  });
});

// ── calculateLabelPositions ─────────────────────────────────────────────────

describe('calculateLabelPositions', () => {
  beforeEach(() => {
    mockCanvasGetContext();
  });

  afterEach(() => {
    restoreCanvasGetContext();
  });

  it('returns labels and links', () => {
    const nodes = [
      { x: 400, y: 300, radius: 80, node: { id: 'root', name: 'Root' } },
      { x: 300, y: 200, radius: 5, node: { id: 'leaf', name: 'Leaf' } },
    ];

    const result = calculateLabelPositions(nodes, 800, 600, {
      fontFamily: 'monospace',
      fontSize: 10,
    });

    expect(result).toHaveProperty('labels');
    expect(result).toHaveProperty('links');
    expect(Array.isArray(result.labels)).toBe(true);
    expect(Array.isArray(result.links)).toBe(true);
  });

  it('returns empty arrays for empty nodes', () => {
    const result = calculateLabelPositions([], 800, 600, {});
    expect(result.labels).toEqual([]);
    expect(result.links).toEqual([]);
  });
});
