import { describe, expect, it } from "vitest";
import { createModel } from "../model/document";
import type { PageGeometry } from "../model/document";
import { createMarkupFromRects, rectsToQuads } from "./markup";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };
const pageOffset = { left: 0, top: 0 };

describe("rectsToQuads", () => {
  it("maps a selection line rect to a user-space quad through the seam", () => {
    // Screen rect (top-left origin): a 120x12 line near the top of the page.
    const rects = [{ left: 72, top: 92, right: 192, bottom: 104 }];
    const quads = rectsToQuads(rects, pageOffset, page, viewport);
    expect(quads).toHaveLength(1);
    // user y = pageHeight - screenY, so the bottom edge (screenY 104) is y=688.
    expect(quads[0]?.origin.x).toBeCloseTo(72, 5);
    expect(quads[0]?.origin.y).toBeCloseTo(688, 5);
    expect(quads[0]?.width).toBeCloseTo(120, 5);
    expect(quads[0]?.height).toBeCloseTo(12, 5);
  });

  it("subtracts the page's screen offset before converting", () => {
    const rects = [{ left: 172, top: 192, right: 292, bottom: 204 }];
    const quads = rectsToQuads(rects, { left: 100, top: 100 }, page, viewport);
    // Page-relative screen rect is identical to the previous test after offset.
    expect(quads[0]?.origin.x).toBeCloseTo(72, 5);
    expect(quads[0]?.origin.y).toBeCloseTo(688, 5);
    expect(quads[0]?.width).toBeCloseTo(120, 5);
    expect(quads[0]?.height).toBeCloseTo(12, 5);
  });

  it("produces one quad per line rect", () => {
    const rects = [
      { left: 72, top: 92, right: 192, bottom: 104 },
      { left: 72, top: 108, right: 150, bottom: 120 },
    ];
    expect(rectsToQuads(rects, pageOffset, page, viewport)).toHaveLength(2);
  });

  it("drops zero-area rects", () => {
    const rects = [{ left: 72, top: 92, right: 72, bottom: 92 }];
    expect(rectsToQuads(rects, pageOffset, page, viewport)).toHaveLength(0);
  });

  it("honours scale so quads stay in user space", () => {
    const rects = [{ left: 144, top: 184, right: 384, bottom: 208 }];
    const quads = rectsToQuads(rects, pageOffset, page, { scale: 2 });
    expect(quads[0]?.origin.x).toBeCloseTo(72, 5);
    expect(quads[0]?.width).toBeCloseTo(120, 5);
    expect(quads[0]?.height).toBeCloseTo(12, 5);
  });
});

describe("createMarkupFromRects", () => {
  const rects = [{ left: 72, top: 92, right: 192, bottom: 104 }];

  it("adds a markup annotation with the given style and colour", () => {
    const model = createMarkupFromRects(
      createModel(new Uint8Array([0x25])),
      "highlight",
      "#ffeb3b",
      rects,
      pageOffset,
      page,
      viewport,
    );
    const added = model.annotations[0];
    expect(added?.kind).toBe("markup");
    if (added?.kind !== "markup") {
      throw new Error("expected markup");
    }
    expect(added.style).toBe("highlight");
    expect(added.color).toBe("#ffeb3b");
    expect(added.page).toBe(0);
    expect(added.quads).toHaveLength(1);
    expect(model.dirty).toBe(true);
  });

  it("leaves the model untouched when there are no usable quads", () => {
    const base = createModel(new Uint8Array([0x25]));
    const model = createMarkupFromRects(
      base,
      "underline",
      "#000000",
      [{ left: 10, top: 10, right: 10, bottom: 10 }],
      pageOffset,
      page,
      viewport,
    );
    expect(model).toBe(base);
    expect(model.dirty).toBe(false);
  });
});
