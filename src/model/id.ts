// The one place annotation ids are minted, so every id comes from the same
// source and is unique within a session. A monotonic counter is enough; ids are
// opaque handles, never persisted or parsed.
let counter = 0;

export function createId(): string {
  counter += 1;
  return `ann-${counter}`;
}
