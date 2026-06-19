import { describe, expect, it } from "vitest";
import { createModel } from "../model/document";
import type { PageGeometry } from "../model/document";
import { screenPoint } from "../model/geometry";
import { createShapeFromDrag } from "./shape";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

describe("createShapeFromDrag", () => {
  it("maps the drag's start and end to user space through the seam", () => {
    // Screen y maps to user y = 792 - screenY at scale 1, rotation 0.
    const model = createShapeFromDrag(
      createModel(new Uint8Array([0x25])),
      "rectangle",
      "#cc0000",
      2,
      null,
      screenPoint(72, 92),
      screenPoint(200, 152),
      page,
      viewport,
    );
    const added = model.annotations[0];
    expect(added?.kind).toBe("shape");
    if (added?.kind !== "shape") {
      throw new Error("expected a shape");
    }
    expect(added.shape).toBe("rectangle");
    expect(added.start.x).toBeCloseTo(72, 5);
    expect(added.start.y).toBeCloseTo(700, 5);
    expect(added.end.x).toBeCloseTo(200, 5);
    expect(added.end.y).toBeCloseTo(640, 5);
    expect(added.stroke).toBe("#cc0000");
    expect(added.strokeWidth).toBe(2);
    expect(added.fill).toBeNull();
    expect(model.dirty).toBe(true);
  });

  it("preserves drag direction for a line (start and end are not reordered)", () => {
    const model = createShapeFromDrag(
      createModel(new Uint8Array([0x25])),
      "line",
      "#000000",
      1,
      null,
      screenPoint(200, 152),
      screenPoint(72, 92),
      page,
      viewport,
    );
    const added = model.annotations[0];
    if (added?.kind !== "shape") {
      throw new Error("expected a shape");
    }
    expect(added.start.x).toBeCloseTo(200, 5);
    expect(added.end.x).toBeCloseTo(72, 5);
  });

  it("carries a fill colour when given", () => {
    const model = createShapeFromDrag(
      createModel(new Uint8Array([0x25])),
      "ellipse",
      "#000000",
      1,
      "#ffff00",
      screenPoint(10, 10),
      screenPoint(60, 60),
      page,
      viewport,
    );
    const added = model.annotations[0];
    if (added?.kind !== "shape") {
      throw new Error("expected a shape");
    }
    expect(added.fill).toBe("#ffff00");
  });
});
