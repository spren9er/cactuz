import { describe, it, expect, vi } from 'vitest';
import {
  getLabelStyle,
  shouldShowLeafLabel,
  calculateFontSize,
  truncateText,
  shouldShowLabel,
  drawCenteredLabel,
} from '$lib/drawLabel.js';

// ── getLabelStyle ───────────────────────────────────────────────────────────

describe('getLabelStyle', () => {
  const mergedStyle = {
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
    highlight: {
      label: {
        inner: { textColor: '#ea575a', fontWeight: 'bold' },
        outer: { textColor: '#333333', fontWeight: 'normal' },
      },
    },
    depths: [],
  };

  it('returns global style when no depth style exists', () => {
    const style = getLabelStyle(0, 'node1', mergedStyle, new Map(), new Map());
    expect(style.inner?.textColor).toBe('#333333');
    expect(style.inner?.fontFamily).toBe('monospace');
    expect(style.outer?.textColor).toBe('#333333');
    expect(style.outer?.fontFamily).toBe('monospace');
    expect(style.inner?.minFontSize).toBe(9);
    expect(style.inner?.maxFontSize).toBe(14);
    expect(style.outer?.link?.strokeColor).toBe('#cccccc');
    expect(style.outer?.link?.strokeWidth).toBe(0.5);
  });

  it('uses depth style inner textColor over global', () => {
    const depthStyleCache = new Map();
    depthStyleCache.set(1, {
      depth: 1,
      label: { inner: { textColor: '#ff0000' } },
    });

    const style = getLabelStyle(
      1,
      'node1',
      { ...mergedStyle, depths: [depthStyleCache.get(1)] },
      depthStyleCache,
      new Map(),
    );
    expect(style.inner?.textColor).toBe('#ff0000');
  });

  it('uses depth style for minFontSize/maxFontSize', () => {
    const depthStyleCache = new Map();
    depthStyleCache.set(1, {
      depth: 1,
      label: { inner: { minFontSize: 6, maxFontSize: 20 } },
    });

    const style = getLabelStyle(
      1,
      'node1',
      { ...mergedStyle, depths: [depthStyleCache.get(1)] },
      depthStyleCache,
      new Map(),
    );
    expect(style.inner?.minFontSize).toBe(6);
    expect(style.inner?.maxFontSize).toBe(20);
  });

  it('uses depth link style over global link style', () => {
    const depthStyleCache = new Map();
    depthStyleCache.set(1, {
      depth: 1,
      label: {
        outer: {
          link: { strokeColor: '#ff0000', strokeWidth: 2 },
        },
      },
    });

    const style = getLabelStyle(
      1,
      'node1',
      { ...mergedStyle, depths: [depthStyleCache.get(1)] },
      depthStyleCache,
      new Map(),
    );
    expect(style.outer?.link?.strokeColor).toBe('#ff0000');
    expect(style.outer?.link?.strokeWidth).toBe(2);
  });

  it('resolves highlight styles from depth', () => {
    const depthStyleCache = new Map();
    depthStyleCache.set(1, {
      depth: 1,
      highlight: {
        label: {
          inner: { textColor: '#00ff00', fontWeight: 'bold' },
        },
      },
    });

    const style = getLabelStyle(
      1,
      'node1',
      { ...mergedStyle, depths: [depthStyleCache.get(1)] },
      depthStyleCache,
      new Map(),
    );
    expect(style.highlight).toBeDefined();
    expect(style.highlight?.inner?.textColor).toBe('#00ff00');
  });

  it('returns outer style properties', () => {
    const style = getLabelStyle(0, 'node1', mergedStyle, new Map(), new Map());
    expect(style.outer).toBeDefined();
    expect(style.outer?.textColor).toBe('#333333');
    expect(style.outer?.fontSize).toBe(9);
    expect(style.outer?.link?.strokeColor).toBe('#cccccc');
  });

  it('resolves highlight styles from negative depth', () => {
    const negativeDepthNodes = new Map();
    negativeDepthNodes.set(-1, new Set(['leaf1']));

    const classicMergedStyle = {
      ...mergedStyle,
      depths: [
        {
          depth: -1,
          label: { inner: { textColor: '#efefef' } },
          highlight: {
            label: {
              inner: { textColor: '#ea575a' },
              outer: { textColor: '#ea575a' },
            },
          },
        },
      ],
    };

    const style = getLabelStyle(
      3,
      'leaf1',
      classicMergedStyle,
      new Map(),
      negativeDepthNodes,
    );
    expect(style.highlight).toBeDefined();
    expect(style.highlight?.inner?.textColor).toBe('#ea575a');
    expect(style.highlight?.outer?.textColor).toBe('#ea575a');
    expect(style.inner?.textColor).toBe('#efefef');
  });
});

// ── shouldShowLeafLabel ─────────────────────────────────────────────────────

describe('shouldShowLeafLabel', () => {
  const leafNodes = new Set(['leaf1', 'leaf2', 'leaf3']);

  it('returns false for non-leaf nodes', () => {
    expect(shouldShowLeafLabel('parent', leafNodes, null, [])).toBe(false);
  });

  it('returns true for leaf node when no hover', () => {
    expect(shouldShowLeafLabel('leaf1', leafNodes, null, [])).toBe(true);
  });

  it('returns true for hovered leaf node', () => {
    expect(
      shouldShowLeafLabel('leaf1', leafNodes, 'leaf1', ['leaf1', 'leaf2']),
    ).toBe(true);
  });

  it('returns true for visible connected leaf when hovering another leaf', () => {
    expect(
      shouldShowLeafLabel('leaf2', leafNodes, 'leaf1', ['leaf1', 'leaf2']),
    ).toBe(true);
  });

  it('returns false for non-visible leaf when hovering another leaf', () => {
    expect(
      shouldShowLeafLabel('leaf3', leafNodes, 'leaf1', ['leaf1', 'leaf2']),
    ).toBe(false);
  });

  it('works with Set as visibleNodeIds', () => {
    const visibleSet = new Set(['leaf1', 'leaf2']);
    expect(shouldShowLeafLabel('leaf2', leafNodes, 'leaf1', visibleSet)).toBe(
      true,
    );
  });
});

