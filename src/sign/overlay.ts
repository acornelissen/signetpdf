import type { Viewport } from "../model/coords";
import type { PageGeometry, SignatureStamp } from "../model/document";
import { screenPoint } from "../model/geometry";
import { onHandleDrag } from "../annotations/drag";
import {
  annotationScreenRect,
  growStamp,
  moveStamp,
  nudgeFromKey,
  scaleStamp,
  type ScreenRect,
} from "../annotations/transform";
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
  // Keyboard-selectable with an accessible name, so it can be focused and removed
  // without a mouse (the image carries no interactive affordance of its own).
  container.tabIndex = 0;
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", "Signature annotation");
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
  // Delete/Backspace removes the focused stamp (there is no text field to guard).
  container.addEventListener("keydown", (event) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete(stamp.id);
    }
  });
}

/** Wire the move grip so dragging it repositions the stamp (origin in user space). */
export function bindStampDrag(
  container: HTMLElement,
  stamp: SignatureStamp,
  page: PageGeometry,
  viewport: Viewport,
  onMove: (updated: SignatureStamp) => void,
): void {
  const grip = container.querySelector<HTMLElement>(".stamp-grip");
  if (!grip) {
    return;
  }
  let left = 0;
  let top = 0;
  onHandleDrag(
    grip,
    () => {
      left = Number.parseFloat(container.style.left) || 0;
      top = Number.parseFloat(container.style.top) || 0;
    },
    (dx, dy) => {
      container.style.left = `${left + dx}px`;
      container.style.top = `${top + dy}px`;
    },
    (from, to) => onMove(moveStamp(stamp, from, to, page, viewport)),
  );
}

/**
 * Wire the resize handle so dragging it scales the stamp, preserving aspect
 * ratio. The container resizes live in screen pixels (keeping the image's
 * ratio); the committed size is computed through the seam on pointer-up.
 */
export function bindStampScale(
  container: HTMLElement,
  stamp: SignatureStamp,
  page: PageGeometry,
  viewport: Viewport,
  onScale: (updated: SignatureStamp) => void,
): void {
  const handle = container.querySelector<HTMLElement>(".stamp-resize");
  if (!handle) {
    return;
  }
  const ratio = stamp.height / stamp.width;
  let width = 0;
  onHandleDrag(
    handle,
    () => {
      width = Number.parseFloat(container.style.width) || 0;
    },
    (dx) => {
      const next = Math.max(1, width + dx);
      container.style.width = `${next}px`;
      container.style.height = `${next * ratio}px`;
    },
    (from, to) => onScale(scaleStamp(stamp, from, to, page, viewport)),
  );
}

/**
 * Wire keyboard move/resize for a selected (focused) stamp. Arrows move it
 * (Shift = 10pt), Alt+arrows scale it (aspect preserved). The stamp repositions
 * live and commits on each step (no re-render, so focus is kept); geometry stays
 * on the seam via the transform helpers. Ignores keys aimed at the delete button.
 */
export function bindStampKeyboard(
  container: HTMLElement,
  stamp: SignatureStamp,
  page: PageGeometry,
  viewport: Viewport,
  onChange: (updated: SignatureStamp) => void,
): void {
  let current = stamp;
  container.addEventListener("keydown", (event) => {
    if (event.target !== container) {
      return; // e.g. focus on the delete button
    }
    const nudge = nudgeFromKey(event, viewport.scale);
    if (!nudge) {
      return;
    }
    event.preventDefault();
    if (nudge.kind === "move") {
      current = moveStamp(
        current,
        screenPoint(0, 0),
        screenPoint(nudge.dxScreen, nudge.dyScreen),
        page,
        viewport,
      );
    } else {
      current = growStamp(current, nudge.dw !== 0 ? nudge.dw : nudge.dh);
    }
    position(
      container,
      annotationScreenRect(current.origin, current.width, current.height, page, viewport),
    );
    onChange(current);
  });
}
