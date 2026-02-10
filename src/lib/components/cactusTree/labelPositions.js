/**
 * Label positioning utilities for CactusTree component
 * Handles smart label placement to avoid overlaps and provide readable text layout
 */

import Rand, { PRNG } from 'rand-seed';

/**
 * Represents a text label with position and dimensions
 */
export class Label {
  constructor(
    /** @type {string} */ key,
    /** @type {string} */ name,
    /** @type {number} */ x,
    /** @type {number} */ y,
    /** @type {number} */ width,
    /** @type {number} */ height,
  ) {
    this.key = key;
    this.name = name;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  /**
   * Check if this label overlaps with another label
   * @param {Label} other - Other label to check against
   * @returns {boolean} Whether labels overlap
   */
  overlaps(other) {
    return !(
      this.x + this.width < other.x ||
      other.x + other.width < this.x ||
      this.y + this.height < other.y ||
      other.y + other.height < this.y
    );
  }

  /**
   * Get the center point of the label
   * @returns {{ x: number, y: number }} Center coordinates
   */
  getCenter() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2,
    };
  }
}

/**
 * Represents an anchor point (node position and radius)
 */
export class Anchor {
  constructor(
    /** @type {number} */ x,
    /** @type {number} */ y,
    /** @type {number} */ radius,
  ) {
    this.x = x;
    this.y = y;
    this.radius = radius;
  }

  /**
   * Calculate distance from anchor to a point
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Distance
   */
  distanceTo(/** @type {number} */ x, /** @type {number} */ y) {
    return Math.sqrt((x - this.x) ** 2 + (y - this.y) ** 2);
  }
}

/**
 * Represents a link line from anchor to label
 */
export class Link {
  constructor(
    /** @type {number} */ x1,
    /** @type {number} */ y1,
    /** @type {number} */ x2,
    /** @type {number} */ y2,
  ) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }
}

/**
 * Monte Carlo label positioning algorithm
 * Uses simulated annealing to find optimal label positions
 */
export class CircleAwareLabeler {
  constructor(
    /** @type {any[]} */ labels,
    /** @type {any[]} */ anchors,
    /** @type {any[]} */ allNodes,
    /** @type {number} */ width,
    /** @type {number} */ height,
    /** @type {any} */ options = {},
  ) {
    this.labels = [...labels]; // Copy to avoid mutating originals
    this.anchors = anchors;
    this.allNodes = allNodes; // All nodes for circle collision detection
    this.width = width;
    this.height = height;
    /** @type {any[]} */
    this.links = [];

    // Random number generator (same seed for consistency)
    this.rand = new Rand('42', PRNG.mulberry32);

    // Energy function weights
    this.wLeaderLineLength = options.wLeaderLineLength || 0.2;
    this.wLeaderLineIntersection = options.wLeaderLineIntersection || 1.0;
    this.wLabelLabelOverlap = options.wLabelLabelOverlap || 30.0;
    this.wLabelAnchorOverlap = options.wLabelAnchorOverlap || 30.0;
    this.wOrientation = options.wOrientation || 3.0;

    // Movement constraints
    this.maxMove = options.maxMove || 15.0;
    this.maxAngle = options.maxAngle || Math.PI / 4;
    this.labelAnchorPadding = options.labelAnchorPadding || 2;

    // Statistics
    this.accept = 0;
    this.reject = 0;
  }

  /**
   * Main algorithm using Monte Carlo simulated annealing
   */
  call(nSweeps = 120) {
    const initialTemperature = 1.0;
    let currentTemperature = 1.0;

    for (let i = 0; i < nSweeps; i++) {
      for (let j = 0; j < this.labels.length; j++) {
        if (this.rand.next() < 0.5) {
          this.monteCarloMove(currentTemperature);
        } else {
          this.monteCarloRotate(currentTemperature);
        }
      }

      currentTemperature = this.coolingSchedule(
        currentTemperature,
        initialTemperature,
        nSweeps,
      );
    }
  }

  /**
   * Get label anchor point (where link connects to label)
   * Accepts either an Anchor instance or a plain object with { x, y, radius }.
   * @param {Label} label
   * @param {{x:number,y:number,radius:number}|Anchor} anchor
   * @returns {{x:number,y:number}}
   */
  getLabelAnchorPoint(
    /** @type {Label} */ label,
    /** @type {{x:number,y:number,radius:number}|Anchor} */ anchor,
  ) {
    return calculateLabelAnchorPoint(
      label.x,
      label.y,
      label.width,
      label.height,
      anchor.x,
      anchor.y,
    );
  }

