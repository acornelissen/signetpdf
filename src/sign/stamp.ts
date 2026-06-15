import { screenToModel, type Viewport } from "../model/coords";
import { addAnnotation, type DocumentModel, type PageGeometry } from "../model/document";
import type { ScreenPoint } from "../model/geometry";

// Placing a signature: a page click becomes a SignatureStamp. Like the text
// tool, the click is converted to user space through the one coordinate seam and
// added through addAnnotation, so the model stays the single source of truth and
// the stamp lands where the page was rendered (at any scale and rotation).

/** The image and its size (user-space units) for a new stamp. */
export interface StampImage {
  readonly pngBytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * Create a signature stamp from a page-relative screen click. The click maps to
 * the stamp origin (bottom-left) via screenToModel; the stamp is added through
 * the immutable mutator, returning a new, dirty model.
 */
export function createSignatureStampAt(
  model: DocumentModel,
  click: ScreenPoint,
  page: PageGeometry,
  viewport: Viewport,
  image: StampImage,
): DocumentModel {
  const origin = screenToModel(click, page, viewport);
  return addAnnotation(model, {
    kind: "signature",
    page: page.index,
    origin,
    width: image.width,
    height: image.height,
    pngBytes: image.pngBytes,
  });
}
