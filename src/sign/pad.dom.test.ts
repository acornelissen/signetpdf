// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createSignaturePad } from "./pad";

// jsdom ships no 2D rasteriser; stub a no-op context so the pad's drawing code
// runs without jsdom's "getContext not implemented" warning.
beforeAll(() => {
  const noop = (): void => {};
  const fakeContext = {
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    strokeStyle: "",
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    clearRect: noop,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    fakeContext as unknown as CanvasRenderingContext2D,
  );
});

const TRANSPARENT_PNG =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==";

function pointer(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, buttons: 1 });
}

describe("createSignaturePad", () => {
  it("creates a canvas of the requested size, empty to start", () => {
    const pad = createSignaturePad(300, 150);
    expect(pad.element.tagName).toBe("CANVAS");
    expect(pad.element.width).toBe(300);
    expect(pad.element.height).toBe(150);
    expect(pad.isEmpty()).toBe(true);
  });

  it("is no longer empty once a stroke is drawn, and clears back to empty", () => {
    const pad = createSignaturePad(300, 150);
    pad.element.dispatchEvent(pointer("pointerdown", 10, 10));
    pad.element.dispatchEvent(pointer("pointermove", 40, 40));
    pad.element.dispatchEvent(pointer("pointerup", 40, 40));
    expect(pad.isEmpty()).toBe(false);

    pad.clear();
    expect(pad.isEmpty()).toBe(true);
  });

  it("exports a transparent PNG as bytes", () => {
    const pad = createSignaturePad(300, 150);
    // jsdom has no canvas rasteriser; stub the export source with a real PNG.
    pad.element.toDataURL = () => TRANSPARENT_PNG;

    const bytes = pad.exportPng();

    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
