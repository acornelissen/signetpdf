import { modelToScreen, screenToModel, type Viewport } from "../model/coords";
import type { PageGeometry, SignatureStamp, TextBox } from "../model/document";
import {
  screenPoint,
  userSpacePoint,
  type ScreenPoint,
  type UserSpacePoint,
} from "../model/geometry";

// Pure geometry for placing and dragging annotations (text boxes and signature
// stamps). Placement and every drag (move, resize, scale) go through the one
// coordinate seam, so they stay correct at any scale and rotation. Each
// transform returns a NEW annotation; the caller commits via updateAnnotation.

/** Smallest box the user can shrink to, in user-space units. */
const MIN_SIZE = 8;

/** A box's CSS rectangle within a page overlay (pixels, top-left origin). */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Convert a user-space rectangle (origin + size) to its CSS box on screen by
 * running two opposite corners through the seam and taking their bounding box,
 * so it lines up with the rendered page at any scale and rotation. Shared by
 * every annotation overlay (text boxes, signature stamps).
 */
export function annotationScreenRect(
  origin: UserSpacePoint,
  width: number,
  height: number,
  page: PageGeometry,
  viewport: Viewport,
): ScreenRect {
  const corner1 = modelToScreen(origin, page, viewport);
  const corner2 = modelToScreen(
    userSpacePoint(origin.x + width, origin.y + height),
    page,
    viewport,
  );
  return {
    left: Math.min(corner1.x, corner2.x),
    top: Math.min(corner1.y, corner2.y),
    width: Math.abs(corner1.x - corner2.x),
    height: Math.abs(corner1.y - corner2.y),
  };
}

/** The CSS box for a text box (see annotationScreenRect). */
export function textBoxScreenRect(
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
): ScreenRect {
  return annotationScreenRect(box.origin, box.width, box.height, page, viewport);
}

/** The user-space vector covered by a screen drag from `from` to `to`. */
function userSpaceDelta(
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): { dx: number; dy: number } {
  // screenToModel is affine, so the translation cancels in the difference and
  // only scale/rotation remain — exactly the delta we want.
  const before = screenToModel(from, page, viewport);
  const after = screenToModel(to, page, viewport);
  return { dx: after.x - before.x, dy: after.y - before.y };
}

/** Move a text box by a screen drag, shifting its origin in user space. */
export function moveTextBox(
  box: TextBox,
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): TextBox {
  const { dx, dy } = userSpaceDelta(from, to, page, viewport);
  return { ...box, origin: userSpacePoint(box.origin.x + dx, box.origin.y + dy) };
}

/**
 * Resize a text box by dragging its bottom-right handle. The opposite (top-left)
 * corner stays anchored; both corners are taken back to user space through the
 * seam and the new box is their bounding box, so resize is correct under
 * rotation too. The box clamps to a minimum size.
 */
export function resizeTextBox(
  box: TextBox,
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): TextBox {
  const rect = textBoxScreenRect(box, page, viewport);
  const anchor = screenToModel(screenPoint(rect.left, rect.top), page, viewport);
  const handle = screenToModel(
    screenPoint(rect.left + rect.width + (to.x - from.x), rect.top + rect.height + (to.y - from.y)),
    page,
    viewport,
  );
  const width = Math.max(MIN_SIZE, Math.abs(anchor.x - handle.x));
  const height = Math.max(MIN_SIZE, Math.abs(anchor.y - handle.y));
  return {
    ...box,
    origin: userSpacePoint(Math.min(anchor.x, handle.x), Math.min(anchor.y, handle.y)),
    width,
    height,
  };
}

/** A keyboard nudge resolved to a move (screen pixels) or resize (user points). */
export type Nudge =
  | { kind: "move"; dxScreen: number; dyScreen: number }
  | { kind: "resize"; dw: number; dh: number };

/** The arrow keys, as screen-space unit directions (y grows downward). */
const ARROW_DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Map an arrow keypress to a nudge: a 1pt step (10pt with Shift) that moves the
 * annotation, or resizes it when Alt is held. Move is returned in screen pixels
 * (scaled) so it can flow through the drag seam; resize is in user-space points.
 * Returns null for any non-arrow key.
 */
export function nudgeFromKey(
  event: { key: string; shiftKey: boolean; altKey: boolean },
  scale: number,
): Nudge | null {
  const direction = ARROW_DIRECTIONS[event.key];
  if (!direction) {
    return null;
  }
  const step = event.shiftKey ? 10 : 1;
  const [x, y] = direction;
  if (event.altKey) {
    return { kind: "resize", dw: x * step, dh: y * step };
  }
  return { kind: "move", dxScreen: x * step * scale, dyScreen: y * step * scale };
}

/**
 * Resize a text box by fixed user-space deltas (keyboard nudge), anchored at the
 * origin and clamped to the minimum size. Rotation-independent: width and height
 * are the box's own user-space dimensions.
 */
export function growTextBox(box: TextBox, dw: number, dh: number): TextBox {
  return {
    ...box,
    width: Math.max(MIN_SIZE, box.width + dw),
    height: Math.max(MIN_SIZE, box.height + dh),
  };
}

/**
 * Resize a signature stamp by a fixed user-space width delta (keyboard nudge),
 * preserving aspect ratio and clamping to the minimum width.
 */
export function growStamp(stamp: SignatureStamp, dw: number): SignatureStamp {
  const width = Math.max(MIN_SIZE, stamp.width + dw);
  const factor = width / stamp.width;
  return { ...stamp, width, height: stamp.height * factor };
}

/** Move a signature stamp by a screen drag, shifting its origin in user space. */
export function moveStamp(
  stamp: SignatureStamp,
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): SignatureStamp {
  const { dx, dy } = userSpaceDelta(from, to, page, viewport);
  return { ...stamp, origin: userSpacePoint(stamp.origin.x + dx, stamp.origin.y + dy) };
}

/**
 * Scale a signature stamp by dragging its bottom-right handle, preserving aspect
 * ratio. The horizontal drag (in user space, via the seam) drives a uniform
 * scale factor applied to both width and height; the origin (bottom-left) stays
 * anchored. Clamps to a minimum width.
 */
export function scaleStamp(
  stamp: SignatureStamp,
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): SignatureStamp {
  const { dx } = userSpaceDelta(from, to, page, viewport);
  const width = Math.max(MIN_SIZE, stamp.width + dx);
  const factor = width / stamp.width;
  return { ...stamp, width, height: stamp.height * factor };
}
