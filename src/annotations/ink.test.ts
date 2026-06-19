import { describe, expect, it } from "vitest";
import { createModel } from "../model/document";
import type { PageGeometry } from "../model/document";
import { screenPoint } from "../model/geometry";
import { createInkFromPath } from "./ink";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

describe("createInkFromPath", () => {
  it("maps the captured screen points to a user-space stroke through the seam", () => {
    // Screen y maps to user y = 792 - screenY at scale 1, rotation 0.
    const model = createInkFromPath(
      createModel(new Uint8Array([0x25])),
      [screenPoint(72, 92), screenPoint(120, 102), screenPoint(160, 82)],
      "#1144ff",
      2,
      page,
      viewport,
    );
    const added = model.annotations[0];
    expect(added?.kind).toBe("ink");
    if (added?.kind !== "ink") {
      throw new Error("expected ink");
    }
    expect(added.page).toBe(0);
    expect(added.paths).toHaveLength(1);
    expect(added.paths[0]).toHaveLength(3);
    expect(added.paths[0]?.[0]?.x).toBeCloseTo(72, 5);
    expect(added.paths[0]?.[0]?.y).toBeCloseTo(700, 5);
    expect(added.paths[0]?.[2]?.y).toBeCloseTo(710, 5);
    expect(added.color).toBe("#1144ff");
    expect(added.strokeWidth).toBe(2);
    expect(model.dirty).toBe(true);
  });
});
