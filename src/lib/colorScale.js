import * as d3ScaleChromatic from 'd3-scale-chromatic';

const PERCEPTUALLY_UNIFORM_SCALES = [
  'Viridis',
  'Inferno',
  'Magma',
  'Plasma',
  'Cividis',
  'Turbo',
  'Warm',
  'Cool',
  'CubehelixDefault',
];

/**
 * Resolve a scale name (e.g. 'magma') to a d3 sequential interpolator.
 * @param {string} name - Scale name (case-insensitive, e.g. 'magma', 'viridis', 'Blues')
 * @returns {{ key: string, interpolator: ((t: number) => string) } | null} The interpolator name and function, or null if not found
 */
export function getInterpolator(name) {
  const key = 'interpolate' + name.charAt(0).toUpperCase() + name.slice(1);
  const interpolator = /** @type {Record<string, any>} */ (d3ScaleChromatic)[
    key
  ];
  return typeof interpolator === 'function' ? { key, interpolator } : null;
}

/**
 * Sample `n` evenly-spaced colors from a d3 sequential interpolator.
 * @param {(t: number) => string} interpolator - d3 interpolator function
 * @param {number} n - Number of colors to sample (must be >= 1)
 * @param {boolean} [reverse=false] - Whether to reverse the scale direction
 * @returns {string[]} Array of CSS color strings
 */
export function sampleColors(interpolator, n, reverse = false) {
  const colors = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    colors.push(interpolator(t));
  }
  return reverse ? colors.reverse() : colors;
}

/**
 * Check whether a value is a color scale object ({ scale: string, reverse?: boolean }).
 * @param {any} value
 * @returns {value is { scale: string, reverse?: boolean }}
 */
export function isColorScale(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.scale === 'string'
  );
}

/**
 * Expand wildcard depth entries (depth: '*') in a depths array.
 * For each wildcard entry, resolves ColorScale objects in node.fillColor
 * and node.strokeColor into concrete hex colors per depth level.
 *
 * @param {Array<any>} depths - The depths array from merged styles
 * @param {number} maxDepth - Maximum depth in the tree (0-based)
 * @returns {Array<any>} New depths array with wildcards expanded into per-depth entries
 */
export function expandWildcardDepths(depths, maxDepth) {
  if (!depths || !depths.length) return depths || [];

  // Wildcard entries are expanded first so numeric depth entries override them
  const wildcardExpanded = [];
  const numericEntries = [];

  for (const entry of depths) {
    if (entry.depth !== '*') {
      numericEntries.push(entry);
      continue;
    }

    const n = maxDepth + 1;
    if (n <= 0) continue;

    // Resolve color scales for fillColor and strokeColor
    const fillScale = entry.node?.fillColor;
    const strokeScale = entry.node?.strokeColor;

    let fillColors = null;
    let strokeColors = null;

    if (isColorScale(fillScale)) {
      const fillInterpolator = getInterpolator(fillScale.scale);
      if (fillInterpolator) {
        const { key, interpolator } = fillInterpolator;
        let reverse = fillScale.reverse;
        if (
          !PERCEPTUALLY_UNIFORM_SCALES.includes(key.replace('interpolate', ''))
        ) {
          reverse = !reverse;
        }

        fillColors = sampleColors(interpolator, n, reverse);
      }
    }

    if (isColorScale(strokeScale)) {
      const strokeInterpolator = getInterpolator(strokeScale.scale);
      if (strokeInterpolator) {
        const { key, interpolator } = strokeInterpolator;
        let reverse = strokeScale.reverse;
        if (
          !PERCEPTUALLY_UNIFORM_SCALES.includes(key.replace('interpolate', ''))
        ) {
          reverse = !reverse;
        }

        strokeColors = sampleColors(interpolator, n, reverse);
      }
    }

    // Generate one entry per depth level
    for (let d = 0; d < n; d++) {
      /** @type {Record<string, any>} */
      const nodeOverrides = {};
      if (fillColors) nodeOverrides.fillColor = fillColors[d];
      if (strokeColors) nodeOverrides.strokeColor = strokeColors[d];

      // Carry over any non-scale node properties (fillOpacity, strokeWidth, etc.)
      if (entry.node) {
        for (const [key, value] of Object.entries(entry.node)) {
          if (!isColorScale(value) && !(key in nodeOverrides)) {
            nodeOverrides[key] = value;
          }
        }
      }

      // Build the expanded depth entry
      /** @type {Record<string, any>} */
      const expanded = { depth: d };

      if (Object.keys(nodeOverrides).length > 0) {
        expanded.node = nodeOverrides;
      }

      // Copy non-node properties (label, link, highlight) as-is
      if (entry.label) expanded.label = entry.label;
      if (entry.link) expanded.link = entry.link;
      if (entry.highlight) expanded.highlight = entry.highlight;

      wildcardExpanded.push(expanded);
    }
  }

  const result = [...wildcardExpanded, ...numericEntries];

  return result;
}
