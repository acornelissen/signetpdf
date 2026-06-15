import { screenToModel, type Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { userSpacePoint, type ScreenPoint } from "../model/geometry";

// Pure geometry for dragging text boxes. Both move (m3-3) and resize (m3-4)
// convert a screen drag into a user-space delta through the one coordinate seam,
// so they stay correct at any scale and rotation. Each returns a NEW box; the
// caller commits it through updateAnnotation.

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
