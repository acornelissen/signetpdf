import { describe, expect, it } from "vitest";
import { dataUrlToBytes } from "./pad";

// A 1x1 fully transparent PNG, the smallest valid PNG, as a data URL.
const TRANSPARENT_PNG =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

describe("dataUrlToBytes", () => {
  it("decodes a PNG data URL to bytes beginning with the PNG signature", () => {
    const bytes = dataUrlToBytes(TRANSPARENT_PNG);

    expect(bytes.length).toBeGreaterThan(0);
    expect(Array.from(bytes.slice(0, 4))).toEqual(PNG_SIGNATURE);
  });

  it("returns empty bytes when the data URL has no payload", () => {
    expect(dataUrlToBytes("data:image/png;base64,").length).toBe(0);
  });
});
