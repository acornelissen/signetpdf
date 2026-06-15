import { describe, expect, it } from "vitest";
import type { PageGeometry } from "../model/document";
import { mostVisiblePage, pageDisplaySize } from "./layout";

const page = (over: Partial<PageGeometry> = {}): PageGeometry => ({
  index: 0,
  width: 600,
  height: 800,
  rotation: 0,
  ...over,
});

describe("pageDisplaySize", () => {
  it("scales the unrotated size", () => {
    expect(pageDisplaySize(page(), 1)).toEqual({ width: 600, height: 800 });
    expect(pageDisplaySize(page(), 2)).toEqual({ width: 1200, height: 1600 });
  });

  it("swaps width and height for quarter-turn rotations", () => {
    expect(pageDisplaySize(page({ rotation: 90 }), 1)).toEqual({ width: 800, height: 600 });
    expect(pageDisplaySize(page({ rotation: 270 }), 1)).toEqual({ width: 800, height: 600 });
  });

  it("does not swap for 180", () => {
    expect(pageDisplaySize(page({ rotation: 180 }), 1)).toEqual({ width: 600, height: 800 });
  });
});

describe("mostVisiblePage", () => {
  it("returns the page with the largest visible fraction", () => {
    expect(
      mostVisiblePage([
        { index: 0, ratio: 0.2 },
        { index: 1, ratio: 0.8 },
        { index: 2, ratio: 0 },
      ]),
    ).toBe(1);
  });

  it("returns null when nothing is visible", () => {
    expect(mostVisiblePage([])).toBeNull();
    expect(mostVisiblePage([{ index: 3, ratio: 0 }])).toBeNull();
  });

  it("breaks ties toward the lower page index", () => {
    expect(
      mostVisiblePage([
        { index: 4, ratio: 0.5 },
        { index: 2, ratio: 0.5 },
      ]),
    ).toBe(2);
  });
});
