import { describe, expect, it } from "vitest";
import { nextRovingIndex, type RovingKey } from "./roving";

// A 5-item toolbar with items 1 and 3 disabled.
const disabled = (index: number): boolean => index === 1 || index === 3;
const move = (current: number, key: RovingKey): number =>
  nextRovingIndex(current, 5, key, disabled);

describe("nextRovingIndex", () => {
  it("moves right to the next enabled item", () => {
    expect(move(0, "right")).toBe(2);
    expect(move(2, "right")).toBe(4);
  });

  it("moves left to the previous enabled item", () => {
    expect(move(4, "left")).toBe(2);
    expect(move(2, "left")).toBe(0);
  });

  it("wraps around the ends, skipping disabled items", () => {
    expect(move(4, "right")).toBe(0);
    expect(move(0, "left")).toBe(4);
  });

  it("jumps to the first and last enabled items", () => {
    expect(move(4, "home")).toBe(0);
    expect(move(0, "end")).toBe(4);
  });

  it("stays put when every item is disabled", () => {
    expect(nextRovingIndex(2, 5, "right", () => true)).toBe(2);
  });
});
