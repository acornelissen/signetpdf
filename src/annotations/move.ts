import { screenToModel, type Viewport } from "../model/coords";
import type { Ink, PageGeometry, Shape, StickyNote } from "../model/document";
import { userSpacePoint, type ScreenPoint } from "../model/geometry";

// Move/resize geometry for the point-based annotations (shapes, sticky notes),
// the counterpart to transform.ts for box annotations. Every conversion goes
// through the one coordinate seam, so a drag is correct at any scale and
// rotation. All functions are pure and return a new annotation.

/** The user-space vector covered by a screen drag from `from` to `to`. */
function userDelta(
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

/** Move a whole shape by a screen drag, shifting both endpoints in user space. */
export function moveShape(
  shape: Shape,
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): Shape {
  const { dx, dy } = userDelta(from, to, page, viewport);
  return {
    ...shape,
    start: userSpacePoint(shape.start.x + dx, shape.start.y + dy),
    end: userSpacePoint(shape.end.x + dx, shape.end.y + dy),
  };
}

/** Resize a shape by dragging one endpoint; the other endpoint stays put. */
export function resizeShapeEnd(
  shape: Shape,
  which: "start" | "end",
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): Shape {
  const { dx, dy } = userDelta(from, to, page, viewport);
  const point = which === "start" ? shape.start : shape.end;
  const moved = userSpacePoint(point.x + dx, point.y + dy);
  return which === "start" ? { ...shape, start: moved } : { ...shape, end: moved };
}

/** Move an ink annotation by a screen drag, shifting every point in user space. */
export function moveInk(
  ink: Ink,
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): Ink {
  const { dx, dy } = userDelta(from, to, page, viewport);
  return {
    ...ink,
    paths: ink.paths.map((path) => path.map((point) => userSpacePoint(point.x + dx, point.y + dy))),
  };
}

/** Move a sticky note by a screen drag, shifting its anchor in user space. */
export function moveNote(
  note: StickyNote,
  from: ScreenPoint,
  to: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): StickyNote {
  const { dx, dy } = userDelta(from, to, page, viewport);
  return { ...note, origin: userSpacePoint(note.origin.x + dx, note.origin.y + dy) };
}
