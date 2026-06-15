import { modelToScreen, type Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { screenPoint, userSpacePoint } from "../model/geometry";
import { moveTextBox } from "./transform";

// The text-annotation overlay: a positioned, editable HTML layer drawn over the
// rendered page. Like the form overlay it holds no state of its own — the box is
// placed through the one coordinate seam and every edit, move, resize (m3-4) and
// delete (m3-5) routes back to the model (invariant 1).
//
// Each box is a container holding a move grip and an inner textarea. The grip is
// the drag target so moving never fights text selection inside the textarea.

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

/** The inner editable textarea of a text-box container. */
export function textBoxInput(container: HTMLElement): HTMLTextAreaElement {
  const input = container.querySelector<HTMLTextAreaElement>(".text-box-input");
  if (!input) {
    throw new Error("text box container is missing its input");
  }
  return input;
}

/**
 * Build the control for a text box: a positioned container with a move grip and
 * an editable textarea. The font size is scaled by the viewport so on-screen
 * text tracks the rendered page; the value comes from the model. Binding happens
 * in bindTextBoxControl (edit) and bindTextBoxDrag (move).
 */
export function buildTextBoxControl(
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "text-box";
  container.dataset.annotationId = box.id;
  position(container, textBoxScreenRect(box, page, viewport));

  const grip = document.createElement("div");
  grip.className = "text-box-grip";
  grip.setAttribute("aria-hidden", "true");
  container.appendChild(grip);

  const input = document.createElement("textarea");
  input.className = "text-box-input";
  input.value = box.text;
  input.setAttribute("aria-label", "Text annotation");
  input.style.fontSize = `${box.fontSize * viewport.scale}px`;
  container.appendChild(input);

  return container;
}

/**
 * Wire a text box's edits to the model. The edit commits on blur or Enter (only
 * when the text actually changed); Escape reverts the control and commits
 * nothing, so the model stays the single source of truth.
 */
export function bindTextBoxControl(
  container: HTMLElement,
  box: TextBox,
  onCommit: (updated: TextBox) => void,
): void {
  const input = textBoxInput(container);
  let cancelled = false;

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled = true;
      input.value = box.text;
      input.blur();
    }
  });

  input.addEventListener("blur", () => {
    if (cancelled) {
      cancelled = false;
      return;
    }
    if (input.value !== box.text) {
      onCommit({ ...box, text: input.value });
    }
  });
}

/**
 * Wire the move grip so dragging it repositions the box. The container follows
 * the pointer for live feedback; the committed move (origin in user space) is
 * computed through the seam and pushed to the model once on pointer-up.
 */
export function bindTextBoxDrag(
  container: HTMLElement,
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
  onMove: (updated: TextBox) => void,
): void {
  const grip = container.querySelector<HTMLElement>(".text-box-grip");
  if (!grip) {
    return;
  }

  grip.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = Number.parseFloat(container.style.left) || 0;
    const startTop = Number.parseFloat(container.style.top) || 0;

    const onPointerMove = (move: PointerEvent): void => {
      container.style.left = `${startLeft + (move.clientX - startX)}px`;
      container.style.top = `${startTop + (move.clientY - startY)}px`;
    };

    const onPointerUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (up.clientX === startX && up.clientY === startY) {
        return; // a click, not a drag
      }
      const from = screenPoint(startX, startY);
      const to = screenPoint(up.clientX, up.clientY);
      onMove(moveTextBox(box, from, to, page, viewport));
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}