// ── calculateFontSize ───────────────────────────────────────────────────────

describe('calculateFontSize', () => {
  it('returns minFontSize for very small radius', () => {
    expect(calculateFontSize(10, 8, 14)).toBe(8);
  });

  it('returns maxFontSize for very large radius', () => {
    expect(calculateFontSize(200, 8, 14)).toBe(14);
  });

  it('returns proportional size for medium radius', () => {
    const size = calculateFontSize(50, 8, 14);
    expect(size).toBeGreaterThanOrEqual(8);
    expect(size).toBeLessThanOrEqual(14);
    expect(size).toBe(50 * 0.25);
  });

  it('uses default min/max when not specified', () => {
    const size = calculateFontSize(100);
    expect(size).toBeGreaterThanOrEqual(8);
    expect(size).toBeLessThanOrEqual(14);
  });
});

// ── truncateText ────────────────────────────────────────────────────────────

describe('truncateText', () => {
  /** @returns {any} */
  function createMockCtx(widthPerChar = 8) {
    return {
      measureText: vi.fn((text) => ({ width: text.length * widthPerChar })),
    };
  }

  it('returns original text when it fits', () => {
    const ctx = createMockCtx();
    expect(truncateText(ctx, 'hello', 100)).toBe('hello');
  });

  it('truncates text with ellipsis when too wide', () => {
    const ctx = createMockCtx(10);
    const result = truncateText(ctx, 'hello world', 50);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThan('hello world'.length);
  });

  it('returns original text for null ctx', () => {
    expect(truncateText(/** @type {any} */ (null), 'hello', 10)).toBe('hello');
  });

  it('handles very short text', () => {
    const ctx = createMockCtx(100);
    expect(truncateText(ctx, 'ab', 50)).toBe('ab');
  });
});

// ── shouldShowLabel ─────────────────────────────────────────────────────────

describe('shouldShowLabel', () => {
  const leafNodes = new Set(['leaf1']);

  it('returns false for radius <= 0.1', () => {
    expect(
      shouldShowLabel({ id: 'a' }, 0.1, 'a', leafNodes, null, [], {
        textColor: '#333',
      }),
    ).toBe(false);
  });

  it('returns true for radius > 0.1', () => {
    expect(
      shouldShowLabel({ id: 'a' }, 0.5, 'a', leafNodes, null, [], {
        textColor: '#333',
      }),
    ).toBe(true);
  });

  it('returns true for non-leaf node with valid textColor', () => {
    expect(
      shouldShowLabel({ id: 'parent' }, 10, 'parent', leafNodes, null, [], {
        textColor: '#333',
      }),
    ).toBe(true);
  });

  it('returns false for non-leaf with none textColor', () => {
    expect(
      shouldShowLabel({ id: 'parent' }, 10, 'parent', leafNodes, null, [], {
        textColor: 'none',
      }),
    ).toBe(false);
  });

  it('returns false for non-leaf with transparent textColor', () => {
    expect(
      shouldShowLabel({ id: 'parent' }, 10, 'parent', leafNodes, null, [], {
        textColor: 'transparent',
      }),
    ).toBe(false);
  });

  it('delegates to shouldShowLeafLabel for leaf nodes', () => {
    expect(
      shouldShowLabel({ id: 'leaf1' }, 10, 'leaf1', leafNodes, null, [], {
        textColor: '#333',
      }),
    ).toBe(true);
  });
});

// ── drawCenteredLabel ───────────────────────────────────────────────────────

describe('drawCenteredLabel', () => {
  /** @returns {any} */
  function createMockCtx() {
    return {
      measureText: vi.fn(() => ({ width: 40 })),
      fillText: vi.fn(),
      fillStyle: '',
      globalAlpha: 1,
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
    };
  }

  it('does nothing for null ctx', () => {
    expect(() =>
      drawCenteredLabel(/** @type {any} */ (null), 'test', 50, 50, 30, {}),
    ).not.toThrow();
  });

  it('does nothing for empty text', () => {
    const ctx = createMockCtx();
    drawCenteredLabel(ctx, '', 50, 50, 30, {});
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('draws text at center position', () => {
    const ctx = createMockCtx();
    const labelStyle = {
      textColor: '#333',
      textOpacity: 1,
      fontFamily: 'monospace',
      inner: { textColor: '#333', textOpacity: 1 },
    };
    drawCenteredLabel(ctx, 'Hello', 50, 50, 30, labelStyle, 8, 14);
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.fillText.mock.calls[0][1]).toBe(50);
    expect(ctx.fillText.mock.calls[0][2]).toBe(50);
  });

  it('applies highlight style when active', () => {
    const ctx = createMockCtx();
    const labelStyle = {
      inner: { textColor: '#333', fontFamily: 'monospace' },
    };
    const highlightStyle = {
      inner: { textColor: '#ff0000', fontWeight: 'bold' },
    };

    drawCenteredLabel(
      ctx,
      'Hello',
      50,
      50,
      30,
      labelStyle,
      8,
      14,
      true,
      highlightStyle,
    );

    expect(ctx.fillText).toHaveBeenCalled();
  });
});
