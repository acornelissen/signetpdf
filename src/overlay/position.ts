// Shared placement for absolutely-positioned overlay elements (form controls,
// text boxes, signature stamps). The rectangle comes from the coordinate seam in
// screen pixels (top-left origin); this only writes it onto the element's style.
// Structurally typed so each overlay module can pass its own ScreenRect.

/** A CSS box within a page overlay (pixels, top-left origin). */
export interface OverlayRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Position an overlay element at a screen rectangle (left/top/width/height, px). */
export function positionElement(element: HTMLElement, rect: OverlayRect): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}
