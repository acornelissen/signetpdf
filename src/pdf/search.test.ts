import { describe, expect, it } from "vitest";
import { findMatches, locateInItems, matchRanges } from "./search";

describe("findMatches", () => {
  it("finds case-insensitive matches across pages in reading order", () => {
    const pages = ["The cat sat", "A CAT and a dog"];
    expect(findMatches(pages, "cat")).toEqual([
      { page: 0, start: 4, length: 3 },
      { page: 1, start: 2, length: 3 },
    ]);
  });

  it("finds multiple matches within one page", () => {
    expect(findMatches(["aXaXa"], "a")).toEqual([
      { page: 0, start: 0, length: 1 },
      { page: 0, start: 2, length: 1 },
      { page: 0, start: 4, length: 1 },
    ]);
  });

  it("does not return overlapping matches", () => {
    // "aa" in "aaa" matches once, then resumes past it.
    expect(findMatches(["aaa"], "aa")).toEqual([{ page: 0, start: 0, length: 2 }]);
  });

  it("returns nothing for an empty query or no match", () => {
    expect(findMatches(["hello"], "")).toEqual([]);
    expect(findMatches(["hello"], "   ")).toEqual([]);
    expect(findMatches(["hello"], "xyz")).toEqual([]);
  });
});

describe("locateInItems", () => {
  // Three text items: "ab" (0-1), "cde" (2-4), "f" (5).
  const lengths = [2, 3, 1];

  it("maps a global offset to an item and in-item offset", () => {
    expect(locateInItems(lengths, 0)).toEqual({ item: 0, offset: 0 });
    expect(locateInItems(lengths, 1)).toEqual({ item: 0, offset: 1 });
    expect(locateInItems(lengths, 2)).toEqual({ item: 1, offset: 0 });
    expect(locateInItems(lengths, 4)).toEqual({ item: 1, offset: 2 });
    expect(locateInItems(lengths, 5)).toEqual({ item: 2, offset: 0 });
  });

  it("clamps an offset at or past the end to the last item boundary", () => {
    expect(locateInItems(lengths, 6)).toEqual({ item: 2, offset: 1 });
    expect(locateInItems(lengths, 99)).toEqual({ item: 2, offset: 1 });
  });

  it("returns the first item for an empty item list fallback", () => {
    expect(locateInItems([], 0)).toEqual({ item: 0, offset: 0 });
  });
});

describe("matchRanges", () => {
  it("maps a within-item match to a single span range", () => {
    // spans: "Hello " | "world"
    expect(matchRanges(["Hello ", "world"], "world")).toEqual([
      { startItem: 1, startOffset: 0, endItem: 1, endOffset: 5 },
    ]);
  });

  it("maps a match spanning two items", () => {
    // "lo wo" spans the join of "Hello " and "world": offsets 3..8
    expect(matchRanges(["Hello ", "world"], "lo wo")).toEqual([
      { startItem: 0, startOffset: 3, endItem: 1, endOffset: 2 },
    ]);
  });

  it("returns every match on the page", () => {
    expect(matchRanges(["a", "b", "a"], "a")).toEqual([
      { startItem: 0, startOffset: 0, endItem: 0, endOffset: 1 },
      { startItem: 2, startOffset: 0, endItem: 2, endOffset: 1 },
    ]);
  });
});
