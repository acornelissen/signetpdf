// Pure zoom maths, kept out of the DOM so it can be unit-tested. Scales are
// pdf.js render scales (1 = intrinsic point size).
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;

// Preset zoom ladder (render scales). The −/+ controls snap between these so the
// readout always shows a sane percentage, unlike a blind multiplier.
export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;

// Per-notch multiplier for continuous (pinch / Ctrl+wheel) zoom.
const WHEEL_ZOOM_INTENSITY = 0.0015;

/** Constrain a scale to the supported range. */
export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Step to the next ladder rung above or below `scale`. Off-ladder scales (e.g.
 * after Fit width) snap to the neighbouring rung; the ends hold.
 */
export function stepZoom(scale: number, direction: "in" | "out"): number {
  if (direction === "in") {
    // The top rung equals MAX_SCALE, so it is the natural ceiling.
    return ZOOM_LEVELS.find((level) => level > scale + 1e-6) ?? MAX_SCALE;
  }
  return [...ZOOM_LEVELS].reverse().find((level) => level < scale - 1e-6) ?? MIN_SCALE;
}

/**
 * Continuous zoom for pinch / Ctrl+wheel. A negative delta (scroll up / pinch
 * open) zooms in; the result is clamped to the supported range. Exponential in
 * the delta so zooming feels even across scales.
 */
export function zoomByDelta(scale: number, deltaY: number): number {
  if (deltaY === 0) {
    return scale;
  }
  return clampScale(scale * Math.exp(-deltaY * WHEEL_ZOOM_INTENSITY));
}

/**
 * Scale needed for a page of `pageWidth` points to fill `availableWidth` pixels,
 * clamped to the supported range. Falls back to 1 for a non-positive width.
 */
export function fitToWidthScale(pageWidth: number, availableWidth: number): number {
  if (pageWidth <= 0) {
    return 1;
  }
  return clampScale(availableWidth / pageWidth);
}
