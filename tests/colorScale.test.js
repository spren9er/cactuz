import { describe, it, expect } from 'vitest';
import {
  getInterpolator,
  sampleColors,
  isColorScale,
  expandWildcardDepths,
} from '$lib/colorScale.js';

// ── getInterpolator ─────────────────────────────────────────────────────────

describe('getInterpolator', () => {
  it('resolves known sequential scale names', () => {
    const names = [
      'magma',
      'viridis',
      'inferno',
      'plasma',
      'blues',
      'greens',
      'reds',
      'turbo',
      'cividis',
    ];
    for (const name of names) {
      const fn = getInterpolator(name);
      expect(fn, `interpolator for "${name}"`).toBeTypeOf('function');
    }
  });

  it('returns a function that produces CSS color strings', () => {
    const fn = getInterpolator('viridis');
    expect(fn).not.toBeNull();
    const color = /** @type {Function} */ (fn)(0.5);
    expect(typeof color).toBe('string');
    expect(color).toMatch(/^(#|rgb)/);
  });

  it('returns null for unknown scale names', () => {
    expect(getInterpolator('nonExistentScale')).toBeNull();
    expect(getInterpolator('')).toBeNull();
  });

  it('handles capitalisation of first character', () => {
    // 'Blues' starts with uppercase in d3 (interpolateBlues)
    expect(getInterpolator('Blues')).toBeTypeOf('function');
    expect(getInterpolator('blues')).toBeTypeOf('function');
  });
});

// ── sampleColors ────────────────────────────────────────────────────────────

describe('sampleColors', () => {
  const interpolator = /** @type {(t: number) => string} */ (
    getInterpolator('viridis')
  );

  it('returns n colors', () => {
    const colors = sampleColors(interpolator, 5);
    expect(colors).toHaveLength(5);
    for (const c of colors) {
      expect(typeof c).toBe('string');
    }
  });

  it('samples endpoints at t=0 and t=1 for n >= 2', () => {
    const colors = sampleColors(interpolator, 3);
    expect(colors[0]).toBe(interpolator(0));
    expect(colors[2]).toBe(interpolator(1));
  });

  it('samples t=0.5 for a single color', () => {
    const colors = sampleColors(interpolator, 1);
    expect(colors).toHaveLength(1);
    expect(colors[0]).toBe(interpolator(0.5));
  });

  it('reverses the color order when reverse=true', () => {
    const normal = sampleColors(interpolator, 4, false);
    const reversed = sampleColors(interpolator, 4, true);
    expect(reversed).toEqual([...normal].reverse());
  });

  it('returns empty array for n=0', () => {
    expect(sampleColors(interpolator, 0)).toEqual([]);
  });
});

// ── isColorScale ────────────────────────────────────────────────────────────

describe('isColorScale', () => {
  it('returns true for valid color scale objects', () => {
    expect(isColorScale({ scale: 'magma' })).toBe(true);
    expect(isColorScale({ scale: 'viridis', reverse: true })).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(isColorScale('#ff0000')).toBe(false);
    expect(isColorScale('magma')).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isColorScale(null)).toBe(false);
    expect(isColorScale(undefined)).toBe(false);
  });

  it('returns false for objects without scale property', () => {
    expect(isColorScale({ reverse: true })).toBe(false);
    expect(isColorScale({ name: 'magma' })).toBe(false);
  });

  it('returns false for non-string scale property', () => {
    expect(isColorScale({ scale: 123 })).toBe(false);
  });
});

// ── expandWildcardDepths ────────────────────────────────────────────────────

describe('expandWildcardDepths', () => {
  it('returns the input unchanged when no wildcards are present', () => {
    const depths = [
      { depth: 0, node: { fillColor: '#000' } },
      { depth: 1, node: { fillColor: '#111' } },
    ];
    const result = expandWildcardDepths(depths, 3);
    expect(result).toEqual(depths);
  });

  it('returns empty array for empty input', () => {
    expect(expandWildcardDepths([], 3)).toEqual([]);
  });

  it('returns empty array for null/undefined input', () => {
    expect(expandWildcardDepths(/** @type {any} */ (null), 3)).toEqual([]);
    expect(expandWildcardDepths(/** @type {any} */ (undefined), 3)).toEqual([]);
  });

  it('expands a wildcard fillColor into n+1 entries', () => {
    const depths = [{ depth: '*', node: { fillColor: { scale: 'viridis' } } }];
    const result = expandWildcardDepths(depths, 3);

    // maxDepth=3 → 4 entries (depths 0, 1, 2, 3)
    expect(result).toHaveLength(4);
    for (let d = 0; d <= 3; d++) {
      const entry = result[d];
      expect(entry.depth).toBe(d);
      expect(typeof entry.node.fillColor).toBe('string');
    }
  });

  it('expands both fillColor and strokeColor scales', () => {
    const depths = [
      {
        depth: '*',
        node: {
          fillColor: { scale: 'magma' },
          strokeColor: { scale: 'viridis' },
        },
      },
    ];
    const result = expandWildcardDepths(depths, 2);

    expect(result).toHaveLength(3);
    for (const entry of result) {
      expect(typeof entry.node.fillColor).toBe('string');
      expect(typeof entry.node.strokeColor).toBe('string');
    }

    // fillColor and strokeColor should come from different scales
    expect(result[0].node.fillColor).not.toBe(result[0].node.strokeColor);
  });

  it('carries over non-scale node properties', () => {
    const depths = [
      {
        depth: '*',
        node: {
          fillColor: { scale: 'magma' },
          fillOpacity: 0.8,
          strokeWidth: 2,
        },
      },
    ];
    const result = expandWildcardDepths(depths, 1);

    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.node.fillOpacity).toBe(0.8);
      expect(entry.node.strokeWidth).toBe(2);
      expect(typeof entry.node.fillColor).toBe('string');
    }
  });

  it('copies non-node properties (label, link, highlight)', () => {
    const label = { inner: { textColor: '#fff' } };
    const link = { strokeColor: '#ccc' };
    const highlight = { node: { fillColor: '#f00' } };

    const depths = [
      {
        depth: '*',
        node: { fillColor: { scale: 'magma' } },
        label,
        link,
        highlight,
      },
    ];
    const result = expandWildcardDepths(depths, 1);

    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.label).toBe(label);
      expect(entry.link).toBe(link);
      expect(entry.highlight).toBe(highlight);
    }
  });

  it('supports the reverse option', () => {
    const depths = [
      { depth: '*', node: { fillColor: { scale: 'viridis', reverse: false } } },
    ];
    const depthsReversed = [
      { depth: '*', node: { fillColor: { scale: 'viridis', reverse: true } } },
    ];

    const normal = expandWildcardDepths(depths, 3);
    const reversed = expandWildcardDepths(depthsReversed, 3);

    const normalColors = normal.map((e) => e.node.fillColor);
    const reversedColors = reversed.map((e) => e.node.fillColor);
    expect(reversedColors).toEqual([...normalColors].reverse());
  });

  it('places wildcard entries before numeric entries (order of application)', () => {
    const depths = [
      { depth: '*', node: { fillColor: { scale: 'magma' } } },
      { depth: 1, node: { fillColor: '#custom' } },
    ];
    const result = expandWildcardDepths(depths, 2);

    // 3 wildcard-expanded (depths 0,1,2) + 1 numeric (depth 1) = 4 entries
    expect(result).toHaveLength(4);

    // First 3 entries should be wildcard-expanded (depths 0, 1, 2)
    expect(result[0].depth).toBe(0);
    expect(result[1].depth).toBe(1);
    expect(result[2].depth).toBe(2);

    // Last entry is the numeric override
    expect(result[3]).toEqual({ depth: 1, node: { fillColor: '#custom' } });
  });

  it('numeric depth entries override wildcard entries in depthStyleCache', () => {
    const depths = [
      { depth: '*', node: { fillColor: { scale: 'magma' } } },
      { depth: 1, node: { fillColor: '#override' } },
      { depth: -1, node: { fillColor: '#leaf' } },
    ];
    const result = expandWildcardDepths(depths, 2);

    // Build a cache the same way buildLookupMaps does
    const cache = new Map();
    for (const entry of result) {
      if (entry.depth >= 0) {
        cache.set(entry.depth, entry);
      }
    }

    // Depth 0 and 2 should come from the wildcard
    expect(typeof cache.get(0).node.fillColor).toBe('string');
    expect(cache.get(0).node.fillColor).toMatch(/^(#|rgb)/);

    // Depth 1 should be overridden by the numeric entry
    expect(cache.get(1).node.fillColor).toBe('#override');

    // Negative depths should not be in the cache
    expect(cache.has(-1)).toBe(false);
  });

  it('ignores wildcard with unknown scale name', () => {
    const depths = [
      { depth: '*', node: { fillColor: { scale: 'nonExistent' } } },
    ];
    const result = expandWildcardDepths(depths, 2);

    // Entries are still generated but without fillColor resolved
    expect(result).toHaveLength(3);
    for (const entry of result) {
      expect(entry.node).toBeUndefined();
    }
  });

  it('handles maxDepth of 0 (single root node)', () => {
    const depths = [{ depth: '*', node: { fillColor: { scale: 'magma' } } }];
    const result = expandWildcardDepths(depths, 0);

    expect(result).toHaveLength(1);
    expect(result[0].depth).toBe(0);
    expect(typeof result[0].node.fillColor).toBe('string');
  });
});
