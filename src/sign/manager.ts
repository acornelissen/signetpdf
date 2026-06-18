import type { SavedSignature } from "./store";
import { pngBytesToDataUrl } from "./pad";

// The saved-signature management card used in the signature dialog's strip. Each
// card previews one stored signature and carries its management affordances:
// click the thumbnail to place it, rename it inline, make it the default, or
// delete it (behind a confirm step). The card holds no persistent state of its
// own — every action routes back through the supplied callbacks, which talk to
// the Rust-owned store; the caller re-renders the strip from the fresh listing.

export interface SavedSignatureActions {
  /** Place this signature (drop a stamp). */
  readonly onUse: (id: string) => void;
  /** Persist a new name (already trimmed; empty clears it). */
  readonly onRename: (id: string, name: string) => void;
  /** Make this signature the default. */
  readonly onSetDefault: (id: string) => void;
  /** Permanently delete this signature. */
  readonly onDelete: (id: string) => void;
}

/** The visible label for a signature: its name, or a stable positional fallback. */
function labelFor(signature: SavedSignature, index: number): string {
  return signature.name ?? `Signature ${index + 1}`;
}

/**
 * Build one management card for a saved signature. `index` drives the fallback
 * name for unnamed signatures and accessible labels.
 */
export function buildSavedSignatureCard(
  signature: SavedSignature,
  index: number,
  actions: SavedSignatureActions,
): HTMLElement {
  const label = labelFor(signature, index);

  const card = document.createElement("div");
  card.className = "saved-signature-card";
  card.dataset.signatureId = signature.id;
  if (signature.isDefault) {
    card.classList.add("is-default");
  }

  const use = document.createElement("button");
  use.type = "button";
  use.className = "saved-signature";
  use.setAttribute("aria-label", `Use ${label}`);
  const img = document.createElement("img");
  img.src = pngBytesToDataUrl(signature.pngBytes);
  img.alt = "";
  use.appendChild(img);
  use.addEventListener("click", () => actions.onUse(signature.id));
  card.appendChild(use);

  const meta = document.createElement("div");
  meta.className = "saved-signature-meta";

  const name = document.createElement("span");
  name.className = "saved-signature-name";
  name.textContent = label;
  meta.appendChild(name);

  if (signature.isDefault) {
    const badge = document.createElement("span");
    badge.className = "saved-signature-default-badge";
    badge.textContent = "Default";
    meta.appendChild(badge);
  }

  const controls = document.createElement("div");
  controls.className = "saved-signature-actions";
  controls.appendChild(buildRenameControl(signature, label, name, actions));
  if (!signature.isDefault) {
    controls.appendChild(buildSetDefaultControl(signature, label, actions));
  }
  controls.appendChild(buildDeleteControl(signature, label, actions));
  meta.appendChild(controls);

  card.appendChild(meta);
  return card;
}

/** The "Rename" button; clicking it swaps the name label for an inline editor. */
function buildRenameControl(
  signature: SavedSignature,
  label: string,
  name: HTMLElement,
  actions: SavedSignatureActions,
): HTMLButtonElement {
  const rename = document.createElement("button");
  rename.type = "button";
  rename.className = "saved-signature-rename btn btn-ghost";
  rename.setAttribute("aria-label", `Rename ${label}`);
  rename.textContent = "Rename";
  rename.addEventListener("click", () => startRename(signature, name, actions));
  return rename;
}

/** Replace the name label with a text input; Enter commits, Escape abandons. */
function startRename(
  signature: SavedSignature,
  name: HTMLElement,
  actions: SavedSignatureActions,
): void {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "saved-signature-rename-input";
  input.value = signature.name ?? "";
  input.maxLength = 100;
  input.setAttribute("aria-label", "Signature name");

  let settled = false;
  const finish = (commit: boolean): void => {
    if (settled) {
      return; // guard the blur that follows an Enter/Escape
    }
    settled = true;
    input.replaceWith(name);
    if (commit) {
      actions.onRename(signature.id, input.value.trim());
    }
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  // Clicking away commits whatever was typed, matching common inline-edit UX.
  input.addEventListener("blur", () => finish(true));

  name.replaceWith(input);
  input.focus();
  input.select();
}

/** The "Set default" button (only shown for non-default signatures). */
function buildSetDefaultControl(
  signature: SavedSignature,
  label: string,
  actions: SavedSignatureActions,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "saved-signature-default btn btn-ghost";
  button.setAttribute("aria-label", `Set ${label} as the default signature`);
  button.textContent = "Set default";
  button.addEventListener("click", () => actions.onSetDefault(signature.id));
  return button;
}

/** The "Delete" button, which arms on the first click and commits on the second. */
function buildDeleteControl(
  signature: SavedSignature,
  label: string,
  actions: SavedSignatureActions,
): HTMLButtonElement {
  const del = document.createElement("button");
  del.type = "button";
  del.className = "saved-signature-delete btn btn-ghost";
  del.setAttribute("aria-label", `Delete ${label}`);
  del.textContent = "Delete";

  let armed = false;
  let fired = false; // latch: the card is about to be removed; never delete twice
  const disarm = (): void => {
    armed = false;
    del.textContent = "Delete";
    del.classList.remove("is-confirming");
    del.setAttribute("aria-label", `Delete ${label}`);
  };
  del.addEventListener("click", () => {
    if (fired) {
      return;
    }
    if (!armed) {
      armed = true;
      del.textContent = "Confirm";
      del.classList.add("is-confirming");
      del.setAttribute("aria-label", `Confirm deleting ${label}`);
      return;
    }
    fired = true;
    actions.onDelete(signature.id);
  });
  // Clicking elsewhere cancels an armed delete so it can't fire by surprise.
  del.addEventListener("blur", disarm);
  return del;
}
