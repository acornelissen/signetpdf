import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { screenPoint, userSpacePoint } from "../model/geometry";
import { moveTextBox } from "./transform";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };

function box(): TextBox {
  return {
    kind: "text",
    id: "t1",
    page: 0,
    origin: userSpacePoint(100, 500),
    width: 200,
    height: 24,
    text: "hi",
    fontSize: 12,
  };
}

describe("moveTextBox", () => {
  it("shifts the origin by the user-space delta of a screen drag (scale 2)", () => {
    const viewport: Viewport = { scale: 2 };
    // Dragging right 100px / down 40px at scale 2: x grows by 50, and because
    // screen y is inverted relative to user space, y drops by 20.
    const moved = moveTextBox(box(), screenPoint(10, 10), screenPoint(110, 50), page, viewport);

    expect(moved.origin.x).toBeCloseTo(150);
    expect(moved.origin.y).toBeCloseTo(480);
  });

  it("preserves identity, size and text, returning a new box", () => {
    const original = box();
    const moved = moveTextBox(original, screenPoint(0, 0), screenPoint(20, 0), page, { scale: 1 });

    expect(moved).not.toBe(original);
    expect(moved.id).toBe("t1");
    expect(moved.width).toBe(200);
    expect(moved.text).toBe("hi");
    expect(original.origin.x).toBe(100); // input untouched
  });
});
