import { describe, expect, it } from "vitest";
import { createId } from "./id";

describe("createId", () => {
  it("produces a fresh id each call", () => {
    const ids = new Set([createId(), createId(), createId()]);
    expect(ids.size).toBe(3);
  });
});
