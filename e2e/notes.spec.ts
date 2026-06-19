import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

// Drive the real app with Tauri's open_pdf mocked, then exercise the sticky-note
// tool in a real browser engine.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((bytes) => {
    let listenId = 0;
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (cmd: string) => {
        if (cmd === "open_pdf") return { path: "/fixture.pdf", bytes };
        if (cmd === "plugin:event|listen") {
          listenId += 1;
          return listenId;
        }
        return null;
      },
    };
  }, fixtureBytes);
  await page.goto("/");
  await page.locator("#empty-open").click();
  await page.waitForSelector(".textLayer span");
});

/** Arm the note tool and drop a note near the top-left of the first page. */
async function dropNote(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("#note-tool").click();
  const overlay = page.locator(".overlay").first();
  const box = (await overlay.boundingBox())!;
  await page.mouse.click(box.x + 80, box.y + 80);
}

test("dropping a note opens its popup ready for a comment", async ({ page }) => {
  await dropNote(page);
  const note = page.locator(".overlay .note");
  await expect(note).toHaveCount(1);
  await expect(note).toHaveClass(/open/);
  await expect(note.locator(".note-text")).toBeFocused();
});

test("a note's comment can be typed, then re-read after reopening the popup", async ({ page }) => {
  await dropNote(page);
  const note = page.locator(".overlay .note");
  await note.locator(".note-text").fill("verify the totals");
  await note.locator(".note-icon").click(); // close
  await expect(note).not.toHaveClass(/open/);
  await note.locator(".note-icon").click(); // reopen
  await expect(note.locator(".note-text")).toHaveValue("verify the totals");
});

test("dragging the pin moves the note without opening the popup", async ({ page }) => {
  await dropNote(page);
  const note = page.locator(".overlay .note");
  const pin = note.locator(".note-icon");
  const before = (await pin.boundingBox())!;
  await pin.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + 90, before.y + 70, { steps: 8 });
  await page.mouse.up();
  const after = (await pin.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 40);
  await expect(note).not.toHaveClass(/open/); // a drag, not a toggle
});

test("a focused note moves with the keyboard", async ({ page }) => {
  await dropNote(page);
  const pin = page.locator(".overlay .note .note-icon");
  await pin.focus();
  const before = (await pin.boundingBox())!;
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  const after = (await pin.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 4);
});

test("a note can be deleted from its popup", async ({ page }) => {
  await dropNote(page);
  await expect(page.locator(".overlay .note")).toHaveCount(1);
  await page.locator(".overlay .note .note-delete").click();
  await expect(page.locator(".overlay .note")).toHaveCount(0);
});
