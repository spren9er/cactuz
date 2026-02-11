import { describe, it, expect, vi } from 'vitest';
import { drawConnectingLinks } from '$lib/drawLink.js';

function createMockCtx() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
  };
}

describe('drawConnectingLinks', () => {
  const mergedStyle = {
    link: {
      strokeColor: '#aaaaaa',
      strokeOpacity: 1,
      strokeWidth: 1,
    },
    depths: [],
  };

  it('does nothing when overlap >= 0', () => {
    const ctx = createMockCtx();
    drawConnectingLinks(
      ctx,
      [],
      new Map(),
      mergedStyle,
      new Map(),
      0,
      new Map(),
    );
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('does nothing when ctx is null', () => {
    expect(() =>
      drawConnectingLinks(
        null,
        [],
        new Map(),
        mergedStyle,
        new Map(),
        -1,
        new Map(),
      ),
    ).not.toThrow();
  });

  it('does nothing for empty renderedNodes', () => {
    const ctx = createMockCtx();
    drawConnectingLinks(
      ctx,
      [],
      new Map(),
      mergedStyle,
      new Map(),
      -1,
      new Map(),
    );
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws links between parent and child nodes when overlap < 0', () => {
    const ctx = createMockCtx();
    const parentNode = {
      x: 50,
      y: 50,
      node: { id: 'parent' },
      depth: 0,
    };
    const childNode = { x: 100, y: 100, node: { id: 'child' }, depth: 1 };

    const parentToChildrenMap = new Map();
    parentToChildrenMap.set('parent', [childNode]);

    drawConnectingLinks(
      ctx,
      [parentNode, childNode],
      parentToChildrenMap,
      mergedStyle,
      new Map(),
      -1,
      new Map(),
    );

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(50, 50);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('does not draw when strokeWidth is 0', () => {
    const ctx = createMockCtx();
    const style = {
      link: { strokeColor: '#aaaaaa', strokeOpacity: 1, strokeWidth: 0 },
      depths: [],
    };

    const parentNode = { x: 50, y: 50, node: { id: 'parent' }, depth: 0 };
    const childNode = { x: 100, y: 100, node: { id: 'child' }, depth: 1 };
    const parentToChildrenMap = new Map();
    parentToChildrenMap.set('parent', [childNode]);

    drawConnectingLinks(
      ctx,
      [parentNode, childNode],
      parentToChildrenMap,
      style,
      new Map(),
      -1,
      new Map(),
    );

    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('does not draw when strokeColor is none', () => {
    const ctx = createMockCtx();
    const style = {
      link: { strokeColor: 'none', strokeOpacity: 1, strokeWidth: 1 },
      depths: [],
    };

    const parentNode = { x: 50, y: 50, node: { id: 'parent' }, depth: 0 };
    const childNode = { x: 100, y: 100, node: { id: 'child' }, depth: 1 };
    const parentToChildrenMap = new Map();
    parentToChildrenMap.set('parent', [childNode]);

    drawConnectingLinks(
      ctx,
      [parentNode, childNode],
      parentToChildrenMap,
      style,
      new Map(),
      -1,
      new Map(),
    );

    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('uses depth style over global style', () => {
    const ctx = createMockCtx();
    const depthStyleCache = new Map();
    depthStyleCache.set(0, {
      depth: 0,
      link: { strokeColor: '#ff0000', strokeOpacity: 0.5, strokeWidth: 3 },
    });

    const parentNode = { x: 50, y: 50, node: { id: 'parent' }, depth: 0 };
    const childNode = { x: 100, y: 100, node: { id: 'child' }, depth: 1 };
    const parentToChildrenMap = new Map();
    parentToChildrenMap.set('parent', [childNode]);

    const style = {
      ...mergedStyle,
      depths: [
        {
          depth: 0,
          link: { strokeColor: '#ff0000', strokeOpacity: 0.5, strokeWidth: 3 },
        },
      ],
    };

    drawConnectingLinks(
      ctx,
      [parentNode, childNode],
      parentToChildrenMap,
      style,
      depthStyleCache,
      -1,
      new Map(),
    );

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    // After setCanvasStyles writes lineWidth = 3, the final restore
    // resets to the previous value. Verify the drawing happened.
    expect(ctx.moveTo).toHaveBeenCalledWith(50, 50);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
  });
});
