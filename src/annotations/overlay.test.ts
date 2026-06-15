import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { textBoxScreenRect } from "./overlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };

function box(overrides: Partial<TextBox> = {}): TextBox {
  return {
    kind: "text",
    id: "t1",
    page: 0,
    origin: userSpacePoint(72, 700),
    width: 240,
    height: 20,
    text: "hi",
    fontSize: 12,
    ...overrides,
  };
}

describe("textBoxScreenRect", () => {
  it("matches the seam-converted rect at scale 2 (rotation 0)", () => {
    // user-space (72,700)-(312,720) -> screen (144,144) with size 480x40.
    expect(textBoxScreenRect(box(), page, { scale: 2 })).toEqual({
      left: 144,
      top: 144,
      width: 480,
      height: 40,
    });
  });

  it("produces a bounding box for a rotated page (90)", () => {
    const rotated: PageGeometry = { ...page, rotation: 90 };
    const rect = textBoxScreenRect(box(), rotated, { scale: 2 } as Viewport);
    expect(rect.width).toBeCloseTo(40, 6);
    expect(rect.height).toBeCloseTo(480, 6);
  });
});