  /**
   * Get x anchor type for a label relative to its anchor
   */
  getXAnchor(/** @type {Label} */ label, /** @type {Anchor} */ anchor) {
    if (anchor.x < label.x) {
      return 'left';
    } else if (anchor.x > label.x + label.width) {
      return 'right';
    }
    return 'center';
  }

  /**
   * Get y anchor type for a label relative to its anchor
   */
  getYAnchor(/** @type {Label} */ label, /** @type {Anchor} */ anchor) {
    if (anchor.y < label.y) {
      return 'bottom';
    } else if (anchor.y > label.y + label.height) {
      return 'top';
    }
    return 'middle';
  }

  /**
   * Calculate distance from label to anchor using anchor point
   */
  distanceTo(/** @type {Label} */ label, /** @type {Anchor} */ anchor) {
    const anchorPoint = this.getLabelAnchorPoint(label, anchor);
    return Math.hypot(anchorPoint.x - anchor.x, anchorPoint.y - anchor.y);
  }

  /**
   * Check if two line segments intersect
   */
  intersect(
    /** @type {number} */ x1,
    /** @type {number} */ x2,
    /** @type {number} */ x3,
    /** @type {number} */ x4,
    /** @type {number} */ y1,
    /** @type {number} */ y2,
    /** @type {number} */ y3,
    /** @type {number} */ y4,
  ) {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    const numerA = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
    const numerB = (x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3);

    const muA = numerA / denom;
    const muB = numerB / denom;

    return !(muA < 0 || muA > 1 || muB < 0 || muB > 1);
  }

  /**
   * Check if label overlaps with a circle using proper circle-rectangle collision
   */
  labelOverlapsCircle(
    /** @type {number} */ rectX,
    /** @type {number} */ rectY,
    /** @type {number} */ rectWidth,
    /** @type {number} */ rectHeight,
    /** @type {number} */ circleX,
    /** @type {number} */ circleY,
    /** @type {number} */ circleRadius,
    /** @type {number=} */ anchorPadding,
  ) {
    const closestX = Math.max(rectX, Math.min(circleX, rectX + rectWidth));
    const closestY = Math.max(rectY, Math.min(circleY, rectY + rectHeight));
    const distance = Math.sqrt(
      (circleX - closestX) ** 2 + (circleY - closestY) ** 2,
    );

    const pad =
      typeof anchorPadding === 'number'
        ? anchorPadding
        : this.labelAnchorPadding;

    return distance < circleRadius + pad;
  }

