// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { PageGeometry, SignatureStamp } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { bindStampDelete, buildStampControl } from "./overlay";

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
});
