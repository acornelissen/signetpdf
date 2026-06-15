import { describe, expect, it } from "vitest";
import {
  clampScale,
  fitToWidthScale,
  MAX_SCALE,
  MIN_SCALE,
  stepZoom,
  zoomByDelta,
  ZOOM_LEVELS,
} from "./zoom";

describe("clampScale", () => {
  it("keeps a scale within bounds untouched", () => {
    expect(clampScale(1.25)).toBe(1.25);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
  });
});

describe("fitToWidthScale", () => {
  it("scales the page to fill the available width", () => {
    expect(fitToWidthScale(600, 900)).toBe(1.5);
  });

  it("clamps the computed scale to the allowed range", () => {
    expect(fitToWidthScale(600, 6000)).toBe(MAX_SCALE);
    expect(fitToWidthScale(600, 30)).toBe(MIN_SCALE);
  });

  it("falls back to 1 for a non-positive page width", () => {
    expect(fitToWidthScale(0, 900)).toBe(1);
  });
});

describe("stepZoom", () => {
  it("steps up and down the preset ladder from a rung", () => {
    expect(stepZoom(1, "in")).toBe(1.25);
    expect(stepZoom(1, "out")).toBe(0.75);
  });

  it("snaps an off-ladder scale to the next rung in each direction", () => {
    // Fit-width can leave a scale like 1.13 between 1 and 1.25.
    expect(stepZoom(1.13, "in")).toBe(1.25);
    expect(stepZoom(1.13, "out")).toBe(1);
  });

  it("holds at the ends of the ladder", () => {
    // The ladder ends equal the clamp bounds (asserted below).
    expect(stepZoom(MIN_SCALE, "out")).toBe(MIN_SCALE);
    expect(stepZoom(MAX_SCALE, "in")).toBe(MAX_SCALE);
  });

  it("ladder rungs are the documented scales and within bounds", () => {
    expect(ZOOM_LEVELS).toContain(1);
    expect(ZOOM_LEVELS[0]).toBe(MIN_SCALE);
    expect(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]).toBe(MAX_SCALE);
  });
});

describe("zoomByDelta", () => {
  it("zooms in for a negative delta and out for a positive one", () => {
    expect(zoomByDelta(1, -100)).toBeGreaterThan(1);
    expect(zoomByDelta(1, 100)).toBeLessThan(1);
  });

  it("clamps to the supported range", () => {
    expect(zoomByDelta(MAX_SCALE, -1000)).toBe(MAX_SCALE);
    expect(zoomByDelta(MIN_SCALE, 1000)).toBe(MIN_SCALE);
  });

  it("does nothing for a zero delta", () => {
    expect(zoomByDelta(1.4, 0)).toBe(1.4);
  });
});
