import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

// The native window-close confirm cannot be triggered headlessly, but it shares
// the in-app confirm dialog with the discard-on-open path, which we drive here.
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

/** Make an edit (draw a shape) so the model is dirty. */
async function makeDirty(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("#draw-menu").click();
  await page.locator("#shape-rectangle").click();
  const box = (await page.locator(".overlay").first().boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 140, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".overlay .shape")).toHaveCount(1);
}

test("opening another file with unsaved changes asks to confirm", async ({ page }) => {
  await makeDirty(page);
  await page.locator("#open").click();
  await expect(page.locator("#confirm-dialog")).toBeVisible();
});

test("cancelling the confirm keeps the document and its changes", async ({ page }) => {
  await makeDirty(page);
  await page.locator("#open").click();
  await page.locator("#confirm-cancel").click();
  await expect(page.locator("#confirm-dialog")).toBeHidden();
  await expect(page.locator(".overlay .shape")).toHaveCount(1);
});

test("confirming discard proceeds with the open and drops the changes", async ({ page }) => {
  await makeDirty(page);
  await page.locator("#open").click();
  await page.locator("#confirm-ok").click();
  await expect(page.locator("#confirm-dialog")).toBeHidden();
  // The fixture re-opened fresh, so the unsaved shape is gone.
  await expect(page.locator(".overlay .shape")).toHaveCount(0);
});

test("no confirm when there are no unsaved changes", async ({ page }) => {
  await page.locator("#open").click();
  await expect(page.locator("#confirm-dialog")).toBeHidden();
});
