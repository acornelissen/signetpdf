// Pure text-search logic, kept out of the DOM so it can be unit-tested. The
// page text is the concatenation of a page's pdf.js text items (in reading
// order), so a match's offset maps back to those items for highlighting.

export interface SearchMatch {
  readonly page: number; // 0-based page index
  readonly start: number; // character offset within the page's text
  readonly length: number;
}

/**
 * All case-insensitive, non-overlapping matches of `query` across the pages, in
 * page-then-offset order. An empty or whitespace-only query matches nothing.
 */
export function findMatches(pageTexts: readonly string[], query: string): SearchMatch[] {
  const needle = query.toLowerCase();
  if (needle.trim() === "") {
    return [];
  }
  const matches: SearchMatch[] = [];
  pageTexts.forEach((text, page) => {
    const haystack = text.toLowerCase();
    let from = 0;
    for (;;) {
      const start = haystack.indexOf(needle, from);
      if (start === -1) {
        break;
      }
      matches.push({ page, start, length: needle.length });
      from = start + needle.length; // non-overlapping
    }
  });
  return matches;
}

/**
 * Map a global character offset within a page to the text item it falls in and
 * the offset within that item, given each item's length. Offsets at or past the
 * end clamp to the final item so a match end maps to a valid boundary.
 */
export function locateInItems(
  itemLengths: readonly number[],
  offset: number,
): { item: number; offset: number } {
  let remaining = offset;
  for (let item = 0; item < itemLengths.length; item++) {
    const length = itemLengths[item] ?? 0;
    if (remaining < length || item === itemLengths.length - 1) {
      return { item, offset: Math.min(remaining, length) };
    }
    remaining -= length;
  }
  return { item: 0, offset: 0 };
}

/** Start/end position of a match expressed against the per-item (span) array. */
export interface ItemRange {
  readonly startItem: number;
  readonly startOffset: number;
  readonly endItem: number;
  readonly endOffset: number;
}

/**
 * Matches of `query` across one page's text items (e.g. the rendered text-layer
 * spans), each as a start/end position in item coordinates ready to become a DOM
 * Range. `itemTexts` is the spans' text in reading order.
 */
export function matchRanges(itemTexts: readonly string[], query: string): ItemRange[] {
  const lengths = itemTexts.map((text) => text.length);
  const pageText = itemTexts.join("");
  return findMatches([pageText], query).map((match) => {
    const start = locateInItems(lengths, match.start);
    // Anchor the end on the last matched character so the range stays inside the
    // item that contains it (rather than the start of the next, possibly-empty,
    // span), then step one past it.
    const last = locateInItems(lengths, match.start + match.length - 1);
    return {
      startItem: start.item,
      startOffset: start.offset,
      endItem: last.item,
      endOffset: last.offset + 1,
    };
  });
}
