import { describe, expect, it } from "vitest";
import type { Ink, Shape, StickyNote, PageGeometry } from "../model/document";
import { screenPoint, userSpacePoint } from "../model/geometry";
import { moveInk, moveNote, moveShape, resizeShapeEnd } from "./move";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

function shape(overrides: Partial<Shape> = {}): Shape {
  return {
    kind: "shape",
    id: "s1",
    page: 0,
    shape: "rectangle",
    start: userSpacePoint(72, 700),
    end: userSpacePoint(200, 640),
    stroke: "#cc0000",
    strokeWidth: 2,
    fill: null,
    ...overrides,
  };
}

const note: StickyNote = {
  kind: "note",
  id: "n1",
  page: 0,
  origin: userSpacePoint(100, 650),
  text: "hi",
};

describe("moveShape", () => {
  it("translates both endpoints by the drag's user-space delta", () => {
    // Screen drag (100,100) -> (110,80): dx=+10, screen-up 20 -> user +20.
    const moved = moveShape(shape(), screenPoint(100, 100), screenPoint(110, 80), page, viewport);
    expect(moved.start.x).toBeCloseTo(82, 5);
    expect(moved.start.y).toBeCloseTo(720, 5);
    expect(moved.end.x).toBeCloseTo(210, 5);
    expect(moved.end.y).toBeCloseTo(660, 5);
  });

  it("does not mutate the input shape", () => {
    const original = shape();
    moveShape(original, screenPoint(0, 0), screenPoint(10, 10), page, viewport);
    expect(original.start).toEqual(userSpacePoint(72, 700));
  });
});

describe("resizeShapeEnd", () => {
  it("moves only the dragged endpoint", () => {
    const resized = resizeShapeEnd(
      shape(),
      "end",
      screenPoint(100, 100),
      screenPoint(120, 100),
      page,
      viewport,
    );
    expect(resized.start).toEqual(userSpacePoint(72, 700)); // start unchanged
    expect(resized.end.x).toBeCloseTo(220, 5);
    expect(resized.end.y).toBeCloseTo(640, 5);
  });

  it("moves the start endpoint when asked", () => {
    const resized = resizeShapeEnd(
      shape(),
      "start",
      screenPoint(100, 100),
      screenPoint(100, 90),
      page,
      viewport,
    );
    expect(resized.end).toEqual(userSpacePoint(200, 640)); // end unchanged
    expect(resized.start.y).toBeCloseTo(710, 5);
  });
});

describe("moveInk", () => {
  const ink: Ink = {
    kind: "ink",
    id: "k1",
    page: 0,
    paths: [[userSpacePoint(72, 700), userSpacePoint(120, 690)], [userSpacePoint(200, 600)]],
    color: "#1144ff",
    strokeWidth: 2,
  };

  it("translates every point of every stroke by the drag delta", () => {
    const moved = moveInk(ink, screenPoint(100, 100), screenPoint(110, 80), page, viewport);
    expect(moved.paths[0]?.[0]).toEqual(userSpacePoint(82, 720));
    expect(moved.paths[0]?.[1]).toEqual(userSpacePoint(130, 710));
    expect(moved.paths[1]?.[0]).toEqual(userSpacePoint(210, 620));
  });
});

describe("moveNote", () => {
  it("translates the anchor by the drag's user-space delta", () => {
    const moved = moveNote(note, screenPoint(100, 100), screenPoint(90, 100), page, viewport);
    expect(moved.origin.x).toBeCloseTo(90, 5);
    expect(moved.origin.y).toBeCloseTo(650, 5);
    expect(moved.text).toBe("hi"); // unrelated fields preserved
  });
});
