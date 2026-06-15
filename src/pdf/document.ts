import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

// The legacy build is used deliberately: it runs both in the Tauri webview and
// under node (Vitest), so tests exercise the same loader the app does. The
// worker is configured separately in ./worker (imported only by the app entry);
// without it, pdfjs falls back to an in-process worker, which is fine for the
// pure parsing that the headless tests need.

/**
 * Parse PDF bytes into a pdf.js document. The input buffer is copied first
 * because pdf.js may transfer (detach) the ArrayBuffer it is handed.
 */
export function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js v6 does not use eval/Function, so it runs cleanly under the hardened
  // CSP (no 'unsafe-eval').
  return getDocument({ data: bytes.slice() }).promise;
}

/** The PDF is encrypted and needs a password we do not have yet. */
export class PasswordRequiredError extends Error {
  constructor() {
    super("This PDF is password-protected.");
    this.name = "PasswordRequiredError";
  }
}

/** A password was supplied but it was wrong. */
export class WrongPasswordError extends Error {
  constructor() {
    super("That password was incorrect.");
    this.name = "WrongPasswordError";
  }
}

// pdf.js raises a PasswordException with code 1 (need password) or 2 (incorrect).
const INCORRECT_PASSWORD = 2;

function isPasswordException(error: unknown): error is { name: string; code: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "PasswordException"
  );
}

/**
 * Open a PDF, transparently handling encryption. A file with an empty user
 * password opens with no prompt. A password-protected file rejects with
 * PasswordRequiredError (no/unknown password) or WrongPasswordError (a supplied
 * password was wrong), so the caller can prompt and retry.
 */
export async function openPdfDocument(
  bytes: Uint8Array,
  password?: string,
): Promise<PDFDocumentProxy> {
  try {
    return await getDocument({ data: bytes.slice(), password }).promise;
  } catch (error) {
    if (isPasswordException(error)) {
      throw error.code === INCORRECT_PASSWORD
        ? new WrongPasswordError()
        : new PasswordRequiredError();
    }
    throw error;
  }
}
