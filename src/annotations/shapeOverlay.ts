import { modelToScreen, type Viewport } from "../model/coords";
import type { PageGeometry, Shape } from "../model/document";
import { screenPoint } from "../model/geometry";
import { positionElement as position } from "../overlay/position";
import { onHandleDrag } from "./drag";
import { moveShape, resizeShapeEnd } from "./move";
import { nudgeFromKey, type ScreenRect } from "./transform";

// The shape overlay: an SVG drawing of a shape over the rendered page. Like the
// other overlays it holds no state — the shape's two points are placed through
// the one coordinate seam (modelToScreen) and the only mutation, delete, routes
// back to the model (invariant 1). The SVG sits in a container at the shape's
// screen bounding box; the shape is drawn in container-local coordinates so the
// whole thing can be positioned with one box.

const SVG_NS = "http://www.w3.org/2000/svg";

/** A shape's screen geometry: its bounding box plus its two endpoints (local). */
interface ShapeScreen {
  box: ScreenRect;
  start: { x: number; y: number }; // relative to the box's top-left
  end: { x: number; y: number };
}

function shapeScreen(shape: Shape, page: PageGeometry, viewport: Viewport): ShapeScreen {
  const a = modelToScreen(shape.start, page, viewport);
  const b = modelToScreen(shape.end, page, viewport);
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    box: { left, top, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) },
    start: { x: a.x - left, y: a.y - top },
    end: { x: b.x - left, y: b.y - top },
  };
}

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

/** Draw the shape's geometry into the SVG, in container-local coordinates. */
function drawInto(root: SVGElement, shape: Shape, geo: ShapeScreen, strokeWidth: number): void {
  const common = {
    stroke: shape.stroke,
    "stroke-width": strokeWidth,
    fill: shape.fill ?? "none",
  };
  const inset = strokeWidth / 2; // keep the stroke inside the box
  if (shape.shape === "rectangle") {
    root.appendChild(
      svg("rect", {
        x: inset,
        y: inset,
        width: Math.max(0, geo.box.width - strokeWidth),
        height: Math.max(0, geo.box.height - strokeWidth),
        ...common,
      }),
    );
    return;
  }
  if (shape.shape === "ellipse") {
    root.appendChild(
      svg("ellipse", {
        cx: geo.box.width / 2,
        cy: geo.box.height / 2,
        rx: Math.max(0, geo.box.width / 2 - inset),
        ry: Math.max(0, geo.box.height / 2 - inset),
        ...common,
      }),
    );
    return;
  }
  // line or arrow: the shaft, plus an arrowhead for arrows. Lines never fill.
  const lineAttrs = {
    stroke: shape.stroke,
    "stroke-width": strokeWidth,
    "stroke-linecap": "round",
  };
  root.appendChild(
    svg("line", { x1: geo.start.x, y1: geo.start.y, x2: geo.end.x, y2: geo.end.y, ...lineAttrs }),
  );
  if (shape.shape === "arrow") {
    const angle = Math.atan2(geo.end.y - geo.start.y, geo.end.x - geo.start.x);
    const length = Math.max(6, strokeWidth * 4);
    const spread = Math.PI / 7;
    for (const a of [angle - spread, angle + spread]) {
      root.appendChild(
        svg("line", {
          x1: geo.end.x,
          y1: geo.end.y,
          x2: geo.end.x - length * Math.cos(a),
          y2: geo.end.y - length * Math.sin(a),
          ...lineAttrs,
        }),
      );
    }
  }
}

/**
 * Build the control for a shape: a container at its screen bounding box holding
 * an SVG drawing and a delete button. Stroke width is scaled by the viewport so
 * the on-screen weight tracks the rendered page.
 */
