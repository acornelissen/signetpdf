// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Ink, PageGeometry } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { bindInkDelete, buildInkControl } from "./inkOverlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

function ink(overrides: Partial<Ink> = {}): Ink {
  return {
    kind: "ink",
    id: "k1",
    page: 0,
    paths: [[userSpacePoint(72, 700), userSpacePoint(120, 690), userSpacePoint(160, 710)]],
    color: "#1144ff",
    strokeWidth: 2,
    ...overrides,
  };
}

describe("buildInkControl (DOM)", () => {
  it("carries the annotation id and kind, and is positioned in px", () => {
    const control = buildInkControl(ink(), page, viewport);
    expect(control.dataset.annotationId).toBe("k1");
    expect(control.dataset.annotationKind).toBe("ink");
    expect(control.style.left).toMatch(/px$/);
    expect(control.style.width).toMatch(/px$/);
  });

  it("renders one polyline per stroke path, in the ink colour", () => {
    const control = buildInkControl(
      ink({
        paths: [
          [userSpacePoint(72, 700), userSpacePoint(120, 690)],
          [userSpacePoint(200, 600), userSpacePoint(220, 580)],
        ],
      }),
      page,
      viewport,
    );
    const lines = control.querySelectorAll("polyline");
    expect(lines).toHaveLength(2);
    expect(lines[0]?.getAttribute("stroke")).toBe("#1144ff");
    expect(lines[0]?.getAttribute("fill")).toBe("none");
  });

  it("scales stroke width by the viewport", () => {
    const line = buildInkControl(ink({ strokeWidth: 2 }), page, { scale: 2 }).querySelector(
      "polyline",
    );
    expect(Number(line?.getAttribute("stroke-width"))).toBeCloseTo(4, 5);
  });
});

describe("bindInkDelete (DOM)", () => {
  it("calls onDelete with the ink id", () => {
    const control = buildInkControl(ink(), page, viewport);
    const onDelete = vi.fn();
    bindInkDelete(control, ink(), onDelete);
    control.querySelector<HTMLButtonElement>(".ink-delete")?.click();
    expect(onDelete).toHaveBeenCalledWith("k1");
  });
});
