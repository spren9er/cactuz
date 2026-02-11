import { describe, it, expect, vi } from 'vitest';
import {
  createMouseMoveHandler,
  createMouseDownHandler,
  createMouseUpHandler,
  createMouseLeaveHandler,
  createWheelHandler,
  createTouchStartHandler,
  createTouchEndHandler,
  createMouseHandlers,
} from '$lib/mouseHandlers.js';

/** @returns {any} */
function createMockState(overrides = {}) {
  return {
    canvas: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      }),
    },
    hoveredNodeId: null,
    renderedNodes: [],
    isDragging: false,
    pannable: true,
    zoomable: true,
    panX: 0,
    panY: 0,
    currentZoom: 1,
    lastMouseX: 0,
    lastMouseY: 0,
    minZoomLimit: 0.1,
    maxZoomLimit: 10,
    touches: [],
    lastTouchDistance: 0,
    ...overrides,
  };
}

function createMockMouseEvent(x = 100, y = 100) {
  return /** @type {any} */ ({
    clientX: x,
    clientY: y,
    preventDefault: vi.fn(),
  });
}

// ── createMouseMoveHandler ──────────────────────────────────────────────────

describe('createMouseMoveHandler', () => {
  it('returns a function', () => {
    const state = createMockState();
    const handler = createMouseMoveHandler(state, 800, 600, vi.fn());
    expect(typeof handler).toBe('function');
  });

  it('updates lastMouseX/Y on move', () => {
    const state = createMockState();
    const handler = createMouseMoveHandler(state, 800, 600, vi.fn());

    handler(createMockMouseEvent(150, 200));
    expect(state.lastMouseX).toBe(150);
    expect(state.lastMouseY).toBe(200);
  });

  it('pans when dragging', () => {
    const scheduleRender = vi.fn();
    const state = createMockState({
      isDragging: true,
      lastMouseX: 100,
      lastMouseY: 100,
    });
    const handler = createMouseMoveHandler(state, 800, 600, scheduleRender);

    handler(createMockMouseEvent(120, 130));

    expect(state.panX).toBe(20);
    expect(state.panY).toBe(30);
    expect(scheduleRender).toHaveBeenCalled();
  });

  it('does not pan when pannable is false', () => {
    const scheduleRender = vi.fn();
    const state = createMockState({
      isDragging: true,
      pannable: false,
      lastMouseX: 100,
      lastMouseY: 100,
    });
    const handler = createMouseMoveHandler(state, 800, 600, scheduleRender);

    handler(createMockMouseEvent(120, 130));
    expect(state.panX).toBe(0);
  });

  it('does nothing when canvas is null', () => {
    const state = createMockState({ canvas: null });
    const handler = createMouseMoveHandler(state, 800, 600, vi.fn());
    expect(() => handler(createMockMouseEvent())).not.toThrow();
  });
});

// ── createMouseDownHandler ──────────────────────────────────────────────────

describe('createMouseDownHandler', () => {
  it('sets isDragging to true', () => {
    const state = createMockState();
    const handler = createMouseDownHandler(state);

    handler(createMockMouseEvent(50, 60));

    expect(state.isDragging).toBe(true);
    expect(state.lastMouseX).toBe(50);
    expect(state.lastMouseY).toBe(60);
  });

  it('does not set isDragging when pannable is false', () => {
    const state = createMockState({ pannable: false });
    const handler = createMouseDownHandler(state);

    handler(createMockMouseEvent());

    expect(state.isDragging).toBe(false);
  });
});

// ── createMouseUpHandler ────────────────────────────────────────────────────

describe('createMouseUpHandler', () => {
  it('sets isDragging to false', () => {
    const state = createMockState({ isDragging: true });
    const handler = createMouseUpHandler(state);

    handler();

    expect(state.isDragging).toBe(false);
  });
});

// ── createMouseLeaveHandler ─────────────────────────────────────────────────

describe('createMouseLeaveHandler', () => {
  it('clears drag and hover state', () => {
    const scheduleRender = vi.fn();
    const state = createMockState({
      isDragging: true,
      hoveredNodeId: 'someNode',
    });
    const handler = createMouseLeaveHandler(state, scheduleRender);

    handler();

    expect(state.isDragging).toBe(false);
    expect(state.hoveredNodeId).toBeNull();
    expect(scheduleRender).toHaveBeenCalled();
  });

  it('does not schedule render when hoveredNodeId was already null', () => {
    const scheduleRender = vi.fn();
    const state = createMockState({ hoveredNodeId: null });
    const handler = createMouseLeaveHandler(state, scheduleRender);

    handler();

    expect(scheduleRender).not.toHaveBeenCalled();
  });
});

