import { screenToModel, type Viewport } from "../model/coords";
import {
  addAnnotation,
  type DocumentModel,
  type PageGeometry,
  type ShapeKind,
} from "../model/document";
import type { ScreenPoint } from "../model/geometry";

// The shape tool. A drag on a page becomes a shape: both ends of the drag are
// converted to user space through the one coordinate seam and added through
// addAnnotation, so the model stays the single source of truth and the shape
// lands where the page was rendered (at any scale and rotation). Drag direction
// is preserved (start -> end), which an arrow's head depends on.

/**
 * Create a shape from a page-relative screen drag. The start and end map to user
 * space via screenToModel; the shape is added through the immutable mutator,
 * returning a new, dirty model.
 */
export function createShapeFromDrag(
  model: DocumentModel,
  shape: ShapeKind,
  stroke: string,
  strokeWidth: number,
  fill: string | null,
  startClick: ScreenPoint,
  endClick: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): DocumentModel {
  const start = screenToModel(startClick, page, viewport);
  const end = screenToModel(endClick, page, viewport);
  return addAnnotation(model, {
    kind: "shape",
    page: page.index,
    shape,
    start,
    end,
    stroke,
    strokeWidth,
    fill,
  });
}
