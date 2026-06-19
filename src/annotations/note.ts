import { screenToModel, type Viewport } from "../model/coords";
import { addAnnotation, type DocumentModel, type PageGeometry } from "../model/document";
import type { ScreenPoint } from "../model/geometry";

// The sticky-note tool. A click on a page becomes an empty note anchored at that
// point: the click is converted to user space through the one coordinate seam
// and added through addAnnotation, so the model stays the single source of truth
// and the pin lands where the page was rendered (at any scale and rotation). The
// comment is filled in afterwards via the note's popup.

/**
 * Create an empty sticky note anchored at a page-relative screen click. The click
 * maps to the anchor via screenToModel; the note is added through the immutable
 * mutator, returning a new, dirty model.
 */
export function createNoteAt(
  model: DocumentModel,
  click: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
): DocumentModel {
  const origin = screenToModel(click, page, viewport);
  return addAnnotation(model, { kind: "note", page: page.index, origin, text: "" });
}
