// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeContextMenu, openContextMenu, type MenuActionKey } from "./contextmenu";

const ITEMS = [
  { label: "Add text here", action: "add-text" as MenuActionKey },
  { label: "Fit width", action: "fit-width" as MenuActionKey },
  { label: "Reset to 100%", action: "reset-zoom" as MenuActionKey },
];

const menu = () => document.querySelector('[role="menu"]');
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const press = (key: string) =>
  menu()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

afterEach(() => {
  closeContextMenu();
  document.body.replaceChildren();
});

describe("openContextMenu", () => {
  it("renders a menu landmark with one focusable item per spec, first focused", () => {
    openContextMenu(ITEMS, { x: 10, y: 10 }, vi.fn());
    expect(menu()?.getAttribute("role")).toBe("menu");
    expect(items().map((i) => i.textContent)).toEqual([
      "Add text here",
      "Fit width",
      "Reset to 100%",
    ]);
    expect(document.activeElement).toBe(items()[0]);
  });

  it("moves focus with Arrow/Home/End, wrapping at the ends", () => {
    openContextMenu(ITEMS, { x: 10, y: 10 }, vi.fn());
    press("ArrowDown");
    expect(document.activeElement).toBe(items()[1]);
    press("ArrowUp");
    expect(document.activeElement).toBe(items()[0]);
    press("ArrowUp"); // wraps to last
    expect(document.activeElement).toBe(items()[2]);
    press("Home");
    expect(document.activeElement).toBe(items()[0]);
    press("End");
    expect(document.activeElement).toBe(items()[2]);
  });

  it("activates the focused item on Enter and closes", () => {
    const onAction = vi.fn();
    openContextMenu(ITEMS, { x: 10, y: 10 }, onAction);
    press("ArrowDown");
    press("Enter");
    expect(onAction).toHaveBeenCalledWith("fit-width");
    expect(menu()).toBeNull();
  });

  it("activates on click", () => {
    const onAction = vi.fn();
    openContextMenu(ITEMS, { x: 10, y: 10 }, onAction);
    items()[2]?.click();
    expect(onAction).toHaveBeenCalledWith("reset-zoom");
    expect(menu()).toBeNull();
  });

  it("closes on Escape and restores focus, without acting", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onAction = vi.fn();
    openContextMenu(ITEMS, { x: 10, y: 10 }, onAction);
    press("Escape");
    expect(menu()).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on an outside pointer-down without acting", () => {
    const onAction = vi.fn();
    openContextMenu(ITEMS, { x: 10, y: 10 }, onAction);
    document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(menu()).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("keeps only one menu open at a time", () => {
    openContextMenu(ITEMS, { x: 10, y: 10 }, vi.fn());
    openContextMenu(ITEMS.slice(0, 1), { x: 20, y: 20 }, vi.fn());
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(items()).toHaveLength(1);
  });

  it("positions the menu at the requested point", () => {
    openContextMenu(ITEMS, { x: 30, y: 40 }, vi.fn());
    const el = menu() as HTMLElement;
    expect(el.style.left).toBe("30px");
    expect(el.style.top).toBe("40px");
  });
});
