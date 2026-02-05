/**
 * Canvas utilities for CactusTree component
 * Handles canvas setup, context management, and basic drawing operations
 */

/**
 * Sets up canvas with proper pixel ratio and dimensions
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {CanvasRenderingContext2D|null} - The canvas context
 */
export function setupCanvas(canvas, width, height) {
  if (!canvas) return null;

  const devicePixelRatio = window.devicePixelRatio || 1;

  // Set canvas dimensions (like original - no double-scaling check)
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Apply scaling and settings like original
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  return ctx;
}

/**
 * Sets up the canvas context for drawing with pan and zoom transforms
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} panX - Pan offset X
 * @param {number} panY - Pan offset Y
 * @param {number} zoom - Current zoom level
 */
export function setupCanvasContext(ctx, width, height, panX, panY, zoom = 1) {
  if (!ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Apply transforms: first translate to center, then apply pan and zoom
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(panX / zoom, panY / zoom);
  ctx.translate(-width / 2, -height / 2);
}

/**
 * Restores the canvas context to its previous state
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
export function restoreCanvasContext(ctx) {
  if (!ctx) return;
  ctx.restore();
}

/**
 * Optimized style setter that only updates canvas properties when they change
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {{ strokeStyle?: string, fillStyle?: string, lineWidth?: number, globalAlpha?: number, textAlign?: CanvasTextAlign, textBaseline?: CanvasTextBaseline, font?: string }} styles - Object containing style properties to set
 */
export function setCanvasStyles(ctx, styles) {
  if (!ctx) return;

  const {
    strokeStyle,
    fillStyle,
    lineWidth,
    globalAlpha,
    textAlign,
    textBaseline,
    font,
  } = styles;

  if (strokeStyle !== undefined && ctx.strokeStyle !== strokeStyle) {
    ctx.strokeStyle = strokeStyle;
  }

  if (fillStyle !== undefined && ctx.fillStyle !== fillStyle) {
    ctx.fillStyle = fillStyle;
  }

  if (lineWidth !== undefined && ctx.lineWidth !== lineWidth) {
    ctx.lineWidth = lineWidth;
  }

  if (globalAlpha !== undefined && ctx.globalAlpha !== globalAlpha) {
    ctx.globalAlpha = globalAlpha;
  }

  if (textAlign !== undefined && ctx.textAlign !== textAlign) {
    ctx.textAlign = /** @type {CanvasTextAlign} */ (textAlign);
  }

  if (textBaseline !== undefined && ctx.textBaseline !== textBaseline) {
    ctx.textBaseline = /** @type {CanvasTextBaseline} */ (textBaseline);
  }

  if (font !== undefined && ctx.font !== font) {
    ctx.font = font;
  }
}

/**
 * Transforms mouse coordinates accounting for pan and zoom
 * @param {number} mouseX - Mouse X coordinate
 * @param {number} mouseY - Mouse Y coordinate
 * @param {number} panX - Pan offset X
 * @param {number} panY - Pan offset Y
 * @param {number} zoom - Current zoom level
 * @param {number} centerX - Canvas center X
 * @param {number} centerY - Canvas center Y
 * @returns {{x: number, y: number}} - Transformed coordinates
 */
export function transformMouseCoordinates(
  mouseX,
  mouseY,
  panX,
  panY,
  zoom,
  centerX,
  centerY,
) {
  // Transform mouse coordinates to world coordinates
  const worldX = (mouseX - centerX - panX) / zoom;
  const worldY = (mouseY - centerY - panY) / zoom;

  return {
    x: worldX + centerX,
    y: worldY + centerY,
  };
}

/**
 * Calculate zoom-to-point transformation
 * @param {number} mouseX - Mouse X coordinate
 * @param {number} mouseY - Mouse Y coordinate
 * @param {number} currentZoom - Current zoom level
 * @param {number} newZoom - New zoom level
 * @param {number} panX - Current pan X
 * @param {number} panY - Current pan Y
 * @param {number} centerX - Canvas center X
 * @param {number} centerY - Canvas center Y
 * @returns {{panX: number, panY: number}} - New pan coordinates
 */
export function calculateZoomToPan(
  mouseX,
  mouseY,
  currentZoom,
  newZoom,
  panX,
  panY,
  centerX,
  centerY,
) {
  // World coordinates of the point under the mouse before zoom
  const worldX = (mouseX - centerX - panX) / currentZoom;
  const worldY = (mouseY - centerY - panY) / currentZoom;

  // Calculate new pan to keep the same world point under the mouse
  return {
    panX: mouseX - centerX - worldX * newZoom,
    panY: mouseY - centerY - worldY * newZoom,
  };
}
