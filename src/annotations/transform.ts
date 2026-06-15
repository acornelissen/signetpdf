import { modelToScreen, screenToModel, type Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import {
  screenPoint,
  userSpacePoint,
  type ScreenPoint,
  type UserSpacePoint,
} from "../model/geometry";

// Pure geometry for placing and dragging text boxes. Placement and both drags
// (move m3-3, resize m3-4) go through the one coordinate seam, so they stay
// correct at any scale and rotation. Each transform returns a NEW box; the
// caller commits it through updateAnnotation.

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
