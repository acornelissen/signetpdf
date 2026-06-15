// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { PageGeometry, SignatureStamp } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { bindStampDelete, bindStampDrag, bindStampScale, buildStampControl } from "./overlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

function stamp(overrides: Partial<SignatureStamp> = {}): SignatureStamp {
  return {
    kind: "signature",
    id: "s1",
    page: 0,
    origin: userSpacePoint(72, 700),
    width: 150,
    height: 75,
    pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    ...overrides,
  };
}

describe("buildStampControl (DOM)", () => {
  it("renders a positioned image carrying the annotation id", () => {
    const container = buildStampControl(stamp(), page, viewport);
    const img = container.querySelector("img");
    expect(container.dataset.annotationId).toBe("s1");
    expect(container.style.left).toMatch(/px$/);
    expect(container.style.width).toMatch(/px$/);
    expect(img?.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  });

  it("is keyboard-focusable with an accessible group role and name", () => {
    const container = buildStampControl(stamp(), page, viewport);
    expect(container.getAttribute("tabindex")).toBe("0");
    expect(container.getAttribute("role")).toBe("group");
    expect(container.getAttribute("aria-label")).toBe("Signature annotation");
  });
});

function pointer(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, buttons: 1 });
}

describe("stamp move", () => {
  it("commits the new origin after dragging the grip", () => {
    const original = stamp();
    const container = buildStampControl(original, page, viewport);
    const moves: SignatureStamp[] = [];
    bindStampDrag(container, original, page, viewport, (updated) => moves.push(updated));

    container
      .querySelector<HTMLElement>(".stamp-grip")
      ?.dispatchEvent(pointer("pointerdown", 10, 10));
    window.dispatchEvent(pointer("pointermove", 110, 50));
    window.dispatchEvent(pointer("pointerup", 110, 50));

    expect(moves).toHaveLength(1);
    expect(moves[0]?.origin.x).toBeCloseTo(172); // +100 at scale 1
    expect(moves[0]?.origin.y).toBeCloseTo(660); // -40 (y inverts)
  });
});

describe("stamp scale", () => {
  it("commits an aspect-preserved size after dragging the resize handle", () => {
    const original = stamp(); // 150 x 75, ratio 2
    const container = buildStampControl(original, page, viewport);
    const scales: SignatureStamp[] = [];
    bindStampScale(container, original, page, viewport, (updated) => scales.push(updated));

    container
      .querySelector<HTMLElement>(".stamp-resize")
      ?.dispatchEvent(pointer("pointerdown", 222, 92));
    window.dispatchEvent(pointer("pointermove", 252, 92)); // +30 wide at scale 1
    window.dispatchEvent(pointer("pointerup", 252, 92));

    expect(scales).toHaveLength(1);
    expect(scales[0]?.width).toBeCloseTo(180);
    expect(scales[0]?.height).toBeCloseTo(90);
  });
});

describe("stamp delete", () => {
  it("removes exactly the selected stamp when its delete button is clicked", () => {
    const original = stamp({ id: "keep-me" });
    const container = buildStampControl(original, page, viewport);
    const deleted: string[] = [];
    bindStampDelete(container, original, (id) => deleted.push(id));

    container.querySelector<HTMLButtonElement>(".stamp-delete")?.click();

    expect(deleted).toEqual(["keep-me"]);
  });

  it("deletes via the Delete key when the stamp is focused", () => {
    const original = stamp({ id: "by-key" });
    const container = buildStampControl(original, page, viewport);
    const deleted: string[] = [];
    bindStampDelete(container, original, (id) => deleted.push(id));

    container.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));

    expect(deleted).toEqual(["by-key"]);
  });
});