  /**
   * Calculate energy for a label (lower is better)
   */
  energy(/** @type {number} */ index) {
    const currentLabel = this.labels[index];
    const currentAnchor = this.anchors[index];

    let energy = 0;

    const x21 = currentLabel.x;
    const y21 = currentLabel.y;
    const x22 = currentLabel.x + currentLabel.width;
    const y22 = currentLabel.y + currentLabel.height;

    // Leader line length penalty
    const dist = this.distanceTo(currentLabel, currentAnchor);
    if (dist > 0) energy += dist * this.wLeaderLineLength;

    // Orientation change penalty
    const xAnchorChanged =
      this.getXAnchor(currentLabel, currentAnchor) !==
      currentLabel.initialXAnchor;
    const yAnchorChanged =
      this.getYAnchor(currentLabel, currentAnchor) !==
      currentLabel.initialYAnchor;

    if (xAnchorChanged) energy += this.wOrientation;
    if (yAnchorChanged) energy += this.wOrientation;

    // Check label-label overlaps and leader line intersections
    for (let i = 0; i < this.labels.length; i++) {
      if (i === index) continue;

      const otherLabel = this.labels[i];
      const otherAnchor = this.anchors[i];
      const otherLabelAnchorPoint = this.getLabelAnchorPoint(
        otherLabel,
        otherAnchor,
      );
      const currentLabelAnchorPoint = this.getLabelAnchorPoint(
        currentLabel,
        currentAnchor,
      );

      // Leader line intersection penalty
      const overlap = this.intersect(
        currentAnchor.x,
        currentLabelAnchorPoint.x,
        otherAnchor.x,
        otherLabelAnchorPoint.x,
        currentAnchor.y,
        currentLabelAnchorPoint.y,
        otherAnchor.y,
        otherLabelAnchorPoint.y,
      );

      if (overlap) energy += this.wLeaderLineIntersection;

      // Label-label overlap penalty
      const x11 = otherLabel.x;
      const y11 = otherLabel.y;
      const x12 = otherLabel.x + otherLabel.width;
      const y12 = otherLabel.y + otherLabel.height;

      const xOverlap = Math.max(0, Math.min(x12, x22) - Math.max(x11, x21));
      const yOverlap = Math.max(0, Math.min(y12, y22) - Math.max(y11, y21));
      const overlapArea = xOverlap * yOverlap;
      energy += overlapArea * this.wLabelLabelOverlap;
    }

    // Check label-circle overlaps for ALL nodes (not just labeled ones)
    // This is crucial to avoid overlapping with circles at different levels
    for (const nodeData of this.allNodes) {
      const { x: circleX, y: circleY, radius: circleRadius } = nodeData;

      // Check if label overlaps with this circle
      if (
        this.labelOverlapsCircle(
          x21,
          y21,
          currentLabel.width,
          currentLabel.height,
          circleX,
          circleY,
          circleRadius,
          typeof currentLabel.anchorPadding === 'number'
            ? currentLabel.anchorPadding
            : this.labelAnchorPadding,
        )
      ) {
        // Heavy penalty for overlapping with any circle
        // Calculate overlap amount for proportional penalty
        const closestX = Math.max(x21, Math.min(circleX, x22));
        const closestY = Math.max(y21, Math.min(circleY, y22));
        const distToCircle = Math.sqrt(
          (circleX - closestX) ** 2 + (circleY - closestY) ** 2,
        );
        const penetration = Math.max(
          0,
          circleRadius +
            (typeof currentLabel.anchorPadding === 'number'
              ? currentLabel.anchorPadding
              : this.labelAnchorPadding) -
            distToCircle,
        );
        // Use a very high weight for circle overlaps to strongly discourage them
        energy += penetration * penetration * this.wLabelAnchorOverlap * 10;
      }
    }

    return energy;
  }

  /**
   * Monte Carlo move: randomly move a label
   */
  monteCarloMove(/** @type {number} */ currentTemperature) {
    const i = Math.floor(this.rand.next() * this.labels.length);

    const label = this.labels[i];
    const { x, y } = label;

    const xOld = x;
    const yOld = y;

    const oldEnergy = this.energy(i);

    label.x += (this.rand.next() - 0.5) * this.maxMove;
    label.y += (this.rand.next() - 0.5) * this.maxMove;

    const newEnergy = this.energy(i);
    const deltaEnergy = newEnergy - oldEnergy;

    // Accept or reject move based on energy change and temperature
    if (this.rand.next() < Math.exp(-deltaEnergy / currentTemperature)) {
      this.accept += 1;
    } else {
      label.x = xOld;
      label.y = yOld;
      this.reject += 1;
    }
  }

  /**
   * Monte Carlo rotate: rotate a label around its anchor
   */
  monteCarloRotate(/** @type {number} */ currentTemperature) {
    const i = Math.floor(this.rand.next() * this.labels.length);

    const anchor = this.anchors[i];
    const label = this.labels[i];
    const { x, y } = label;

    const xOld = x;
    const yOld = y;

    const oldEnergy = this.energy(i);

    const angle = (this.rand.next() - 0.5) * this.maxAngle;

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    // Translate to origin
    label.x -= anchor.x;
    label.y -= anchor.y;

    // Get anchor point relative to origin
    const anchorPoint = this.getLabelAnchorPoint(label, {
      x: 0,
      y: 0,
      radius: 0,
    });

    // Rotate anchor point
    const xNewAnchorPoint = anchorPoint.x * c - anchorPoint.y * s;
    const yNewAnchorPoint = anchorPoint.x * s + anchorPoint.y * c;

    // Calculate translation to keep anchor point fixed
    const dx = xNewAnchorPoint - anchorPoint.x;
    const dy = yNewAnchorPoint - anchorPoint.y;

    // Translate back
    label.x += dx + anchor.x;
    label.y += dy + anchor.y;

    const newEnergy = this.energy(i);
    const deltaEnergy = newEnergy - oldEnergy;

    // Accept or reject rotation based on energy change and temperature
    if (this.rand.next() < Math.exp(-deltaEnergy / currentTemperature)) {
      this.accept += 1;
    } else {
      label.x = xOld;
      label.y = yOld;
      this.reject += 1;
    }
  }

