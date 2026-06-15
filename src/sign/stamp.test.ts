import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import { createModel, withPages, type PageGeometry, type SignatureStamp } from "../model/document";
import { screenPoint } from "../model/geometry";
import { createSignatureStampAt } from "./stamp";

const PAGE: PageGeometry = { index: 0, width: 600, height: 800, rotation: 0 };
const VIEWPORT: Viewport = { scale: 1 };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function emptyModel() {
  return withPages(createModel(new Uint8Array()), [PAGE]);
}

describe("createSignatureStampAt", () => {
  it("places a stamp origin at the user-space coordinate of the click", () => {
    // Unrotated 600x800 at scale 1: screen (100, 200) -> user space (100, 600).
    const model = createSignatureStampAt(emptyModel(), screenPoint(100, 200), PAGE, VIEWPORT, {
      pngBytes: PNG,
      width: 150,
      height: 75,
    });

    expect(model.annotations).toHaveLength(1);
    const stamp = model.annotations[0] as SignatureStamp;
    expect(stamp.kind).toBe("signature");
    expect(stamp.page).toBe(PAGE.index);
    expect(stamp.origin.x).toBeCloseTo(100);
    expect(stamp.origin.y).toBeCloseTo(600);
    expect(stamp.width).toBe(150);
    expect(stamp.height).toBe(75);
    expect(stamp.pngBytes).toBe(PNG);
  });

  it("returns a new, dirty model and leaves the input untouched", () => {
    const before = emptyModel();
    const after = createSignatureStampAt(before, screenPoint(0, 0), PAGE, VIEWPORT, {
      pngBytes: PNG,
      width: 10,
      height: 10,
    });

    expect(after).not.toBe(before);
    expect(after.dirty).toBe(true);
    expect(before.annotations).toHaveLength(0);
  });
});
