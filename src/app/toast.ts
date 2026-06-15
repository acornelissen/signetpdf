// Floating toast stack. Headless and DOM-only (no app coupling) so it is
// unit-testable: callers hand it a container element and call notify(). Visual
// styling lives in styles.css (.toasts / .toast).
//
// Accessibility: the container is an aria-live="polite" region, so info/success
// toasts announce politely; error toasts carry role="alert" so they announce
// assertively regardless of the container. Auto-dismiss pauses on hover/focus so
// a reader is never raced.
import { icon } from "./icons";

export type ToastVariant = "info" | "success" | "error";

export const AUTO_DISMISS_MS = 4000;
export const MAX_VISIBLE = 3;

const VARIANT_ICON: Record<ToastVariant, Parameters<typeof icon>[0]> = {
  info: "info",
  success: "success",
  error: "error",
};

export interface Toasts {
  /** Show a toast. info/success auto-dismiss; error is sticky. */
  notify(message: string, variant?: ToastVariant): void;
  /** Remove every toast. */
  clear(): void;
}

export function createToasts(root: HTMLElement): Toasts {
  root.classList.add("toasts");
  root.setAttribute("aria-live", "polite");

  const dismiss = (toast: HTMLElement): void => {
    const timer = timers.get(toast);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(toast);
    }
    toast.remove();
  };

  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  const arm = (toast: HTMLElement): void => {
    timers.set(
      toast,
      setTimeout(() => dismiss(toast), AUTO_DISMISS_MS),
    );
  };

  const pause = (toast: HTMLElement): void => {
    const timer = timers.get(toast);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(toast);
    }
  };

  const notify = (message: string, variant: ToastVariant = "info"): void => {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.variant = variant;
    if (variant === "error") {
      toast.setAttribute("role", "alert");
    }

    const glyph = document.createElement("span");
    glyph.className = "toast-icon";
    glyph.innerHTML = icon(VARIANT_ICON[variant]);

    const text = document.createElement("span");
    text.className = "toast-message";
    text.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-dismiss";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML = icon("dismiss");
    close.addEventListener("click", () => dismiss(toast));

    toast.append(glyph, text, close);
    root.append(toast);

    // Drop the oldest while over the cap.
    while (root.children.length > MAX_VISIBLE && root.firstElementChild) {
      dismiss(root.firstElementChild as HTMLElement);
    }

    // info/success fade on their own; pause the countdown while interacted with.
    if (variant !== "error") {
      arm(toast);
      const resume = (): void => {
        if (toast.isConnected) {
          arm(toast);
        }
      };
      toast.addEventListener("mouseenter", () => pause(toast));
      toast.addEventListener("mouseleave", resume);
      toast.addEventListener("focusin", () => pause(toast));
      toast.addEventListener("focusout", resume);
    }
  };

  const clear = (): void => {
    for (const toast of [...root.children]) {
      dismiss(toast as HTMLElement);
    }
  };

  return { notify, clear };
}