  /**
   * Linear cooling schedule for simulated annealing
   */
  coolingSchedule(
    /** @type {number} */ currentTemperature,
    /** @type {number} */ initialTemperature,
    /** @type {number} */ nSweeps,
  ) {
    return currentTemperature - initialTemperature / nSweeps;
  }
}

/**
 * Calculate label anchor point based on angle from anchor to label center
 * Uses angle-based logic for better alignment on edges vs corners
 * @param {number} labelX - Label X position (top-left)
 * @param {number} labelY - Label Y position (top-left)
 * @param {number} labelWidth - Label width
 * @param {number} labelHeight - Label height
 * @param {number} anchorX - Anchor X position
 * @param {number} anchorY - Anchor Y position
 * @returns {{ x: number, y: number }} Anchor point on label edge
 */
function calculateLabelAnchorPoint(
  labelX,
  labelY,
  labelWidth,
  labelHeight,
  anchorX,
  anchorY,
) {
  // Calculate angle from anchor to label center
  const labelCenterX = labelX + labelWidth / 2;
  const labelCenterY = labelY + labelHeight / 2;
  const dx = labelCenterX - anchorX;
  const dy = labelCenterY - anchorY;
  const angle = Math.atan2(dy, dx);

  // Normalize angle to [0, 2π)
  const normalizedAngle =
    ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // Convert to degrees for easier reasoning
  const degrees = (normalizedAngle * 180) / Math.PI;

  // Use 8 directions with 45-degree sectors
  // Right: 337.5° - 22.5° (0°)
  if (degrees >= 337.5 || degrees < 22.5) {
    // Anchor on left edge, middle
    return { x: labelX, y: labelY + labelHeight / 2 };
  }
  // Bottom-right: 22.5° - 67.5° (45°)
  else if (degrees >= 22.5 && degrees < 67.5) {
    // Anchor on top-left corner
    return { x: labelX, y: labelY };
  }
  // Bottom: 67.5° - 112.5° (90°)
  else if (degrees >= 67.5 && degrees < 112.5) {
    // Anchor on top edge, center
    return { x: labelX + labelWidth / 2, y: labelY };
  }
  // Bottom-left: 112.5° - 157.5° (135°)
  else if (degrees >= 112.5 && degrees < 157.5) {
    // Anchor on top-right corner
    return { x: labelX + labelWidth, y: labelY };
  }
  // Left: 157.5° - 202.5° (180°)
  else if (degrees >= 157.5 && degrees < 202.5) {
    // Anchor on right edge, middle
    return { x: labelX + labelWidth, y: labelY + labelHeight / 2 };
  }
  // Top-left: 202.5° - 247.5° (225°)
  else if (degrees >= 202.5 && degrees < 247.5) {
    // Anchor on bottom-right corner
    return { x: labelX + labelWidth, y: labelY + labelHeight };
  }
  // Top: 247.5° - 292.5° (270°)
  else if (degrees >= 247.5 && degrees < 292.5) {
    // Anchor on bottom edge, center
    return { x: labelX + labelWidth / 2, y: labelY + labelHeight };
  }
  // Top-right: 292.5° - 337.5° (315°)
  else {
    // Anchor on bottom-left corner
    return { x: labelX, y: labelY + labelHeight };
  }
}

/**
 * Main label positioner for CactusTree nodes
 */
export class LabelPositioner {
  constructor(
    /** @type {any[]} */ renderedNodes,
    /** @type {number} */ width,
    /** @type {number} */ height,
    /** @type {string} */ fontFamily = 'monospace',
    /** @type {number} */ fontSize = 12,
    /** @type {any} */ options = {},
  ) {
    this.renderedNodes = renderedNodes;
    this.width = width;
    this.height = height;
    this.fontFamily = fontFamily;
    this.fontSize = fontSize;
    this.options = {
      minRadius: 2, // Lower threshold to show labels for smaller nodes
      maxRadius: 50,
      labelPadding: 2, // Text padding (will be overridden by options)
      linkPadding: 0, // Gap between circle and link start (will be overridden by options)
      linkLength: 0, // Extension of link beyond circle (will be overridden by options)
      ...options,
    };

    // Create canvas context for text measurement
    this.canvas = document.createElement('canvas');
    this.ctx = /** @type {CanvasRenderingContext2D} */ (
      this.canvas.getContext('2d')
    );
    this.ctx.font = `${fontSize}px ${fontFamily}`;
  }

