import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import type { PageGeometry } from "../model/document";
import type { FormField } from "./fields";
import { fieldScreenRect } from "./overlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const field: FormField = {
  name: "text.fullName",
  kind: "text",
  page: 0,
  rect: { x: 72, y: 700, width: 240, height: 20 },
};

describe("fieldScreenRect", () => {
  it("matches the seam-converted rect at scale 2 (rotation 0)", () => {
    const viewport: Viewport = { scale: 2 };
    // user-space (72,700)-(312,720) -> screen (144,144) with size 480x40.
    expect(fieldScreenRect(field, page, viewport)).toEqual({
      left: 144,
      top: 144,
      width: 480,
      height: 40,
    });
  });

  it("produces a bounding box for a rotated page (90)", () => {
    const rotated: PageGeometry = { ...page, rotation: 90 };
    const rect = fieldScreenRect(field, rotated, { scale: 2 });
    // The 240-wide field becomes tall under a 90-degree rotation.
    expect(rect.width).toBeCloseTo(40, 6);
    expect(rect.height).toBeCloseTo(480, 6);
  });
});
