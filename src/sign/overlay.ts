import type { Viewport } from "../model/coords";
import type { PageGeometry, SignatureStamp } from "../model/document";
import { annotationScreenRect, type ScreenRect } from "../annotations/transform";
import { pngBytesToDataUrl } from "./pad";

// The signature-stamp overlay: a positioned image drawn over the rendered page.
// Like the text overlay it holds no state of its own — placed through the one
// coordinate seam (annotationScreenRect) and every move, scale (m4-4) and delete
// routes back to the model. The container carries a move grip, resize handle and
// delete button so the chrome matches the text boxes.

function position(element: HTMLElement, rect: ScreenRect): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

/**
 * Build the control for a signature stamp: a positioned container showing the
 * PNG as an image, with a move grip, resize handle and delete button. The image
 * comes from the model bytes; binding happens in bindStamp* functions.
 */
export function buildStampControl(
  stamp: SignatureStamp,
  page: PageGeometry,
  viewport: Viewport,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "stamp";
  container.dataset.annotationId = stamp.id;
  position(
    container,
    annotationScreenRect(stamp.origin, stamp.width, stamp.height, page, viewport),
  );

  const grip = document.createElement("div");
  grip.className = "stamp-grip";
  grip.setAttribute("aria-hidden", "true");
  container.appendChild(grip);

  const img = document.createElement("img");
  img.className = "stamp-image";
  img.src = pngBytesToDataUrl(stamp.pngBytes);
  img.alt = "Signature";
  img.draggable = false;
  container.appendChild(img);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "stamp-delete";
  remove.setAttribute("aria-label", "Delete signature");
  remove.textContent = "×"; // ×
  container.appendChild(remove);

  const handle = document.createElement("div");
  handle.className = "stamp-resize";
  handle.setAttribute("aria-hidden", "true");
  container.appendChild(handle);

  return container;
}

/**
 * Wire the delete button so clicking it removes this stamp from the model. The
 * caller commits with removeAnnotation, keeping the model the single source of
 * truth.
 */
export function bindStampDelete(
  container: HTMLElement,
  stamp: SignatureStamp,
  onDelete: (id: string) => void,
): void {
  const button = container.querySelector<HTMLButtonElement>(".stamp-delete");
  button?.addEventListener("click", () => onDelete(stamp.id));
}
