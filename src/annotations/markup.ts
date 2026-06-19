import { screenToModel, type Viewport } from "../model/coords";
import {
  addAnnotation,
  type DocumentModel,
  type MarkupQuad,
  type MarkupStyle,
  type PageGeometry,
} from "../model/document";
import { screenPoint, userSpacePoint } from "../model/geometry";

// Text markup (highlight / underline / strikethrough) is anchored to selected
// glyphs, so its geometry comes from the selection's client rectangles rather
// than a click. Each line rectangle is converted to a user-space quad through
// the one coordinate seam, keeping the model in PDF user space at any scale and
// rotation. This module is pure (DOMRect is accepted only structurally) so the
// conversion is unit-tested without a browser.

/** A screen-space rectangle (CSS pixels, top-left origin). DOMRect fits this. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The page overlay's top-left in the same screen space as the rects. */
export interface PageOffset {
  readonly left: number;
  readonly top: number;
}

/**
 * Convert selection line rectangles to user-space quads. Each rect is made
 * page-relative (minus the page offset), then its two opposite corners map
 * through screenToModel; the quad's bottom-left origin and size fall out of the
 * min/max of those corners, which stays axis-aligned for every 90° rotation.
 * Degenerate (zero-area) rects are dropped.
 */
export function rectsToQuads(
  rects: readonly ScreenRect[],
  pageOffset: PageOffset,
  page: PageGeometry,
  viewport: Viewport,
): MarkupQuad[] {
  const quads: MarkupQuad[] = [];
  for (const rect of rects) {
    const topLeft = screenToModel(
      screenPoint(rect.left - pageOffset.left, rect.top - pageOffset.top),
      page,
      viewport,
    );
    const bottomRight = screenToModel(
      screenPoint(rect.right - pageOffset.left, rect.bottom - pageOffset.top),
      page,
      viewport,
    );
    const x = Math.min(topLeft.x, bottomRight.x);
    const y = Math.min(topLeft.y, bottomRight.y);
    const width = Math.abs(bottomRight.x - topLeft.x);
    const height = Math.abs(bottomRight.y - topLeft.y);
    if (width === 0 || height === 0) {
      continue;
    }
    quads.push({ origin: userSpacePoint(x, y), width, height });
  }
  return quads;
}

/**
 * Build a markup annotation from selection rects and add it through the
 * immutable mutator, returning a new, dirty model. When the selection yields no
 * usable quads the input model is returned unchanged.
 */
export function createMarkupFromRects(
  model: DocumentModel,
  style: MarkupStyle,
  color: string,
  rects: readonly ScreenRect[],
  pageOffset: PageOffset,
  page: PageGeometry,
  viewport: Viewport,
): DocumentModel {
  const quads = rectsToQuads(rects, pageOffset, page, viewport);
  if (quads.length === 0) {
    return model;
  }
  return addAnnotation(model, { kind: "markup", page: page.index, style, color, quads });
}
