import { modelToScreen, type Viewport } from "../model/coords";
import type { Ink, PageGeometry } from "../model/document";
import { positionElement as position } from "../overlay/position";
import type { ScreenRect } from "./transform";

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
