// Optional snapping for annotation drag and resize. Pure user-space math
// (points, bottom-left origin): the coordinate seam has already turned the
// gesture into a moved or resized box in user space, and snapping only nudges
// that result onto a fixed grid or onto another annotation's edge when one is
// within a few points. It is deliberately free of model and DOM types so it is
// trivially unit-tested; the overlay bindings convert their annotations to Box
// and back (see transform.ts). Snapping is offered by the app on by default and
// bypassed by holding a modifier during the drag (handled in the bindings).

/** Grid spacing the box edges snap to, in user-space points. */
export const SNAP_GRID = 10;

/** How close (user-space points) an edge must be to a line for a snap to engage. */
export const SNAP_THRESHOLD = 6;

/** A box's user-space extent: left/bottom origin plus size. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The vertical edges (x values) of other annotations to align against. */
function xEdges(others: readonly Box[]): number[] {
  return others.flatMap((o) => [o.x, o.x + o.width]);
}

/** The horizontal edges (y values) of other annotations to align against. */
function yEdges(others: readonly Box[]): number[] {
  return others.flatMap((o) => [o.y, o.y + o.height]);
}

/**
 * The line `value` should snap to, or null if nothing is close enough. Another
 * annotation's edge takes precedence when one is within the threshold (aligning
 * to neighbours is the more useful intent); otherwise the nearest grid line is
 * used as the fallback. The grid is always within half a cell, so it engages
 * whenever no neighbour edge does.
 */
function snapTarget(value: number, lines: readonly number[]): number | null {
  let target: number | null = null;
  let bestDist = SNAP_THRESHOLD;
  for (const line of lines) {
    const dist = Math.abs(line - value);
    if (dist <= bestDist) {
      bestDist = dist;
      target = line;
    }
  }
  if (target !== null) {
    return target;
  }
  const grid = Math.round(value / SNAP_GRID) * SNAP_GRID;
  return Math.abs(grid - value) <= SNAP_THRESHOLD ? grid : null;
}

/**
 * The smallest translation that snaps one of `edges` onto a line, or 0 when none
 * of them is within range. Used for a move, where both edges shift together.
 */
function bestEdgeDelta(edges: readonly number[], lines: readonly number[]): number {
  let delta = 0;
  let bestDist = Infinity;
  for (const edge of edges) {
    const target = snapTarget(edge, lines);
    if (target === null) {
      continue;
    }
    const dist = Math.abs(target - edge);
    if (dist < bestDist) {
      bestDist = dist;
      delta = target - edge;
    }
  }
  return delta;
}

/** True if two user-space coordinates differ by more than rounding noise. */
function moved(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-6;
}

/**
 * The translation to apply to a moved box so it snaps to the grid or a
 * neighbour's edge: the box's left/right are aligned for `dx`, top/bottom for
 * `dy`, each by the smallest engaging adjustment.
 */
export function snapMoveDelta(box: Box, others: readonly Box[]): { dx: number; dy: number } {
  return {
    dx: bestEdgeDelta([box.x, box.x + box.width], xEdges(others)),
    dy: bestEdgeDelta([box.y, box.y + box.height], yEdges(others)),
  };
}

/**
 * Snap the edges that a resize actually moved, holding the anchored edges fixed.
 * `original` is the box before the resize, `resized` after; only the moved edges
 * are pulled to a line so the opposite, anchored corner never shifts.
 */
export function snapResizedBox(original: Box, resized: Box, others: readonly Box[]): Box {
  const xs = xEdges(others);
  const ys = yEdges(others);
  let { x, y, width, height } = resized;
  const right = resized.x + resized.width;
  const top = resized.y + resized.height;

  if (moved(resized.x, original.x)) {
    const target = snapTarget(resized.x, xs);
    if (target !== null) {
      x = target;
      width = Math.max(1, right - target);
    }
  } else if (moved(right, original.x + original.width)) {
    const target = snapTarget(right, xs);
    if (target !== null) {
      width = Math.max(1, target - x);
    }
  }

  if (moved(resized.y, original.y)) {
    const target = snapTarget(resized.y, ys);
    if (target !== null) {
      y = target;
      height = Math.max(1, top - target);
    }
  } else if (moved(top, original.y + original.height)) {
    const target = snapTarget(top, ys);
    if (target !== null) {
      height = Math.max(1, target - y);
    }
  }

  return { x, y, width, height };
}

/**
 * Snap a scaled signature stamp by aligning its right edge, then recomputing the
 * height from the original aspect ratio so the stamp never distorts. The origin
 * (bottom-left) is the scale anchor and stays put.
 */
export function snapScaledStamp(scaled: Box, others: readonly Box[]): Box {
  const ratio = scaled.height / scaled.width;
  const right = scaled.x + scaled.width;
  const target = snapTarget(right, xEdges(others));
  if (target === null) {
    return scaled;
  }
  const width = Math.max(1, target - scaled.x);
  return { ...scaled, width, height: width * ratio };
}
