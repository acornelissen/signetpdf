import { screenToModel, type Viewport } from "../model/coords";
import { addAnnotation, type DocumentModel, type PageGeometry } from "../model/document";
import type { ScreenPoint } from "../model/geometry";

// The freehand-ink tool. A pointer drag captures a stroke as a list of screen
// points; each is converted to user space through the one coordinate seam and
// the stroke is added through addAnnotation, so the model stays the single
// source of truth and the ink lands where the page was rendered (at any scale
// and rotation).

/**
 * Create an ink annotation from a captured screen stroke. Each point maps to user
 * space via screenToModel; the stroke is added as a single path through the
 * immutable mutator, returning a new, dirty model.
 */
export function createInkFromPath(
  model: DocumentModel,
  points: readonly ScreenPoint[],
  color: string,
  strokeWidth: number,
  page: PageGeometry,
  viewport: Viewport,
): DocumentModel {
  const path = points.map((point) => screenToModel(point, page, viewport));
  return addAnnotation(model, { kind: "ink", page: page.index, paths: [path], color, strokeWidth });
}
