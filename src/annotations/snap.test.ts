import { describe, expect, it } from "vitest";
import { SNAP_GRID, snapMoveDelta, snapResizedBox, snapScaledStamp, type Box } from "./snap";

const box = (x: number, y: number, width: number, height: number): Box => ({
  x,
  y,
  width,
  height,
});

describe("snapMoveDelta", () => {
  it("pulls a box's edges onto the grid", () => {
    // left 13 -> 10, right 53 -> 50: both want -3, so the box shifts -3 / -3.
    const { dx, dy } = snapMoveDelta(box(13, 13, 40, 20), []);
    expect(dx).toBeCloseTo(-3);
    expect(dy).toBeCloseTo(-3);
  });

  it("leaves an already grid-aligned box untouched", () => {
    const { dx, dy } = snapMoveDelta(box(10, 10, 40, 20), []);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeCloseTo(0);
  });

  it("snaps to another annotation's edge when it is the closest line", () => {
    // left 98 sits 2 from the neighbour's left edge at 100 (closer than grid 100... tie),
    // edge wins, so the box moves +2 to align left edges.
    const neighbour = box(100, 200, 50, 50);
    const { dx } = snapMoveDelta(box(98, 0, 20, 20), [neighbour]);
    expect(dx).toBeCloseTo(2);
  });

  it("exposes the grid spacing it snaps to", () => {
    expect(SNAP_GRID).toBe(10);
  });
});

describe("snapResizedBox", () => {
  it("snaps the moved right edge, keeping the anchored left edge fixed", () => {
    const original = box(10, 10, 40, 20);
    const resized = box(10, 10, 43, 20); // right edge dragged to 53
    const snapped = snapResizedBox(original, resized, []);
    expect(snapped.x).toBeCloseTo(10);
    expect(snapped.width).toBeCloseTo(40); // right snapped 53 -> 50
  });

  it("snaps the moved left edge, keeping the anchored right edge fixed", () => {
    const original = box(10, 10, 40, 20); // right edge at 50
    const resized = box(7, 10, 43, 20); // left dragged to 7, right still 50
    const snapped = snapResizedBox(original, resized, []);
    expect(snapped.x).toBeCloseTo(10); // left snapped 7 -> 10
    expect(snapped.width).toBeCloseTo(40); // right stays at 50
  });

  it("snaps the moved top edge", () => {
    const original = box(10, 10, 40, 20); // top at 30
    const resized = box(10, 10, 40, 23); // top dragged to 33
    const snapped = snapResizedBox(original, resized, []);
    expect(snapped.y).toBeCloseTo(10);
    expect(snapped.height).toBeCloseTo(20); // top snapped 33 -> 30
  });
});

describe("snapScaledStamp", () => {
  it("snaps the right edge and preserves the aspect ratio", () => {
    const scaled = box(10, 10, 43, 21.5); // ratio 0.5, right at 53
    const snapped = snapScaledStamp(scaled, []);
    expect(snapped.width).toBeCloseTo(40); // 53 -> 50
    expect(snapped.height).toBeCloseTo(20); // ratio kept
    expect(snapped.x).toBeCloseTo(10);
    expect(snapped.y).toBeCloseTo(10);
  });
});
