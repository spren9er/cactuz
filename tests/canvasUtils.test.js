import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setupCanvas,
  colorWithAlpha,
  setCanvasStyles,
} from '$lib/canvasUtils.js';

// ── colorWithAlpha ──────────────────────────────────────────────────────────

describe('colorWithAlpha', () => {
  it('returns original color when alpha is 1', () => {
    expect(colorWithAlpha('#ff0000', 1)).toBe('#ff0000');
  });

  it('converts 6-digit hex to rgba', () => {
    expect(colorWithAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('converts 3-digit hex to rgba', () => {
    expect(colorWithAlpha('#f00', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('converts rgb() to rgba()', () => {
    expect(colorWithAlpha('rgb(255, 128, 0)', 0.3)).toBe(
      'rgba(255, 128, 0, 0.3)',
    );
  });

  it('replaces alpha in existing rgba()', () => {
    expect(colorWithAlpha('rgba(255, 128, 0, 1)', 0.7)).toBe(
      'rgba(255, 128, 0, 0.7)',
    );
  });

  it('returns original for unrecognized color formats', () => {
    expect(colorWithAlpha('red', 0.5)).toBe('red');
  });

  it('returns null/undefined as-is', () => {
    expect(colorWithAlpha(/** @type {any} */ (null), 0.5)).toBeNull();
  });

  it('returns color when alpha is undefined', () => {
    expect(colorWithAlpha('#ff0000', /** @type {any} */ (undefined))).toBe(
      '#ff0000',
    );
  });

  it('returns color when alpha is null', () => {
    expect(colorWithAlpha('#ff0000', /** @type {any} */ (null))).toBe(
      '#ff0000',
    );
  });

  it('caches results for repeated calls', () => {
    const result1 = colorWithAlpha('#00ff00', 0.4);
    const result2 = colorWithAlpha('#00ff00', 0.4);
    expect(result1).toBe(result2);
    expect(result1).toBe('rgba(0, 255, 0, 0.4)');
  });

  it('handles empty string', () => {
    expect(colorWithAlpha('', 0.5)).toBe('');
  });

  it('handles hex with alpha 0', () => {
    expect(colorWithAlpha('#ff0000', 0)).toBe('rgba(255, 0, 0, 0)');
  });
});

// ── setCanvasStyles ─────────────────────────────────────────────────────────

describe('setCanvasStyles', () => {
  /** @returns {any} */
  function createMockCtx() {
    return {
      strokeStyle: '#000000',
      fillStyle: '#000000',
      lineWidth: 1,
      globalAlpha: 1,
      textAlign: 'start',
      textBaseline: 'alphabetic',
      font: '10px sans-serif',
    };
  }

  it('sets strokeStyle when different', () => {
    const ctx = createMockCtx();
    setCanvasStyles(ctx, { strokeStyle: '#ff0000' });
    expect(ctx.strokeStyle).toBe('#ff0000');
  });

  it('does not set strokeStyle when same', () => {
    const ctx = createMockCtx();
    ctx.strokeStyle = '#ff0000';
    const original = ctx.strokeStyle;
    setCanvasStyles(ctx, { strokeStyle: '#ff0000' });
    expect(ctx.strokeStyle).toBe(original);
  });

  it('sets fillStyle', () => {
    const ctx = createMockCtx();
    setCanvasStyles(ctx, { fillStyle: '#00ff00' });
    expect(ctx.fillStyle).toBe('#00ff00');
  });

  it('sets lineWidth', () => {
    const ctx = createMockCtx();
    setCanvasStyles(ctx, { lineWidth: 3 });
    expect(ctx.lineWidth).toBe(3);
  });

  it('sets globalAlpha', () => {
    const ctx = createMockCtx();
    setCanvasStyles(ctx, { globalAlpha: 0.5 });
    expect(ctx.globalAlpha).toBe(0.5);
  });

  it('sets textAlign', () => {
    const ctx = createMockCtx();
    setCanvasStyles(ctx, { textAlign: 'center' });
    expect(ctx.textAlign).toBe('center');
  });

  it('sets textBaseline', () => {
    const ctx = createMockCtx();
    setCanvasStyles(ctx, { textBaseline: 'middle' });
    expect(ctx.textBaseline).toBe('middle');
  });

  it('sets font', () => {
    const ctx = createMockCtx();
    setCanvasStyles(ctx, { font: 'bold 14px monospace' });
    expect(ctx.font).toBe('bold 14px monospace');
  });

  it('sets multiple properties at once', () => {
    const ctx = createMockCtx();
    setCanvasStyles(ctx, {
      strokeStyle: '#ff0000',
      fillStyle: '#00ff00',
      lineWidth: 2,
      globalAlpha: 0.8,
    });
    expect(ctx.strokeStyle).toBe('#ff0000');
    expect(ctx.fillStyle).toBe('#00ff00');
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.globalAlpha).toBe(0.8);
  });

  it('does nothing when ctx is null', () => {
    expect(() =>
      setCanvasStyles(/** @type {any} */ (null), { fillStyle: 'red' }),
    ).not.toThrow();
  });

  it('skips undefined properties', () => {
    const ctx = createMockCtx();
    ctx.lineWidth = 5;
    setCanvasStyles(ctx, { fillStyle: '#ff0000' });
    expect(ctx.lineWidth).toBe(5);
  });
});

// ── setupCanvas ─────────────────────────────────────────────────────────────

describe('setupCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 1);
  });

  it('returns null for null canvas', () => {
    expect(setupCanvas(/** @type {any} */ (null), 800, 600)).toBeNull();
  });

  it('sets canvas dimensions accounting for devicePixelRatio', () => {
    vi.stubGlobal('devicePixelRatio', 2);

    const mockCtx = {
      scale: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      lineCap: 'butt',
      lineJoin: 'miter',
    };

    const canvas = /** @type {any} */ ({
      width: 0,
      height: 0,
      style: { width: '', height: '' },
      getContext: vi.fn(() => mockCtx),
    });

    const ctx = setupCanvas(canvas, 800, 600);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('600px');
    expect(mockCtx.scale).toHaveBeenCalledWith(2, 2);
    expect(ctx).toBe(mockCtx);
  });

  it('returns cached context for same canvas and dimensions', () => {
    const mockCtx = {
      scale: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      lineCap: 'butt',
      lineJoin: 'miter',
    };

    const canvas = /** @type {any} */ ({
      width: 0,
      height: 0,
      style: { width: '', height: '' },
      getContext: vi.fn(() => mockCtx),
    });

    const ctx1 = setupCanvas(canvas, 400, 300);
    const ctx2 = setupCanvas(canvas, 400, 300);

    expect(ctx1).toBe(ctx2);
    expect(canvas.getContext).toHaveBeenCalledTimes(1);
  });
});
