// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Markup, PageGeometry } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { bindMarkupDelete, buildMarkupControl } from "./markupOverlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

function markup(overrides: Partial<Markup> = {}): Markup {
  return {
    kind: "markup",
    id: "m1",
    page: 0,
    style: "highlight",
    color: "#ffeb3b",
    quads: [{ origin: userSpacePoint(72, 700), width: 120, height: 12 }],
    ...overrides,
  };
}

describe("buildMarkupControl (DOM)", () => {
  it("carries the annotation id and kind, and is positioned in px", () => {
    const control = buildMarkupControl(markup(), page, viewport);
    expect(control.dataset.annotationId).toBe("m1");
    expect(control.dataset.annotationKind).toBe("markup");
    expect(control.style.left).toMatch(/px$/);
    expect(control.style.top).toMatch(/px$/);
  });

  it("paints one quad element per quad, tagged with the style", () => {
    const control = buildMarkupControl(
      markup({
        quads: [
          { origin: userSpacePoint(72, 700), width: 120, height: 12 },
          { origin: userSpacePoint(72, 684), width: 90, height: 12 },
        ],
      }),
      page,
      viewport,
    );
    const quads = control.querySelectorAll(".markup-quad");
    expect(quads).toHaveLength(2);
    expect(quads[0]?.classList.contains("markup-highlight")).toBe(true);
  });

  it("exposes the colour as a CSS custom property for the paint", () => {
    const control = buildMarkupControl(markup({ color: "#00aa00" }), page, viewport);
    expect(control.style.getPropertyValue("--markup-color")).toBe("#00aa00");
  });

  it("reflects the style in the group's accessible label", () => {
    const control = buildMarkupControl(markup({ style: "strikethrough" }), page, viewport);
    expect(control.getAttribute("aria-label")?.toLowerCase()).toContain("strikethrough");
  });

  it("does not let the painted quads capture pointer events", () => {
    const control = buildMarkupControl(markup(), page, viewport);
    const quad = control.querySelector<HTMLElement>(".markup-quad");
    expect(quad?.style.pointerEvents).toBe("none");
  });
});

describe("bindMarkupDelete (DOM)", () => {
  it("calls onDelete with the markup id when the delete button is clicked", () => {
    const control = buildMarkupControl(markup(), page, viewport);
    const onDelete = vi.fn();
    bindMarkupDelete(control, markup(), onDelete);
    control.querySelector<HTMLButtonElement>(".markup-delete")?.click();
    expect(onDelete).toHaveBeenCalledWith("m1");
  });
});
