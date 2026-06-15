// Keyboard shortcuts, resolved per platform (Cmd on macOS, Ctrl elsewhere). The
// matcher is pure so it can be tested without the DOM; main.ts maps the result
// to the corresponding viewer action.

export type ShortcutAction =
  | "open"
  | "save"
  | "save-as"
  | "undo"
  | "redo"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset";

export type Platform = "mac" | "other";

/** The parts of a keyboard event the matcher needs. */
export interface KeyChord {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

/** Map a key chord to an app action, or null if it is not a shortcut. */
export function matchShortcut(chord: KeyChord, platform: Platform): ShortcutAction | null {
  // The platform modifier: Cmd on macOS, Ctrl everywhere else. Requiring exactly
  // this key means Ctrl+S on macOS (or Cmd+S elsewhere) does not trigger.
  const modifier = platform === "mac" ? chord.metaKey : chord.ctrlKey;
  if (!modifier) {
    return null;
  }
  switch (chord.key.toLowerCase()) {
    case "o":
      return "open";
    case "s":
      return chord.shiftKey ? "save-as" : "save";
    case "z":
      return chord.shiftKey ? "redo" : "undo";
    case "y":
      return "redo";
    case "=":
    case "+":
      return "zoom-in";
    case "-":
      return "zoom-out";
    case "0":
      return "zoom-reset";
    default:
      return null;
  }
}

/** Detect the platform for modifier resolution from a user-agent string. */
export function detectPlatform(userAgent: string): Platform {
  return /mac/i.test(userAgent) ? "mac" : "other";
}
