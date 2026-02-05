/**
 * Mouse interaction handlers for CactusTree component
 * Handles pan, zoom, hover, and other mouse interactions
 */

import { findHoveredNode } from './draw-node.js';

/**
 * Creates mouse move handler
 * @param {{ canvas: HTMLCanvasElement, hoveredNodeId: string|null, renderedNodes: Array<any>, isDragging: boolean, pannable: boolean, panX: number, panY: number, currentZoom: number, lastMouseX: number, lastMouseY: number }} state - Component state object
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Function} scheduleRender - Function to schedule a re-render
 * @returns {function(MouseEvent): void} Mouse move event handler
 */
export function createMouseMoveHandler(state, width, height, scheduleRender) {
  return function handleMouseMove(/** @type {MouseEvent} */ event) {
    if (!state.canvas) return;

    const rect = state.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Handle panning
    if (state.isDragging && state.pannable) {
      const deltaX = mouseX - state.lastMouseX;
      const deltaY = mouseY - state.lastMouseY;
      state.panX += deltaX;
      state.panY += deltaY;
      scheduleRender();
    }

    state.lastMouseX = mouseX;
    state.lastMouseY = mouseY;

    // Handle hovering (only if not dragging and we have rendered nodes)
    // Skip for large datasets to improve performance
    if (
      !state.isDragging &&
      state.renderedNodes.length &&
      state.renderedNodes.length < 10000
    ) {
      // Transform mouse coordinates to account for pan only (like original)
      const transformedMouseX = mouseX - state.panX;
      const transformedMouseY = mouseY - state.panY;

      // Find which node is being hovered
      const newHoveredNodeId = findHoveredNode(
        transformedMouseX,
        transformedMouseY,
        state.renderedNodes,
      );

      // Only re-render if hover state changed
      if (newHoveredNodeId !== state.hoveredNodeId) {
        state.hoveredNodeId = newHoveredNodeId;
        scheduleRender();
      }
    }
  };
}

/**
 * Creates mouse down handler
 * @param {{ canvas: HTMLCanvasElement, isDragging: boolean, pannable: boolean, lastMouseX: number, lastMouseY: number }} state - Component state object
 * @returns {function(MouseEvent): void} Mouse down event handler
 */
export function createMouseDownHandler(state) {
  return function handleMouseDown(/** @type {MouseEvent} */ event) {
    if (!state.pannable) return;

    state.isDragging = true;
    const rect = state.canvas.getBoundingClientRect();
    state.lastMouseX = event.clientX - rect.left;
    state.lastMouseY = event.clientY - rect.top;

    // Prevent text selection during drag
    event.preventDefault();
  };
}

/**
 * Creates mouse up handler
 * @param {{ isDragging: boolean }} state - Component state object
 * @returns {function(): void} Mouse up event handler
 */
export function createMouseUpHandler(state) {
  return function handleMouseUp() {
    state.isDragging = false;
  };
}

/**
 * Creates mouse leave handler
 * @param {{ isDragging: boolean, hoveredNodeId: string|null }} state - Component state object
 * @param {Function} scheduleRender - Function to schedule a re-render
 * @returns {function(): void} Mouse leave event handler
 */
export function createMouseLeaveHandler(state, scheduleRender) {
  return function handleMouseLeave() {
    state.isDragging = false;
    if (state.hoveredNodeId !== null) {
      state.hoveredNodeId = null;
      scheduleRender();
    }
  };
}

/**
 * Creates wheel handler for zoom functionality
 * @param {{ canvas: HTMLCanvasElement, zoomable: boolean, currentZoom: number, minZoomLimit: number, maxZoomLimit: number, panX: number, panY: number }} state - Component state object
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Function} scheduleRender - Function to schedule a re-render
 * @returns {function(WheelEvent): void} Wheel event handler
 */
export function createWheelHandler(state, width, height, scheduleRender) {
  return function handleWheel(/** @type {WheelEvent} */ event) {
    if (!state.zoomable || !state.canvas) return;

    event.preventDefault();

    const rect = state.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate proposed zoom
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const proposedZoom = state.currentZoom * zoomFactor;

    // Check if at bounds to prevent bouncing
    if (
      proposedZoom > state.maxZoomLimit &&
      state.currentZoom >= state.maxZoomLimit
    ) {
      return; // At max bound, don't zoom further
    }
    if (
      proposedZoom < state.minZoomLimit &&
      state.currentZoom <= state.minZoomLimit
    ) {
      return; // At min bound, don't zoom further
    }

    // Apply zoom within precomputed bounds
    const newZoom = Math.max(
      state.minZoomLimit,
      Math.min(state.maxZoomLimit, proposedZoom),
    );

    // Calculate zoom-to-point: keep the world point under the mouse fixed
    const centerX = width / 2;
    const centerY = height / 2;

    // World coordinates of the point under the mouse before zoom
    const worldX = (mouseX - centerX - state.panX) / state.currentZoom;
    const worldY = (mouseY - centerY - state.panY) / state.currentZoom;

    // After zoom, calculate new pan to keep the same world point under the mouse
    // mouseX = centerX + panX + worldX * newZoom
    // Therefore: panX = mouseX - centerX - worldX * newZoom
    state.panX = mouseX - centerX - worldX * newZoom;
    state.panY = mouseY - centerY - worldY * newZoom;

    // Update state
    state.currentZoom = newZoom;

    scheduleRender();
  };
}

/**
 * Creates all mouse event handlers for the CactusTree component
 * @param {{ canvas: HTMLCanvasElement, hoveredNodeId: string|null, renderedNodes: Array<any>, isDragging: boolean, pannable: boolean, zoomable: boolean, panX: number, panY: number, currentZoom: number, lastMouseX: number, lastMouseY: number, minZoomLimit: number, maxZoomLimit: number }} state - Component state object
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Function} scheduleRender - Function to schedule a re-render
 * @returns {{ onMouseMove: function(MouseEvent): void, onMouseDown: function(MouseEvent): void, onMouseUp: function(): void, onMouseLeave: function(): void, onWheel: function(WheelEvent): void }} Object containing all mouse event handlers
 */
export function createMouseHandlers(state, width, height, scheduleRender) {
  return {
    onMouseMove: createMouseMoveHandler(state, width, height, scheduleRender),
    onMouseDown: createMouseDownHandler(state),
    onMouseUp: createMouseUpHandler(state),
    onMouseLeave: createMouseLeaveHandler(state, scheduleRender),
    onWheel: createWheelHandler(state, width, height, scheduleRender),
  };
}