  /**
   * Calculate optimal label positions
   * @returns {{ labels: any[], links: any[] }} Positioned labels and connecting links
   */
  calculate() {
    const labelData = this.setupLabels();
    return this.resolvePositions(labelData);
  }

  /**
   * Setup initial label positions around nodes
   * @returns {any[]} Array of { label, anchor, isInside } objects
   */
  setupLabels() {
    return this.renderedNodes
      .filter(/** @type {any} */ (nodeData) => this.shouldShowLabel(nodeData))
      .map(
        /** @type {any} */ (nodeData) => {
          const { x, y, radius, node } = nodeData;

          // Measure text dimensions
          const text = node.name || node.id;

          // Allow per-node label padding and per-node link settings (fall back to options)
          // Use explicit typeof/ternary fallbacks to avoid mixing ?? and || operators,
          // and to ensure defaults are explicit numeric values.
          const nodeLabelPadding =
            node && node.label && typeof node.label.padding === 'number'
              ? node.label.padding
              : node && typeof node.labelPadding === 'number'
                ? node.labelPadding
                : typeof this.options.labelPadding === 'number'
                  ? this.options.labelPadding
                  : 2;
          const nodeLinkPadding =
            node &&
            node.label &&
            node.label.link &&
            typeof node.label.link.padding === 'number'
              ? node.label.link.padding
              : node && typeof node.linkPadding === 'number'
                ? node.linkPadding
                : typeof this.options.linkPadding === 'number'
                  ? this.options.linkPadding
                  : 0;
          const nodeLinkLength =
            node &&
            node.label &&
            node.label.link &&
            typeof node.label.link.length === 'number'
              ? node.label.link.length
              : node && typeof node.linkLength === 'number'
                ? node.linkLength
                : typeof this.options.linkLength === 'number'
                  ? this.options.linkLength
                  : 0;

          const textWidth = this.measureTextWidth(text, nodeLabelPadding);
          const textHeight = this.fontSize + nodeLabelPadding * 2;

          // Check if label fits inside the circle
          const fitsInside = this.canFitInsideCircle(
            textWidth,
            textHeight,
            radius,
          );

          let labelPosition, isInside;

          if (fitsInside) {
            // Place label centered inside the circle
            labelPosition = {
              x: x - textWidth / 2,
              y: y - textHeight / 2,
            };
            isInside = true;
          } else {
            // Find position outside circle that doesn't overlap with other circles
            labelPosition = this.findOutsidePosition(
              x,
              y,
              radius,
              textWidth,
              textHeight,
              {
                labelPadding: nodeLabelPadding,
                linkPadding: nodeLinkPadding,
                linkLength: nodeLinkLength,
              },
            );
            isInside = false;
          }

          const label = new Label(
            node.id,
            text,
            labelPosition.x,
            labelPosition.y,
            textWidth,
            textHeight,
          );

          const anchor = new Anchor(x, y, radius);

          // Include per-label padding/link info so overlap resolver can compute max anchor padding
          const anchorPadding =
            nodeLabelPadding + nodeLinkPadding + nodeLinkLength;

          return {
            label,
            anchor,
            isInside,
            labelPadding: nodeLabelPadding,
            linkPadding: nodeLinkPadding,
            linkLength: nodeLinkLength,
            anchorPadding,
          };
        },
      );
  }

  /**
   * Check if label can fit entirely inside a circle
   * @param {number} labelWidth - Label width
   * @param {number} labelHeight - Label height
   * @param {number} radius - Circle radius
   * @returns {boolean} Whether label fits inside
   */
  canFitInsideCircle(labelWidth, labelHeight, radius) {
    // Use inscribed rectangle in circle formula
    // For a rectangle to fit in a circle: sqrt(width²+ height²) <= 2*radius
    const diagonal = Math.sqrt(
      labelWidth * labelWidth + labelHeight * labelHeight,
    );
    return diagonal <= 2 * radius * 0.9; // 0.9 factor for padding
  }

