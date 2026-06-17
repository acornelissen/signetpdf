import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { screenPoint, userSpacePoint } from "../model/geometry";
import type { SignatureStamp } from "../model/document";
import {
  growStamp,
  growTextBox,
  moveStamp,
  moveTextBox,
  resizeTextBox,
  scaleStamp,
} from "./transform";

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

describe("resizeTextBox", () => {
  it("grows width/height by the user-space delta of the bottom-right handle drag", () => {
    const viewport: Viewport = { scale: 2 };
    // Drag the handle right 40 / down 20 at scale 2: width +20, height +10, and
    // since the top edge is the anchor, the bottom drops so origin.y falls by 10.
    const resized = resizeTextBox(
      box(),
      screenPoint(600, 584),
      screenPoint(640, 604),
      page,
      viewport,
    );

    expect(resized.width).toBeCloseTo(220);
    expect(resized.height).toBeCloseTo(34);
    expect(resized.origin.x).toBeCloseTo(100);
    expect(resized.origin.y).toBeCloseTo(490);
  });

  it("clamps to a minimum size when the handle is dragged onto the anchor", () => {
    // box() at scale 1 spans screen (100,268)-(300,292); collapse the handle
    // onto the top-left anchor and the box must not reach zero/negative size.
    const resized = resizeTextBox(box(), screenPoint(300, 292), screenPoint(100, 268), page, {
      scale: 1,
    });

    expect(resized.width).toBeGreaterThan(0);
    expect(resized.height).toBeGreaterThan(0);
    expect(resized.width).toBeLessThan(10);
    expect(resized.height).toBeLessThan(10);
  });
});

function stamp(): SignatureStamp {
  return {
    kind: "signature",
    id: "s1",
    page: 0,
    origin: userSpacePoint(100, 500),
    width: 150,
    height: 75,
    pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  };
}

describe("moveStamp", () => {
  it("shifts the origin by the user-space delta of a screen drag (scale 2)", () => {
    const original = stamp();
    const moved = moveStamp(original, screenPoint(10, 10), screenPoint(110, 50), page, {
      scale: 2,
    });

    expect(moved.origin.x).toBeCloseTo(150); // +100 screen / 2
    expect(moved.origin.y).toBeCloseTo(480); // -40 screen / 2 (y inverts)
    expect(moved.pngBytes).toBe(original.pngBytes); // image preserved
    expect(moved.width).toBe(original.width);
  });
});

describe("scaleStamp", () => {
  it("scales width and height by one factor, preserving aspect ratio", () => {
    const original = stamp();
    const ratio = original.width / original.height;
    // Drag the handle right 30 user units at scale 1: width 150 -> 180 (x1.2).
    const scaled = scaleStamp(original, screenPoint(0, 0), screenPoint(30, 0), page, { scale: 1 });

    expect(scaled.width).toBeCloseTo(180);
    expect(scaled.height).toBeCloseTo(90);
    expect(scaled.width / scaled.height).toBeCloseTo(ratio);
    expect(scaled.origin.x).toBe(original.origin.x); // origin anchored
  });

  it("clamps to a minimum width and never inverts", () => {
    const scaled = scaleStamp(stamp(), screenPoint(0, 0), screenPoint(-9999, 0), page, {
      scale: 1,
    });
    expect(scaled.width).toBeGreaterThan(0);
    expect(scaled.height).toBeGreaterThan(0);
  });
});

describe("growTextBox", () => {
  it("adds the user-space deltas to width and height", () => {
    const grown = growTextBox(box(), 30, 10);
    expect(grown.width).toBe(230);
    expect(grown.height).toBe(34);
    expect(grown.origin).toEqual(box().origin); // origin anchored
  });

  it("clamps width and height to the minimum size", () => {
    const grown = growTextBox(box(), -9999, -9999);
    expect(grown.width).toBe(8);
    expect(grown.height).toBe(8);
  });

  it("returns a new box, leaving the input untouched", () => {
    const original = box();
    const grown = growTextBox(original, 5, 5);
    expect(grown).not.toBe(original);
    expect(original.width).toBe(200);
  });
});

describe("growStamp", () => {
  it("changes width by the delta and height by the same factor", () => {
    const grown = growStamp(stamp(), 30); // 150 -> 180 (x1.2)
    expect(grown.width).toBeCloseTo(180);
    expect(grown.height).toBeCloseTo(90);
  });

  it("clamps to the minimum size without inverting", () => {
    const grown = growStamp(stamp(), -9999);
    expect(grown.width).toBe(8);
    expect(grown.height).toBeGreaterThan(0);
  });
});
