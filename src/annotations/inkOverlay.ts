import { modelToScreen, type Viewport } from "../model/coords";
import type { Ink, PageGeometry } from "../model/document";
import { screenPoint } from "../model/geometry";
import { positionElement as position } from "../overlay/position";
import { onHandleDrag } from "./drag";
import { moveInk } from "./move";
import { nudgeFromKey, type ScreenRect } from "./transform";

// The freehand-ink overlay: an SVG polyline drawing over the rendered page. Like
// the other overlays it holds no state — every point is placed through the one
// coordinate seam (modelToScreen) and the only mutation, delete, routes back to
// the model (invariant 1). The SVG sits in a container at the ink's screen
// bounding box; points are drawn in container-local coordinates.

const SVG_NS = "http://www.w3.org/2000/svg";

interface ScreenPointXY {
  x: number;
  y: number;
}

/** Map every path's points to screen space and return them with their bounds. */
function inkScreen(
  ink: Ink,
  page: PageGeometry,
  viewport: Viewport,
): { box: ScreenRect; paths: ScreenPointXY[][] } {
  const paths = ink.paths.map((path) =>
    path.map((point) => {
      const s = modelToScreen(point, page, viewport);
      return { x: s.x, y: s.y };
    }),
  );
  const all = paths.flat();
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    box: { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top },
    paths: paths.map((path) => path.map((p) => ({ x: p.x - left, y: p.y - top }))),
  };
}

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

/**
 * Build the control for an ink annotation: a container at its screen bounding box
 * holding one SVG polyline per stroke and a delete button. Stroke width is scaled
 * by the viewport so the on-screen weight tracks the rendered page.
 */
export function buildInkControl(ink: Ink, page: PageGeometry, viewport: Viewport): HTMLElement {
  const geo = inkScreen(ink, page, viewport);
  const strokeWidth = ink.strokeWidth * viewport.scale;

  const container = document.createElement("div");
  container.className = "ink";
  container.dataset.annotationId = ink.id;
  container.dataset.annotationKind = "ink";
  // Focusable so the stroke can be selected and moved by keyboard.
  container.tabIndex = 0;
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", "Ink stroke (arrow keys move)");
  position(container, geo.box);

  const root = svg("svg", { width: geo.box.width, height: geo.box.height, overflow: "visible" });
  root.setAttribute("class", "ink-svg");
  for (const path of geo.paths) {
    root.appendChild(
      svg("polyline", {
        points: path.map((p) => `${p.x},${p.y}`).join(" "),
        stroke: ink.color,
        "stroke-width": strokeWidth,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        fill: "none",
      }),
    );
  }
  container.appendChild(root);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ink-delete";
  remove.setAttribute("aria-label", "Delete ink");
  remove.textContent = "×";
  container.appendChild(remove);

  return container;
}

/** Wire the delete button so clicking it removes this ink from the model. */
export function bindInkDelete(
  container: HTMLElement,
  ink: Ink,
  onDelete: (id: string) => void,
): void {
  const button = container.querySelector<HTMLButtonElement>(".ink-delete");
  button?.addEventListener("click", () => onDelete(ink.id));
}

/** Reposition the ink container at the bounding box of its (moved) points. */
function reposition(
  container: HTMLElement,
  ink: Ink,
  page: PageGeometry,
  viewport: Viewport,
): void {
  position(container, inkScreen(ink, page, viewport).box);
}

/**
 * Wire dragging the stroke to move the whole ink annotation. The container
 * follows the pointer for live feedback; the committed move (every point in user
 * space) is computed through the seam and pushed to the model on pointer-up.
 */
export function bindInkDrag(
  container: HTMLElement,
  ink: Ink,
  page: PageGeometry,
  viewport: Viewport,
  onMove: (updated: Ink) => void,
): void {
  const body = container.querySelector<SVGElement>(".ink-svg");
  if (!body) {
    return;
  }
  onHandleDrag(
    body as unknown as HTMLElement,
    () => {},
    (dx, dy) => {
      container.style.transform = `translate(${dx}px, ${dy}px)`;
    },
    (from, to) => {
      container.style.transform = "";
      onMove(moveInk(ink, from, to, page, viewport));
    },
  );
}

/**
 * Wire keyboard move for a focused ink stroke: arrows move it (Shift = 10pt). The
 * container repositions live and commits on each step (no re-render, so focus is
 * kept); geometry stays on the seam.
 */
export function bindInkKeyboard(
  container: HTMLElement,
  ink: Ink,
  page: PageGeometry,
  viewport: Viewport,
  onChange: (updated: Ink) => void,
): void {
  let current = ink;
  container.addEventListener("keydown", (event) => {
    const nudge = nudgeFromKey(event, viewport.scale);
    if (!nudge || nudge.kind !== "move") {
      return;
    }
    event.preventDefault();
    current = moveInk(
      current,
      screenPoint(0, 0),
      screenPoint(nudge.dxScreen, nudge.dyScreen),
      page,
      viewport,
    );
    reposition(container, current, page, viewport);
    onChange(current);
  });
}