export function buildShapeControl(
  shape: Shape,
  page: PageGeometry,
  viewport: Viewport,
): HTMLElement {
  const geo = shapeScreen(shape, page, viewport);
  const strokeWidth = shape.strokeWidth * viewport.scale;

  const container = document.createElement("div");
  container.className = `shape shape-${shape.shape}`;
  container.dataset.annotationId = shape.id;
  container.dataset.annotationKind = "shape";
  // Focusable so it can be selected and moved by keyboard without a pointer.
  container.tabIndex = 0;
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", `${shape.shape} (arrow keys move)`);
  position(container, geo.box);

  const root = svg("svg", {
    width: geo.box.width,
    height: geo.box.height,
    // Let the stroke (and fill) catch clicks; the empty box does not.
    overflow: "visible",
  });
  root.setAttribute("class", "shape-svg");
  drawInto(root, shape, geo, strokeWidth);
  container.appendChild(root);

  // Two resize handles at the shape's defining points (corners for rect/ellipse,
  // endpoints for line/arrow). Dragging one moves just that point.
  for (const which of ["start", "end"] as const) {
    const point = geo[which];
    const handle = document.createElement("div");
    handle.className = "shape-handle";
    handle.dataset.end = which;
    handle.style.left = `${point.x}px`;
    handle.style.top = `${point.y}px`;
    container.appendChild(handle);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "shape-delete";
  remove.setAttribute("aria-label", `Delete ${shape.shape}`);
  remove.textContent = "×";
  container.appendChild(remove);

  return container;
}

/** Wire the delete button so clicking it removes this shape from the model. */
export function bindShapeDelete(
  container: HTMLElement,
  shape: Shape,
  onDelete: (id: string) => void,
): void {
  const button = container.querySelector<HTMLButtonElement>(".shape-delete");
  button?.addEventListener("click", () => onDelete(shape.id));
}

/**
 * Wire dragging the shape body to move it. The container follows the pointer for
 * live feedback; the committed move (both endpoints in user space) is computed
 * through the seam and pushed to the model on pointer-up.
 */
export function bindShapeDrag(
  container: HTMLElement,
  shape: Shape,
  page: PageGeometry,
  viewport: Viewport,
  onMove: (updated: Shape) => void,
): void {
  const body = container.querySelector<SVGElement>(".shape-svg");
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
      onMove(moveShape(shape, from, to, page, viewport));
    },
  );
}

/**
 * Wire keyboard move for a focused shape: arrows move it (Shift = 10pt). The
 * container repositions live and commits to the model on each step (no re-render,
 * so focus is kept); geometry stays on the seam. Alt+arrow (resize) is ignored
 * here — keyboard resize is not offered for shapes.
 */
export function bindShapeKeyboard(
  container: HTMLElement,
  shape: Shape,
  page: PageGeometry,
  viewport: Viewport,
  onChange: (updated: Shape) => void,
): void {
  let current = shape;
  container.addEventListener("keydown", (event) => {
    const nudge = nudgeFromKey(event, viewport.scale);
    if (!nudge || nudge.kind !== "move") {
      return;
    }
    event.preventDefault();
    current = moveShape(
      current,
      screenPoint(0, 0),
      screenPoint(nudge.dxScreen, nudge.dyScreen),
      page,
      viewport,
    );
    position(container, shapeScreen(current, page, viewport).box);
    onChange(current);
  });
}

/**
 * Wire the two handles so dragging one resizes the shape by moving that endpoint.
 * The committed endpoint (user space) is computed through the seam on pointer-up.
 */
export function bindShapeResize(
  container: HTMLElement,
  shape: Shape,
  page: PageGeometry,
  viewport: Viewport,
  onResize: (updated: Shape) => void,
): void {
  for (const handle of container.querySelectorAll<HTMLElement>(".shape-handle")) {
    const which = handle.dataset.end === "start" ? "start" : "end";
    let originLeft = 0;
    let originTop = 0;
    onHandleDrag(
      handle,
      () => {
        originLeft = Number.parseFloat(handle.style.left) || 0;
        originTop = Number.parseFloat(handle.style.top) || 0;
      },
      (dx, dy) => {
        handle.style.left = `${originLeft + dx}px`;
        handle.style.top = `${originTop + dy}px`;
      },
      (from, to) => {
        onResize(resizeShapeEnd(shape, which, from, to, page, viewport));
      },
    );
  }
}
