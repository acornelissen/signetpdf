// Branded point types. The brand makes a user-space point and a screen point
// distinct at compile time, so a raw {x, y} or a screen pixel can never be
// passed where the model expects PDF user space. The coordinate seam (m1-5/m1-6)
// is the only place allowed to convert between the two.

declare const userSpaceBrand: unique symbol;

/** A point in PDF user space: units are points, origin is the page bottom-left. */
export interface UserSpacePoint {
  readonly x: number;
  readonly y: number;
  readonly [userSpaceBrand]: true;
}

/** Construct a user-space point. The only sanctioned way to make one. */
export function userSpacePoint(x: number, y: number): UserSpacePoint {
  return { x, y } as unknown as UserSpacePoint;
}

declare const screenSpaceBrand: unique symbol;

/** A point in screen space: CSS pixels, origin at the top-left of the page. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
  readonly [screenSpaceBrand]: true;
}

/** Construct a screen-space point. Produced only by the coordinate seam. */
export function screenPoint(x: number, y: number): ScreenPoint {
  return { x, y } as unknown as ScreenPoint;
}
