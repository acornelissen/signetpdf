import { screenPoint, type ScreenPoint } from "../model/geometry";

// Pointer-drag plumbing shared by every annotation handle (text box move/resize,
// signature stamp move/scale). It tracks the pointer on the window so the drag
// keeps working if the cursor leaves the small handle, and reports the gesture as
// screen points; the geometry (user space) is computed by the caller's transform.

/**
 * Wire a handle for dragging. `onStart` fires on pointer-down (capture initial
 * element state there); `onLive` gets the running screen delta for visual
 * feedback; `onDone` gets the start/end screen points and the pointer-up event
 * (so callers can read modifier keys, e.g. to bypass snapping) once, unless the
 * pointer never moved (a click).
 */
export function onHandleDrag(
  handle: HTMLElement,
  onStart: () => void,
  onLive: (dx: number, dy: number) => void,
  onDone: (from: ScreenPoint, to: ScreenPoint, event: PointerEvent) => void,
): void {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    onStart();
    const startX = event.clientX;
    const startY = event.clientY;

    const onPointerMove = (move: PointerEvent): void => {
      onLive(move.clientX - startX, move.clientY - startY);
    };

    const onPointerUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (up.clientX === startX && up.clientY === startY) {
        return; // a click, not a drag
      }
      onDone(screenPoint(startX, startY), screenPoint(up.clientX, up.clientY), up);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}