  /**
   * Find optimal initial position outside circle - deterministic based on available space
   * Places label in the direction with most free space from circles
   * MC algorithm will only handle label-label overlaps
   * @param {number} nodeX - Node center X
   * @param {number} nodeY - Node center Y
   * @param {number} nodeRadius - Node radius
   * @param {number} labelWidth - Label width
   * @param {number} labelHeight - Label height
   * @returns {{ x: number, y: number }} Position for label
   */
  /**
   * Find optimal initial position outside circle - deterministic based on available space
   * Places label in the direction with most free space from circles
   * MC algorithm will only handle label-label overlaps
   * @param {number} nodeX - Node center X
   * @param {number} nodeY - Node center Y
   * @param {number} nodeRadius - Node radius
   * @param {number} labelWidth - Label width
   * @param {number} labelHeight - Label height
   * @param {any} [opts] - Per-node options (labelPadding, linkPadding, linkLength)
   * @returns {{ x: number, y: number }} Position for label
   */
  findOutsidePosition(
    nodeX,
    nodeY,
    nodeRadius,
    labelWidth,
    labelHeight,
    opts = {},
  ) {
    // Total distance from circle center to label position:
    // - linkPadding: gap between circle and link start
    // - linkLength: length of visible link
    // - labelPadding: gap between link end and label
    // Use dot-access and explicit typeof checks to avoid TypeScript index signature errors
    const linkPadding =
      typeof opts.linkPadding === 'number'
        ? opts.linkPadding
        : typeof this.options.linkPadding === 'number'
          ? this.options.linkPadding
          : 0;
    const linkLength =
      typeof opts.linkLength === 'number'
        ? opts.linkLength
        : typeof this.options.linkLength === 'number'
          ? this.options.linkLength
          : 0;
    const labelPadding =
      typeof opts.labelPadding === 'number'
        ? opts.labelPadding
        : typeof this.options.labelPadding === 'number'
          ? this.options.labelPadding
          : 0;
    const minDistance = nodeRadius + linkPadding + linkLength + labelPadding;

    // All 8 directions to try
    const angles = [
      Math.PI, // Left (180°)
      (3 * Math.PI) / 2, // Top (270°)
      (5 * Math.PI) / 4, // Top-left (225°)
      (7 * Math.PI) / 4, // Top-right (315°)
      0, // Right (0°)
      Math.PI / 2, // Bottom (90°)
      (3 * Math.PI) / 4, // Bottom-left (135°)
      Math.PI / 4, // Bottom-right (45°)
    ];

    let bestAngle = angles[0];
    let bestScore = -Infinity;

    // Score each direction by distance to nearest circle in that direction
    for (const angle of angles) {
      const distance = minDistance + Math.max(labelWidth, labelHeight) / 2;
      const centerX = nodeX + Math.cos(angle) * distance;
      const centerY = nodeY + Math.sin(angle) * distance;

      // Calculate score = minimum distance to nearby circles
      // Only consider circles within canvas dimensions to avoid coordinate space issues
      let minDistToCircle = Infinity;
      const searchRadius = Math.max(this.width, this.height); // Only check circles within canvas bounds

      for (const nodeData of this.renderedNodes) {
        const { x, y, radius } = nodeData;
        if (x === nodeX && y === nodeY) continue;

        // Skip circles that are too far away (outside canvas)
        const distToNode = Math.sqrt((nodeX - x) ** 2 + (nodeY - y) ** 2);
        if (distToNode > searchRadius) continue;

        const dist =
          Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2) - radius;
        minDistToCircle = Math.min(minDistToCircle, dist);
      }

      // Prefer directions with more space
      if (minDistToCircle > bestScore) {
        bestScore = minDistToCircle;
        bestAngle = angle;
      }
    }

    // Place label in best direction (in world space, no bounds checking)
    const distance = minDistance + Math.max(labelWidth, labelHeight) / 2;
    const centerX = nodeX + Math.cos(bestAngle) * distance;
    const centerY = nodeY + Math.sin(bestAngle) * distance;

    const labelX = centerX - labelWidth / 2;
    const labelY = centerY - labelHeight / 2;

