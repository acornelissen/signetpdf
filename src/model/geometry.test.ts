import { describe, expect, it } from "vitest";
import { userSpacePoint, type UserSpacePoint } from "./geometry";

describe("userSpacePoint", () => {
  it("constructs a point with the given coordinates", () => {
    const point = userSpacePoint(72, 700);
    expect(point.x).toBe(72);
    expect(point.y).toBe(700);
  });

  it("brands the point so a raw {x, y} is not accepted as user space", () => {
    const xOf = (point: UserSpacePoint): number => point.x;
    expect(xOf(userSpacePoint(3, 4))).toBe(3);
    // @ts-expect-error a raw object lacks the user-space brand
    xOf({ x: 1, y: 2 });
  });
});
