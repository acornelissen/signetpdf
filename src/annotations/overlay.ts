import { modelToScreen, type Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { userSpacePoint } from "../model/geometry";

// The text-annotation overlay: a positioned, editable HTML layer drawn over the
// rendered page. Like the form overlay it holds no state of its own — the box is
// placed through the one coordinate seam and every edit routes back to the model
// (invariant 1). Move (m3-3), resize (m3-4) and delete (m3-5) build on this.

/** A box's CSS rectangle within a page overlay (pixels, top-left origin). */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Convert a text box's user-space rectangle to its CSS box on screen by running
 * two opposite corners through the seam and taking their bounding box, so it
 * lines up with the rendered page at any scale and rotation.
 */
export function textBoxScreenRect(
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
): ScreenRect {
  const corner1 = modelToScreen(userSpacePoint(box.origin.x, box.origin.y), page, viewport);
  const corner2 = modelToScreen(
    userSpacePoint(box.origin.x + box.width, box.origin.y + box.height),
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

function position(element: HTMLElement, rect: ScreenRect): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

/**
 * Build the editable control for a text box, positioned in the page overlay. The
 * font size is scaled by the viewport so on-screen text tracks the rendered page;
 * the value comes from the model. Binding to the model happens in bindTextBoxControl.
 */
export function buildTextBoxControl(
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.className = "text-box";
  textarea.dataset.annotationId = box.id;
  textarea.value = box.text;
  textarea.setAttribute("aria-label", "Text annotation");
  textarea.style.fontSize = `${box.fontSize * viewport.scale}px`;
  position(textarea, textBoxScreenRect(box, page, viewport));
  return textarea;
}

/**
 * Wire a text box control's edits to the model. The edit commits on blur or
 * Enter (only when the text actually changed); Escape reverts the control and
 * commits nothing, so the model stays the single source of truth.
 */
export function bindTextBoxControl(
  textarea: HTMLTextAreaElement,
  box: TextBox,
  onCommit: (updated: TextBox) => void,
): void {
  let cancelled = false;

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      textarea.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled = true;
      textarea.value = box.text;
      textarea.blur();
    }
  });

  textarea.addEventListener("blur", () => {
    if (cancelled) {
      cancelled = false;
      return;
    }
    if (textarea.value !== box.text) {
      onCommit({ ...box, text: textarea.value });
    }
  });
}