    return { x: labelX, y: labelY };
  }

  /**
   * Check if a label position outside a circle is valid
   * @param {number} labelX - Label X position
   * @param {number} labelY - Label Y position
   * @param {number} labelWidth - Label width
   * @param {number} labelHeight - Label height
   * @param {number} excludeX - Node X to exclude from collision check
   * @param {number} excludeY - Node Y to exclude from collision check
   * @param {number} excludeRadius - Node radius to exclude
   * @returns {boolean} Whether position is valid
   */
  isValidOutsidePosition(
    labelX,
    labelY,
    labelWidth,
    labelHeight,
    excludeX,
    excludeY,
    excludeRadius,
  ) {
    // Check canvas bounds
    if (
      labelX < 0 ||
      labelY < 0 ||
      labelX + labelWidth > this.width ||
      labelY + labelHeight > this.height
    ) {
      return false;
    }

    // Check collision with all other circles
    for (const nodeData of this.renderedNodes) {
      const { x, y, radius } = nodeData;

      // Skip the node we're placing the label for
      if (x === excludeX && y === excludeY && radius === excludeRadius) {
        continue;
      }

      // Check if label rectangle overlaps with this circle
      if (
        this.labelOverlapsCircle(
          labelX,
          labelY,
          labelWidth,
          labelHeight,
          x,
          y,
          radius,
        )
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a label rectangle overlaps with a circle
   * @param {number} rectX - Rectangle X
   * @param {number} rectY - Rectangle Y
   * @param {number} rectWidth - Rectangle width
   * @param {number} rectHeight - Rectangle height
   * @param {number} circleX - Circle center X
   * @param {number} circleY - Circle center Y
   * @param {number} circleRadius - Circle radius
   * @returns {boolean} Whether rectangle overlaps circle
   */
  labelOverlapsCircle(
    rectX,
    rectY,
    rectWidth,
    rectHeight,
    circleX,
    circleY,
    circleRadius,
  ) {
    // Find closest point on rectangle to circle center
    const closestX = Math.max(rectX, Math.min(circleX, rectX + rectWidth));
    const closestY = Math.max(rectY, Math.min(circleY, rectY + rectHeight));

    // Calculate distance from circle center to closest point
    const distance = Math.sqrt(
      (circleX - closestX) ** 2 + (circleY - closestY) ** 2,
    );

    // Overlap if distance is less than radius
    return distance < circleRadius;
  }

  /**
   * Determine if a node should show a label
   * @param {Object} nodeData - Rendered node data
   * @returns {boolean} Whether to show label
   */
  shouldShowLabel(/** @type {any} */ nodeData) {
    const { node } = nodeData;

    // Only show labels for nodes with valid names
    return (node.name || node.id) && (node.name || node.id).trim().length > 0;
  }

  /**
   * Measure text width using canvas context
   * @param {string} text - Text to measure
   * @returns {number} Text width in pixels
   */
  measureTextWidth(/** @type {string} */ text, /** @type {number} */ padding) {
    const p =
      typeof padding === 'number' ? padding : (this.options.labelPadding ?? 0);
    return (
      /** @type {CanvasRenderingContext2D} */ (this.ctx).measureText(text)
        .width +
      p * 2
    );
  }

  /**
   * Resolve overlaps between outside labels using Monte Carlo algorithm
   * @param {any[]} outsideLabels - Array of outside label data
   * @returns {any[]} Resolved outside labels
   */
  resolveOutsideLabelOverlaps(outsideLabels) {
    if (outsideLabels.length <= 1) {
      return outsideLabels;
    }

    const labels = outsideLabels.map((d) => d.label);
    const anchors = outsideLabels.map((d) => d.anchor);

    // Determine which node set to use for circle-overlap checks.
    // Prefer an explicit `allNodes` array if provided in `this.options`
    // so the labeler can avoid overlapping ANY circle on the canvas —
    // including nodes that are not being labeled (this is important when
    // hovering reduces the labeled set). Fall back to `this.renderedNodes`
    // (the nodes that are being labeled) when no full set is supplied.
    //
    // Options supported (in priority order):
    // - this.options.allNodes
    // - this.options.allRenderedNodes (legacy/alternate)
    const nodesWithLabels =
      Array.isArray(this.options && this.options.allNodes) &&
      this.options.allNodes.length
        ? this.options.allNodes
        : Array.isArray(this.options && this.options.allRenderedNodes) &&
            this.options.allRenderedNodes.length
          ? this.options.allRenderedNodes
          : this.renderedNodes;

    // Use Monte Carlo algorithm for placing outside labels
    // labelAnchorPadding creates a virtual extended circle for overlap
    // detection
    // It should include all three padding values to maintain proper spacing.
    // Rather than using a single max anchor padding for all labels (which
    // forces the largest configured link length/padding onto every label),
    // attach a per-label anchorPadding value to each Label instance so the
    // CircleAwareLabeler can respect individual node settings during
    // energy computations.
    const defaultAnchorPadding =
      (this.options.linkPadding || 0) +
      (this.options.linkLength || 0) +
      (this.options.labelPadding || 0);

    // Attach per-label anchorPadding onto each Label instance (fall back to default)
    labels.forEach((lbl, i) => {
      const ap = outsideLabels[i] && outsideLabels[i].anchorPadding;
      lbl.anchorPadding = typeof ap === 'number' ? ap : defaultAnchorPadding;
    });

    const labeler = new CircleAwareLabeler(
      labels,
      anchors,
      nodesWithLabels, // Only nodes being labeled, not all nodes
      this.width,
      this.height,
      {
        xwLeaderLineLength: 0.05,
        wLeaderLineIntersection: 1.0,
        wLabelLabelOverlap: 30.0,
        wLabelAnchorOverlap: 30.0,
        wOrientation: 3.0,
        maxMove: 15.0,
        maxAngle: Math.PI / 4,
      },
    );

    // Run simulated annealing
    labeler.call(60);

    // Return updated label data
    return outsideLabels.map((labelData, i) => ({
      ...labelData,
      label: labels[i], // Use the repositioned label
    }));
  }

  /**
   * Resolve label positions using overlap detection
   * @param {any[]} labelData - Array of { label, anchor, isInside } objects
   * @returns {{ labels: any[], links: any[] }} Final positions
   */
  resolvePositions(labelData) {
    if (labelData.length === 0) {
      return { labels: [], links: [] };
    }

    // Separate inside and outside labels
    const insideLabels = labelData.filter((d) => d.isInside);
    const outsideLabels = labelData.filter((d) => !d.isInside);

    // Inside labels don't need overlap resolution (they're in separate circles)
    // Only resolve overlaps for outside labels
    const resolvedOutsideLabels =
      this.resolveOutsideLabelOverlaps(outsideLabels);

    // Combine all labels
    const allLabels = [...insideLabels, ...resolvedOutsideLabels];

    // Convert back to CactusTree format
    const finalLabels = allLabels.map((labelData) => ({
      nodeId: labelData.label.key,
      text: labelData.label.name,
      x: labelData.label.x,
      y: labelData.label.y,
      width: labelData.label.width,
      height: labelData.label.height,
      anchor: labelData.anchor,
      isInside: labelData.isInside,
    }));

    // Generate links only for outside labels
    const finalLinks = resolvedOutsideLabels.map((labelData) => {
      const label = labelData.label;
      const anchor = labelData.anchor;

      // Calculate the anchor point on the label edge (where link connects)
      const labelAnchorPoint = calculateLabelAnchorPoint(
        label.x,
        label.y,
        label.width,
        label.height,
        anchor.x,
        anchor.y,
      );

      // Calculate the angle from circle center to label anchor point
      const angle = Math.atan2(
        labelAnchorPoint.y - anchor.y,
        labelAnchorPoint.x - anchor.x,
      );

      // Use per-label linkPadding / linkLength when available (fall back to global options)
      const linkPadding =
        labelData.linkPadding ?? this.options.linkPadding ?? 0;
      const linkLength = labelData.linkLength ?? this.options.linkLength ?? 0;

      // Start link from circle perimeter + per-label linkPadding
      const startDistance = anchor.radius + linkPadding;
      const perimeterX = anchor.x + Math.cos(angle) * startDistance;
      const perimeterY = anchor.y + Math.sin(angle) * startDistance;

      return {
        nodeId: label.key,
        x1: perimeterX,
        y1: perimeterY,
        x2: labelAnchorPoint.x,
        y2: labelAnchorPoint.y,
        // actual drawn length (distance between computed perimeter point and label anchor)
        length: Math.sqrt(
          (labelAnchorPoint.x - perimeterX) ** 2 +
            (labelAnchorPoint.y - perimeterY) ** 2,
        ),
        // expose configured per-label linkLength for callers that need it
        configuredLinkLength: linkLength,
      };
    });

    return {
      labels: finalLabels,
      links: finalLinks,
    };
  }

  /**
   * Clean up canvas resources
   */
  dispose() {
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = /** @type {any} */ (null);
      this.ctx = /** @type {any} */ (null);
    }
  }
}

/**
 * Utility function to create positioned labels for CactusTree
 * @param {any[]} renderedNodes - Array of rendered node data
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {any} options - Configuration options
 * @returns {{ labels: any[], links: any[] }} Positioned labels and links
 */
export function calculateLabelPositions(
  /** @type {any[]} */ renderedNodes,
  /** @type {number} */ width,
  /** @type {number} */ height,
  /** @type {any} */ options = {},
) {
  const positioner = new LabelPositioner(
    renderedNodes,
    width,
    height,
    options && options.fontFamily,
    options && options.fontSize,
    options,
  );

  const result = positioner.calculate();
  positioner.dispose();

  return result;
}
