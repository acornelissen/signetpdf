import { describe, expect, it } from "vitest";
import { createModel } from "../model/document";
import type { PageGeometry } from "../model/document";
import { screenPoint } from "../model/geometry";
import { createNoteAt } from "./note";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

describe("createNoteAt", () => {
  it("anchors a new empty note at the click, mapped through the seam", () => {
    // Screen y 92 maps to user y = 792 - 92 = 700 at scale 1, rotation 0.
    const model = createNoteAt(
      createModel(new Uint8Array([0x25])),
      screenPoint(100, 92),
      page,
      viewport,
    );
    const added = model.annotations[0];
    expect(added?.kind).toBe("note");
    if (added?.kind !== "note") {
      throw new Error("expected a note");
    }
    expect(added.page).toBe(0);
    expect(added.origin.x).toBeCloseTo(100, 5);
    expect(added.origin.y).toBeCloseTo(700, 5);
    expect(added.text).toBe("");
    expect(model.dirty).toBe(true);
  });
});
