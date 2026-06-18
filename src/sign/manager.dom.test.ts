// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { SavedSignature } from "./store";
import { buildSavedSignatureCard } from "./manager";

function sig(overrides: Partial<SavedSignature> = {}): SavedSignature {
  return {
    id: "0000000000000000000000000000000a",
    pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    name: null,
    isDefault: false,
    ...overrides,
  };
}

function actions(over: Partial<Parameters<typeof buildSavedSignatureCard>[2]> = {}) {
  return {
    onUse: vi.fn(),
    onRename: vi.fn(),
    onSetDefault: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
}

describe("buildSavedSignatureCard (DOM)", () => {
  it("renders the thumbnail preview carrying the signature id", () => {
    const card = buildSavedSignatureCard(sig(), 0, actions());
    expect(card.dataset.signatureId).toBe("0000000000000000000000000000000a");
    const img = card.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  });

  it("shows the name when present and a fallback when unnamed", () => {
    const named = buildSavedSignatureCard(sig({ name: "Work" }), 0, actions());
    expect(named.querySelector(".saved-signature-name")?.textContent).toBe("Work");
    const unnamed = buildSavedSignatureCard(sig(), 2, actions());
    expect(unnamed.querySelector(".saved-signature-name")?.textContent).toBe("Signature 3");
  });

  it("places the signature when its thumbnail is clicked", () => {
    const acts = actions();
    const card = buildSavedSignatureCard(sig(), 0, acts);
    card.querySelector<HTMLButtonElement>(".saved-signature")?.click();
    expect(acts.onUse).toHaveBeenCalledWith("0000000000000000000000000000000a");
  });

  it("marks the default and offers no set-default button for it", () => {
    const card = buildSavedSignatureCard(sig({ isDefault: true }), 0, actions());
    expect(card.classList.contains("is-default")).toBe(true);
    expect(card.querySelector(".saved-signature-default")).toBeNull();
    expect(card.querySelector(".saved-signature-default-badge")).not.toBeNull();
  });

  it("sets the default when the non-default's star is clicked", () => {
    const acts = actions();
    const card = buildSavedSignatureCard(sig(), 0, acts);
    card.querySelector<HTMLButtonElement>(".saved-signature-default")?.click();
    expect(acts.onSetDefault).toHaveBeenCalledWith("0000000000000000000000000000000a");
  });

  it("deletes only after a confirm step", () => {
    const acts = actions();
    const card = buildSavedSignatureCard(sig(), 0, acts);
    const del = card.querySelector<HTMLButtonElement>(".saved-signature-delete");
    del?.click();
    expect(acts.onDelete).not.toHaveBeenCalled();
    // A second click on the now-confirming button commits the delete.
    del?.click();
    expect(acts.onDelete).toHaveBeenCalledWith("0000000000000000000000000000000a");
  });

  it("fires delete at most once on repeated confirm clicks", () => {
    const acts = actions();
    const card = buildSavedSignatureCard(sig(), 0, acts);
    const del = card.querySelector<HTMLButtonElement>(".saved-signature-delete");
    del?.click(); // arm
    del?.click(); // confirm -> fires
    del?.click(); // further clicks must not re-fire
    del?.click();
    expect(acts.onDelete).toHaveBeenCalledTimes(1);
  });

  it("commits a rename from the inline editor on Enter", () => {
    const acts = actions();
    const card = buildSavedSignatureCard(sig(), 0, acts);
    card.querySelector<HTMLButtonElement>(".saved-signature-rename")?.click();
    const input = card.querySelector<HTMLInputElement>(".saved-signature-rename-input");
    expect(input).not.toBeNull();
    input!.value = "Personal";
    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(acts.onRename).toHaveBeenCalledWith("0000000000000000000000000000000a", "Personal");
  });

  it("abandons a rename on Escape without calling back", () => {
    const acts = actions();
    const card = buildSavedSignatureCard(sig({ name: "Work" }), 0, acts);
    card.querySelector<HTMLButtonElement>(".saved-signature-rename")?.click();
    const input = card.querySelector<HTMLInputElement>(".saved-signature-rename-input");
    input!.value = "changed";
    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(acts.onRename).not.toHaveBeenCalled();
    // The name label is restored.
    expect(card.querySelector(".saved-signature-name")?.textContent).toBe("Work");
  });
});
