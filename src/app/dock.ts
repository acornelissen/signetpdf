// Builds the floating bottom dock: grouped icon buttons (File / Tools / History /
// Zoom) with tooltips that include the platform keyboard shortcut. Button ids
// match the handlers wired in main.ts. Structure only — no behavior.
import { iconButton, type IconName } from "./icons";
import type { Platform } from "./shortcuts";

interface DockButton {
  id: string;
  name: IconName;
  label: string;
  shortcut?: string; // key portion, e.g. "O"; the modifier is prefixed per platform
  shift?: boolean;
  pressed?: boolean; // renders aria-pressed (toggle tools)
  disabled?: boolean;
}

interface DockGroup {
  label: string;
  buttons: DockButton[];
}

const GROUPS: DockGroup[] = [
  {
    label: "File",
    buttons: [
      { id: "open", name: "open", label: "Open PDF", shortcut: "O" },
      { id: "save", name: "save", label: "Save", shortcut: "S" },
      { id: "save-as", name: "save-as", label: "Save as", shortcut: "S", shift: true },
      { id: "export-flat", name: "export", label: "Export flattened copy" },
    ],
  },
  {
    label: "Tools",
    buttons: [
      { id: "text-tool", name: "text", label: "Add text", pressed: true },
      { id: "sign-tool", name: "sign", label: "Add signature" },
    ],
  },
  {
    label: "History",
    buttons: [
      { id: "undo", name: "undo", label: "Undo", shortcut: "Z", disabled: true },
      { id: "redo", name: "redo", label: "Redo", shortcut: "Z", shift: true, disabled: true },
    ],
  },
];

/** Format a tooltip shortcut for the platform, e.g. "⌘⇧S" or "Ctrl+Shift+S". */
function shortcutLabel(button: DockButton, platform: Platform): string | undefined {
  if (!button.shortcut) {
    return undefined;
  }
  if (platform === "mac") {
    return `${button.shift ? "⇧" : ""}⌘${button.shortcut}`;
  }
  return `Ctrl+${button.shift ? "Shift+" : ""}${button.shortcut}`;
}

function makeButton(button: DockButton, platform: Platform): HTMLButtonElement {
  const shortcut = shortcutLabel(button, platform);
  const element = iconButton(button.name, button.label, button.id, shortcut ? { shortcut } : {});
  if (button.pressed) {
    element.setAttribute("aria-pressed", "false");
  }
  if (button.disabled) {
    element.disabled = true;
  }
  return element;
}

function makeGroup(group: DockGroup, platform: Platform): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "dock-group";
  element.setAttribute("aria-label", group.label);
  for (const button of group.buttons) {
    element.append(makeButton(button, platform));
  }
  return element;
}

/** The zoom group carries the live readout between the −/+ controls. */
function makeZoomGroup(platform: Platform): HTMLDivElement {
  const group = document.createElement("div");
  group.className = "dock-group zoom";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Zoom");

  group.append(makeButton({ id: "zoom-out", name: "minus", label: "Zoom out" }, platform));

  const level = document.createElement("span");
  level.id = "zoom-level";
  level.className = "zoom-level";
  level.setAttribute("aria-live", "polite");
  level.textContent = "100%";
  group.append(level);

  group.append(
    makeButton({ id: "zoom-in", name: "plus", label: "Zoom in" }, platform),
    makeButton({ id: "zoom-fit", name: "fit-width", label: "Fit width" }, platform),
  );
  return group;
}

/** The page-position readout ("3 / 12"), updated from the viewport on scroll. */
function makePageGroup(): HTMLDivElement {
  const group = document.createElement("div");
  group.className = "dock-group page";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Page");

  const indicator = document.createElement("span");
  indicator.id = "page-indicator";
  indicator.className = "page-indicator";
  indicator.setAttribute("aria-live", "polite");
  indicator.setAttribute("aria-label", "Page position");
  indicator.textContent = "– / –";
  group.append(indicator);
  return group;
}

/** Build the dock nav (role=toolbar) with all groups for the given platform. */
export function buildDock(platform: Platform): HTMLElement {
  const dock = document.createElement("nav");
  dock.className = "dock";
  dock.id = "dock";
  dock.setAttribute("role", "toolbar");
  dock.setAttribute("aria-label", "Toolbar");
  for (const group of GROUPS) {
    dock.append(makeGroup(group, platform));
  }
  dock.append(makePageGroup());
  dock.append(makeZoomGroup(platform));
  return dock;
}