// ── createWheelHandler ──────────────────────────────────────────────────────

describe('createWheelHandler', () => {
  it('zooms in on scroll up', () => {
    const scheduleRender = vi.fn();
    const state = createMockState({ currentZoom: 1 });
    const handler = createWheelHandler(state, 800, 600, scheduleRender);

    const event = /** @type {any} */ ({
      clientX: 400,
      clientY: 300,
      deltaY: -100,
      preventDefault: vi.fn(),
    });

    handler(event);

    expect(state.currentZoom).toBeGreaterThan(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(scheduleRender).toHaveBeenCalled();
  });

  it('zooms out on scroll down', () => {
    const scheduleRender = vi.fn();
    const state = createMockState({ currentZoom: 1 });
    const handler = createWheelHandler(state, 800, 600, scheduleRender);

    const event = /** @type {any} */ ({
      clientX: 400,
      clientY: 300,
      deltaY: 100,
      preventDefault: vi.fn(),
    });

    handler(event);

    expect(state.currentZoom).toBeLessThan(1);
    expect(scheduleRender).toHaveBeenCalled();
  });

  it('does not zoom when zoomable is false', () => {
    const scheduleRender = vi.fn();
    const state = createMockState({ zoomable: false, currentZoom: 1 });
    const handler = createWheelHandler(state, 800, 600, scheduleRender);

    const event = /** @type {any} */ ({
      clientX: 400,
      clientY: 300,
      deltaY: -100,
      preventDefault: vi.fn(),
    });

    handler(event);

    expect(state.currentZoom).toBe(1);
  });

  it('respects max zoom limit', () => {
    const state = createMockState({ currentZoom: 10, maxZoomLimit: 10 });
    const handler = createWheelHandler(state, 800, 600, vi.fn());

    const event = /** @type {any} */ ({
      clientX: 400,
      clientY: 300,
      deltaY: -100,
      preventDefault: vi.fn(),
    });

    handler(event);
    expect(state.currentZoom).toBeLessThanOrEqual(10);
  });
});

// ── createTouchStartHandler ─────────────────────────────────────────────────

describe('createTouchStartHandler', () => {
  it('sets up single touch for panning', () => {
    const state = createMockState();
    const handler = createTouchStartHandler(state, vi.fn());

    const event = /** @type {any} */ ({
      touches: [{ clientX: 100, clientY: 200 }],
      preventDefault: vi.fn(),
    });

    handler(event);

    expect(state.isDragging).toBe(true);
    expect(state.lastMouseX).toBe(100);
    expect(state.lastMouseY).toBe(200);
  });

  it('sets up two-finger pinch zoom', () => {
    const state = createMockState();
    const handler = createTouchStartHandler(state, vi.fn());

    const event = /** @type {any} */ ({
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 200 },
      ],
      preventDefault: vi.fn(),
    });

    handler(event);

    expect(state.lastTouchDistance).toBeGreaterThan(0);
  });
});

// ── createTouchEndHandler ───────────────────────────────────────────────────

describe('createTouchEndHandler', () => {
  it('clears state when all touches end', () => {
    const state = createMockState({ isDragging: true, lastTouchDistance: 50 });
    const handler = createTouchEndHandler(state);

    const event = /** @type {any} */ ({
      touches: [],
      preventDefault: vi.fn(),
    });

    handler(event);

    expect(state.isDragging).toBe(false);
    expect(state.lastTouchDistance).toBe(0);
  });

  it('resets to single touch panning when one finger remains', () => {
    const state = createMockState({ isDragging: false });
    const handler = createTouchEndHandler(state);

    const event = /** @type {any} */ ({
      touches: [{ clientX: 100, clientY: 200 }],
      preventDefault: vi.fn(),
    });

    handler(event);

    expect(state.isDragging).toBe(true);
    expect(state.lastMouseX).toBe(100);
    expect(state.lastTouchDistance).toBe(0);
  });
});

// ── createMouseHandlers ─────────────────────────────────────────────────────

describe('createMouseHandlers', () => {
  it('returns all 8 handler functions', () => {
    const state = createMockState();
    const handlers = createMouseHandlers(state, 800, 600, vi.fn());

    expect(typeof handlers.onMouseMove).toBe('function');
    expect(typeof handlers.onMouseDown).toBe('function');
    expect(typeof handlers.onMouseUp).toBe('function');
    expect(typeof handlers.onMouseLeave).toBe('function');
    expect(typeof handlers.onWheel).toBe('function');
    expect(typeof handlers.onTouchStart).toBe('function');
    expect(typeof handlers.onTouchMove).toBe('function');
    expect(typeof handlers.onTouchEnd).toBe('function');
  });
});
