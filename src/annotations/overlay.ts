import type { Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { screenPoint } from "../model/geometry";
import { positionElement as position } from "../overlay/position";
import { onHandleDrag } from "./drag";
import {
  growTextBox,
  moveTextBox,
  nudgeFromKey,
  resizeTextBox,
  snapMovedTextBox,
  snapResizedTextBox,
  textBoxScreenRect,
  type SnapBox,
} from "./transform";

// The text-annotation overlay: a positioned, editable HTML layer drawn over the
// rendered page. Like the form overlay it holds no state of its own — the box is
// placed through the one coordinate seam (textBoxScreenRect) and every edit,
// move, resize and delete (m3-5) routes back to the model (invariant 1).
//
// Each box is a container holding a move grip, an inner textarea and a resize
// handle. The grip and handle are the drag targets so dragging never fights text
// selection inside the textarea.

// Re-exported so callers and tests have one import site for the overlay surface.
export { textBoxScreenRect, type ScreenRect } from "./transform";

/** The inner editable textarea of a text-box container. */
export function textBoxInput(container: HTMLElement): HTMLTextAreaElement {
  const input = container.querySelector<HTMLTextAreaElement>(".text-box-input");
  if (!input) {
    throw new Error("text box container is missing its input");
  }
  return input;
}

// On screen we approximate each family with a generic CSS family; the saved PDF
// embeds the real Noto face (see embedTextFonts).
const FAMILY_CSS: Record<TextBox["family"], string> = {
  sans: "sans-serif",
  serif: "serif",
  mono: "monospace",
};

/** Apply a box's formatting to its textarea (size scaled by the viewport). */
export function applyTextBoxStyle(
  input: HTMLTextAreaElement,
  box: TextBox,
  viewport: Viewport,
): void {
  input.style.fontSize = `${box.fontSize * viewport.scale}px`;
  input.style.fontWeight = box.bold ? "700" : "400";
  input.style.fontStyle = box.italic ? "italic" : "normal";
  input.style.color = box.color;
  input.style.textAlign = box.align;
  input.style.fontFamily = FAMILY_CSS[box.family];
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
  // Focusable as a whole so it can be selected (then moved/resized by keyboard)
  // without entering the textarea; Enter or a click drops into editing.
  container.tabIndex = 0;
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", "Text annotation (arrow keys move, Alt+arrows resize)");
  position(container, textBoxScreenRect(box, page, viewport));

  const grip = document.createElement("div");
  grip.className = "text-box-grip";
  grip.setAttribute("aria-hidden", "true");
  container.appendChild(grip);

  const input = document.createElement("textarea");
  input.className = "text-box-input";
  input.value = box.text;
  input.setAttribute("aria-label", "Text annotation");
  applyTextBoxStyle(input, box, viewport);
  container.appendChild(input);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "text-box-delete";
  remove.setAttribute("aria-label", "Delete text annotation");
  remove.textContent = "×"; // ×
  container.appendChild(remove);

  const handle = document.createElement("div");
  handle.className = "text-box-resize";
  handle.setAttribute("aria-hidden", "true");
  container.appendChild(handle);

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
      container.focus(); // revert and step back to the selected (not editing) state
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
 * Wire keyboard move/resize for a selected (focused, not editing) box. Arrows
 * move it (Shift = 10pt), Alt+arrows resize it, Enter drops into editing. The
 * box repositions live and commits to the model on each step (no re-render, so
 * focus is kept); geometry stays on the seam via the transform helpers. Keys are
 * ignored while the textarea is focused, so editing keeps native caret movement.
 */
export function bindTextBoxKeyboard(
  container: HTMLElement,
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
  onChange: (updated: TextBox) => void,
): void {
  let current = box;
  container.addEventListener("keydown", (event) => {
    if (event.target !== container) {
      return; // editing: leave keys to the textarea
    }
    if (event.key === "Enter") {
      event.preventDefault();
      textBoxInput(container).focus();
      return;
    }
    const nudge = nudgeFromKey(event, viewport.scale);
    if (!nudge) {
      return;
    }
    event.preventDefault();
    current =
      nudge.kind === "move"
        ? moveTextBox(
            current,
            screenPoint(0, 0),
            screenPoint(nudge.dxScreen, nudge.dyScreen),
            page,
            viewport,
          )
        : growTextBox(current, nudge.dw, nudge.dh);
    position(container, textBoxScreenRect(current, page, viewport));
    onChange(current);
  });
}

/**
 * Wire the delete button so clicking it removes this box from the model. The
 * caller commits with removeAnnotation, keeping the model the single source of
 * truth.
 */
export function bindTextBoxDelete(
  container: HTMLElement,
  box: TextBox,
  onDelete: (id: string) => void,
): void {
  const button = container.querySelector<HTMLButtonElement>(".text-box-delete");
  button?.addEventListener("click", () => onDelete(box.id));
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
  siblings?: readonly SnapBox[],
): void {
  const grip = container.querySelector<HTMLElement>(".text-box-grip");
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
    (from, to, event) => {
      let moved = moveTextBox(box, from, to, page, viewport);
      // Snap to the grid/neighbours unless the user holds Alt for fine control.
      if (siblings && !event.altKey) {
        moved = snapMovedTextBox(moved, siblings);
      }
      onMove(moved);
    },
  );
}

/**
 * Wire the resize handle so dragging it grows or shrinks the box. The container
 * resizes live in screen pixels; the committed size (user space, rotation-aware)
 * is computed through the seam and pushed to the model on pointer-up.
 */
export function bindTextBoxResize(
  container: HTMLElement,
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
  onResize: (updated: TextBox) => void,
  siblings?: readonly SnapBox[],
): void {
  const handle = container.querySelector<HTMLElement>(".text-box-resize");
  if (!handle) {
    return;
  }
  let width = 0;
  let height = 0;
  onHandleDrag(
    handle,
    () => {
      width = Number.parseFloat(container.style.width) || 0;
      height = Number.parseFloat(container.style.height) || 0;
    },
    (dx, dy) => {
      container.style.width = `${Math.max(1, width + dx)}px`;
      container.style.height = `${Math.max(1, height + dy)}px`;
    },
    (from, to, event) => {
      const resized = resizeTextBox(box, from, to, page, viewport);
      onResize(siblings && !event.altKey ? snapResizedTextBox(box, resized, siblings) : resized);
    },
  );
}
