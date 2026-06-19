import type { Viewport } from "../model/coords";
import type { Markup, MarkupStyle, PageGeometry } from "../model/document";
import { positionElement as position } from "../overlay/position";
import { annotationScreenRect, type ScreenRect } from "./transform";

// The text-markup overlay: a positioned, non-interactive paint of a markup's
// quads over the rendered page. Like the other overlays it holds no state — the
// quads are placed through the one coordinate seam (annotationScreenRect) and the
// only mutation, delete, routes back to the model (invariant 1).
//
// A markup can span several lines, so the control is a container at the union
// bounding box of its quads with one painted child per quad. The paint is
// pointer-events:none so text underneath stays selectable; only the delete
// button (revealed on hover/focus) takes pointer/keyboard events.

const STYLE_LABEL: Record<MarkupStyle, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikethrough: "Strikethrough",
};

/** The union bounding box (screen px) of every quad's rect. */
function unionRect(rects: readonly ScreenRect[]): ScreenRect {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Build the control for a markup: a container positioned at its quads' union box
 * with one painted quad div each (positioned relative to the container) and a
 * delete button. The colour is exposed as a CSS custom property so the stylesheet
 * decides how each style renders (translucent fill, underline rule, strike rule).
 */
export function buildMarkupControl(
  markup: Markup,
  page: PageGeometry,
  viewport: Viewport,
): HTMLElement {
  const rects = markup.quads.map((quad) =>
    annotationScreenRect(quad.origin, quad.width, quad.height, page, viewport),
  );
  const box = unionRect(rects);

  const container = document.createElement("div");
  container.className = `markup markup-${markup.style}`;
  container.dataset.annotationId = markup.id;
  container.dataset.annotationKind = "markup";
  container.style.setProperty("--markup-color", markup.color);
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", `${STYLE_LABEL[markup.style]} annotation`);
  position(container, box);

  for (const rect of rects) {
    const quad = document.createElement("div");
    quad.className = `markup-quad markup-${markup.style}`;
    quad.style.pointerEvents = "none";
    // Position relative to the container's top-left so the union box can move as one.
    position(quad, {
      left: rect.left - box.left,
      top: rect.top - box.top,
      width: rect.width,
      height: rect.height,
    });
    container.appendChild(quad);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "markup-delete";
  remove.setAttribute("aria-label", `Delete ${STYLE_LABEL[markup.style].toLowerCase()} annotation`);
  remove.textContent = "×";
  container.appendChild(remove);

  return container;
}

/** Wire the delete button so clicking it removes this markup from the model. */
export function bindMarkupDelete(
  container: HTMLElement,
  markup: Markup,
  onDelete: (id: string) => void,
): void {
  const button = container.querySelector<HTMLButtonElement>(".markup-delete");
  button?.addEventListener("click", () => onDelete(markup.id));
}
