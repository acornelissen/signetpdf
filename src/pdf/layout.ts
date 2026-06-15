import type { PageGeometry } from "../model/document";

/** A page's on-screen size in CSS pixels. */
export interface DisplaySize {
  readonly width: number;
  readonly height: number;
}

/**
 * The CSS size a page occupies at a given scale, accounting for /Rotate (a
 * quarter turn swaps width and height). Used to size virtualized page
 * placeholders before their canvases are rendered, so scroll height and the
 * coordinate seam stay correct whether or not a page is currently drawn.
 */
export function pageDisplaySize(page: PageGeometry, scale: number): DisplaySize {
  const quarterTurn = page.rotation === 90 || page.rotation === 270;
  return {
    width: (quarterTurn ? page.height : page.width) * scale,
    height: (quarterTurn ? page.width : page.height) * scale,
  };
}

/** How much of one page is currently inside the viewport (0..1). */
export interface PageVisibility {
  readonly index: number;
  readonly ratio: number;
}

/**
 * The page the reader is looking at: the one with the largest visible fraction.
 * Returns null when nothing is visible. Ties favour the lower page index so the
 * indicator advances only once the next page is genuinely more prominent.
 */
export function mostVisiblePage(visibilities: ReadonlyArray<PageVisibility>): number | null {
  let best: PageVisibility | null = null;
  for (const current of visibilities) {
    if (current.ratio <= 0) {
      continue;
    }
    const better =
      !best ||
      current.ratio > best.ratio ||
      (current.ratio === best.ratio && current.index < best.index);
    if (better) {
      best = current;
    }
  }
  return best ? best.index : null;
}
