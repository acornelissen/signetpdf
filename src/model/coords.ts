import type { PageGeometry } from "./document";
import { screenPoint, type ScreenPoint, type UserSpacePoint } from "./geometry";

// THE coordinate seam: the one place that converts between PDF user space
// (points, bottom-left origin, unrotated) and screen space (CSS pixels,
// top-left origin), honouring scale and page rotation (0/90/180/270).
//
// The transform replicates pdf.js's PageViewport exactly, so an overlay placed
// with modelToScreen lands on the same pixel pdf.js rendered the page content
// to. The save projection (m1-7) uses screenToModel-style maths on the pdf-lib
// side, which is why this lives in pure, framework-free code.
//
// Device pixel ratio is deliberately NOT handled here: the seam works in CSS
// pixels so overlays and the CSS-displayed canvas share one space. Crisp Retina
// rendering (canvas backing store * dpr) is a rendering concern in src/pdf.

export interface Viewport {
  readonly scale: number;
}

type Matrix = readonly [number, number, number, number, number, number];

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

/** Build the affine matrix [a, b, c, d, e, f] mapping user space to screen. */
function viewportMatrix(page: PageGeometry, viewport: Viewport): Matrix {
  const { width, height } = page;
  const scale = viewport.scale;

  // Rotation sub-matrix, matching pdf.js PageViewport.
  let ra = 1;
  let rb = 0;
  let rc = 0;
  let rd = -1;
  switch (normalizeRotation(page.rotation)) {
    case 90:
      ra = 0;
      rb = 1;
      rc = 1;
      rd = 0;
      break;
    case 180:
      ra = -1;
      rb = 0;
      rc = 0;
      rd = 1;
      break;
    case 270:
      ra = 0;
      rb = -1;
      rc = -1;
      rd = 0;
      break;
    default:
      break;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const offsetX = (ra === 0 ? centerY : centerX) * scale;
  const offsetY = (ra === 0 ? centerX : centerY) * scale;

  const a = ra * scale;
  const b = rb * scale;
  const c = rc * scale;
  const d = rd * scale;
  const e = offsetX - a * centerX - c * centerY;
  const f = offsetY - b * centerX - d * centerY;
  return [a, b, c, d, e, f];
}

/** Convert a user-space point to a screen-space point for the given page/viewport. */
export function modelToScreen(
  point: UserSpacePoint,
  page: PageGeometry,
  viewport: Viewport,
): ScreenPoint {
  const [a, b, c, d, e, f] = viewportMatrix(page, viewport);
  return screenPoint(a * point.x + c * point.y + e, b * point.x + d * point.y + f);
}
