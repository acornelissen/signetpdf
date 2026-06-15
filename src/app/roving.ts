// Pure focus-index maths for a roving-tabindex toolbar (WAI-ARIA APG pattern),
// kept out of the DOM so it can be unit-tested. The DOM wiring lives in dock.ts.

export type RovingKey = "left" | "right" | "home" | "end";

/**
 * The index the toolbar focus should move to for a navigation key. Right/Left
 * step to the next/previous enabled item, wrapping at the ends; Home/End jump to
 * the first/last enabled item. Disabled items are skipped. If no item is enabled
 * the current index is returned unchanged.
 */
export function nextRovingIndex(
  current: number,
  count: number,
  key: RovingKey,
  isDisabled: (index: number) => boolean,
): number {
  const firstEnabled = (): number => {
    for (let i = 0; i < count; i++) {
      if (!isDisabled(i)) {
        return i;
      }
    }
    return current;
  };
  const lastEnabled = (): number => {
    for (let i = count - 1; i >= 0; i--) {
      if (!isDisabled(i)) {
        return i;
      }
    }
    return current;
  };

  if (key === "home") {
    return firstEnabled();
  }
  if (key === "end") {
    return lastEnabled();
  }

  const step = key === "right" ? 1 : -1;
  for (let i = 1; i <= count; i++) {
    const candidate = (((current + step * i) % count) + count) % count;
    if (!isDisabled(candidate)) {
      return candidate;
    }
  }
  return current;
}
