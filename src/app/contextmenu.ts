// The app's right-click menu. This module owns three separable concerns: a pure
// classifier (what was clicked), a pure item builder (what the menu should
// offer), and the floating menu component (how it renders and behaves). main.ts
// wires a single `contextmenu` listener to the classifier and binds each item's
// action to the matching viewer call.

import { nextRovingIndex, type RovingKey } from "./roving";

/** What the cursor was over when the context menu was requested. */
export type ContextTarget =
  | { kind: "selection" }
  | { kind: "annotation"; annotationKind: "text" | "signature"; id: string }
  | { kind: "page"; page: number }
  | { kind: "editable" } // an input/textarea: keep the native menu
  | { kind: "chrome" }; // app chrome or empty state: suppress, show nothing

/** Actions an item can request; main.ts maps these onto viewer calls. */
export type MenuActionKey =
  | "copy"
  | "edit-annotation"
  | "delete-annotation"
  | "add-text"
  | "add-signature"
  | "fit-width"
  | "reset-zoom";

export interface MenuItemSpec {
  readonly label: string;
  readonly action: MenuActionKey;
}

/**
 * Decide what a right-click was over. Order matters: editable inputs keep their
 * native menu; a live selection outranks the page or an annotation so Copy is
 * always offered; otherwise an annotation, then the page, then bare chrome.
 */
export function classifyContextTarget(
  target: Element | null,
  hasSelection: boolean,
): ContextTarget {
  if (!target) {
    return { kind: "chrome" };
  }
  if (target.closest("input, textarea, [contenteditable]")) {
    return { kind: "editable" };
  }
  if (hasSelection) {
    return { kind: "selection" };
  }
  const annotation = target.closest<HTMLElement>("[data-annotation-id]");
  if (annotation) {
    const annotationKind = annotation.dataset.annotationKind === "signature" ? "signature" : "text";
    return { kind: "annotation", annotationKind, id: annotation.dataset.annotationId ?? "" };
  }
  const page = target.closest<HTMLElement>("[data-page-index]");
  if (page) {
    return { kind: "page", page: Number(page.dataset.pageIndex) };
  }
  return { kind: "chrome" };
}

interface Size {
  readonly width: number;
  readonly height: number;
}

interface MenuPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Shift a menu anchored at `point` so it stays inside the viewport: pull it back
 * from the right/bottom edges, but never past the top-left corner (a menu taller
 * than the viewport pins to the top).
 */
export function clampMenuPosition(point: MenuPoint, size: Size, viewport: Size): MenuPoint {
  return {
    x: Math.max(0, Math.min(point.x, viewport.width - size.width)),
    y: Math.max(0, Math.min(point.y, viewport.height - size.height)),
  };
}

/** Build the menu items for a classified target. Empty for editable/chrome. */
export function buildMenuItems(target: ContextTarget): MenuItemSpec[] {
  switch (target.kind) {
    case "selection":
      return [{ label: "Copy", action: "copy" }];
    case "annotation":
      return target.annotationKind === "text"
        ? [
            { label: "Edit", action: "edit-annotation" },
            { label: "Delete", action: "delete-annotation" },
          ]
        : [{ label: "Delete", action: "delete-annotation" }];
    case "page":
      return [
        { label: "Add text here", action: "add-text" },
        { label: "Add signature here", action: "add-signature" },
        { label: "Fit width", action: "fit-width" },
        { label: "Reset to 100%", action: "reset-zoom" },
      ];
    case "editable":
    case "chrome":
      return [];
  }
}

// The single open menu, if any. Opening a new one closes the previous, so only
// one context menu ever exists in the DOM at a time.
let openMenu: { element: HTMLElement; dismiss: () => void } | null = null;

const ARROW_KEYS: Record<string, RovingKey> = {
  ArrowDown: "right",
  ArrowUp: "left",
  Home: "home",
  End: "end",
};

/** Close the open context menu, if any. */
export function closeContextMenu(): void {
  openMenu?.dismiss();
}

/**
 * Open a floating menu of `items` at `point` (viewport coordinates). Activating
 * an item runs `onAction` with its action key. The menu is keyboard-navigable
 * (Up/Down/Home/End, Enter/Space to activate, Escape to cancel) and dismisses on
 * outside pointer-down, scroll, or resize. Escape and outside-dismiss restore
 * focus to wherever it was; activating an item does not, so the action is free
 * to move focus (e.g. into a text box it opened for editing).
 */
export function openContextMenu(
  items: readonly MenuItemSpec[],
  point: MenuPoint,
  onAction: (action: MenuActionKey) => void,
): void {
  closeContextMenu();
  const restoreFocus = document.activeElement;

  const element = document.createElement("div");
  element.className = "context-menu";
  element.setAttribute("role", "menu");
  element.setAttribute("aria-label", "Context menu");
  element.style.position = "fixed";

  const buttons = items.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "context-menu-item";
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.textContent = item.label;
    button.addEventListener("click", () => {
      close(false);
      onAction(item.action);
    });
    element.appendChild(button);
    return button;
  });

  let focused = 0;
  const focus = (index: number): void => {
    focused = index;
    buttons[index]?.focus();
  };

  function close(restore: boolean): void {
    if (openMenu?.element !== element) {
      return;
    }
    openMenu = null;
    element.remove();
    document.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("scroll", dismiss, true);
    window.removeEventListener("resize", dismiss);
    if (restore && restoreFocus instanceof HTMLElement) {
      restoreFocus.focus();
    }
  }

  const dismiss = (): void => close(true);

  const onPointerDown = (event: Event): void => {
    if (!element.contains(event.target as Node)) {
      dismiss();
    }
  };

  element.addEventListener("keydown", (event) => {
    const move = ARROW_KEYS[event.key];
    if (move) {
      event.preventDefault();
      focus(nextRovingIndex(focused, buttons.length, move, () => false));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const action = items[focused]?.action;
      close(false);
      if (action) {
        onAction(action);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
    }
  });

  document.body.appendChild(element);
  const size = element.getBoundingClientRect();
  const clamped = clampMenuPosition(
    point,
    { width: size.width, height: size.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  element.style.left = `${clamped.x}px`;
  element.style.top = `${clamped.y}px`;

  openMenu = { element, dismiss };
  document.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("scroll", dismiss, true);
  window.addEventListener("resize", dismiss);
  focus(0);
}
