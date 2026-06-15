import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openPdfDocument, PasswordRequiredError, WrongPasswordError } from "./document";

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

describe("openPdfDocument", () => {
  it("opens an encrypted PDF with an empty user password transparently", async () => {
    const doc = await openPdfDocument(fixture("encrypted-empty.pdf"));
    expect(doc.numPages).toBeGreaterThan(0);
  });

  it("requires a password for a password-protected PDF", async () => {
    await expect(openPdfDocument(fixture("encrypted-password.pdf"))).rejects.toBeInstanceOf(
      PasswordRequiredError,
    );
  });

  it("opens a password-protected PDF with the correct password", async () => {
    const doc = await openPdfDocument(fixture("encrypted-password.pdf"), "secret");
    expect(doc.numPages).toBeGreaterThan(0);
  });

  it("reports a wrong password distinctly", async () => {
    await expect(openPdfDocument(fixture("encrypted-password.pdf"), "nope")).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
  });

  it("opens a normal PDF unchanged", async () => {
    const doc = await openPdfDocument(fixture("two-page.pdf"));
    expect(doc.numPages).toBe(2);
  });
});
