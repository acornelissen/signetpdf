// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_DISMISS_MS, createToasts, MAX_VISIBLE, type Toasts } from "./toast";

let root: HTMLElement;
let toasts: Toasts;

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("div");
  document.body.append(root);
  toasts = createToasts(root);
});

afterEach(() => {
  vi.useRealTimers();
  root.remove();
});

const messages = (): string[] =>
  [...root.querySelectorAll(".toast-message")].map((el) => el.textContent ?? "");

describe("createToasts", () => {
  it("shows the message and tags the variant", () => {
    toasts.notify("Saved.", "success");
    const toast = root.querySelector<HTMLElement>(".toast");
    expect(toast?.dataset.variant).toBe("success");
    expect(messages()).toEqual(["Saved."]);
  });

  it("defaults to the info variant", () => {
    toasts.notify("Heads up");
    expect(root.querySelector<HTMLElement>(".toast")?.dataset.variant).toBe("info");
  });

  it("auto-dismisses info and success toasts", () => {
    toasts.notify("Saved.", "success");
    expect(messages()).toHaveLength(1);
    vi.advanceTimersByTime(AUTO_DISMISS_MS);
    expect(messages()).toHaveLength(0);
  });

  it("keeps error toasts sticky and marks them role=alert", () => {
    toasts.notify("Could not save.", "error");
    expect(root.querySelector(".toast")?.getAttribute("role")).toBe("alert");
    vi.advanceTimersByTime(AUTO_DISMISS_MS * 3);
    expect(messages()).toEqual(["Could not save."]);
  });

  it("caps the stack and drops the oldest first", () => {
    for (let i = 1; i <= MAX_VISIBLE + 1; i++) {
      toasts.notify(`msg ${i}`, "error"); // sticky, so none auto-expire
    }
    expect(messages()).toHaveLength(MAX_VISIBLE);
    expect(messages()).not.toContain("msg 1");
    expect(messages()).toContain(`msg ${MAX_VISIBLE + 1}`);
  });

  it("dismisses on the dismiss button", () => {
    toasts.notify("Could not save.", "error");
    root.querySelector<HTMLButtonElement>(".toast-dismiss")?.click();
    expect(messages()).toHaveLength(0);
  });

  it("clears every toast", () => {
    toasts.notify("a", "error");
    toasts.notify("b", "error");
    toasts.clear();
    expect(messages()).toHaveLength(0);
  });

  it("pauses the auto-dismiss timer while hovered", () => {
    toasts.notify("Saved.", "success");
    const toast = root.querySelector<HTMLElement>(".toast")!;
    toast.dispatchEvent(new Event("mouseenter"));
    vi.advanceTimersByTime(AUTO_DISMISS_MS * 2);
    expect(messages()).toHaveLength(1); // still there: timer was paused
    toast.dispatchEvent(new Event("mouseleave"));
    vi.advanceTimersByTime(AUTO_DISMISS_MS);
    expect(messages()).toHaveLength(0);
  });
});
