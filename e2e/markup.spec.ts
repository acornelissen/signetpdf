import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

// Drive the real app with Tauri's open_pdf mocked, then exercise the markup tool
// against a real text selection in a real browser engine.
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

/** Drag-select the first line of text on the page. */
async function selectFirstLine(page: import("@playwright/test").Page): Promise<void> {
  const span = page.locator(".textLayer span").first();
  const box = (await span.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected.trim().length).toBeGreaterThan(0);
}

/** Open the Highlight popover and apply the given markup style to the selection. */
async function applyMarkup(
  page: import("@playwright/test").Page,
  style: "highlight" | "underline" | "strikethrough",
): Promise<void> {
  await page.locator("#highlight-menu").click();
  await page.locator(`#markup-${style}`).click();
}

test("highlighting a selection paints a markup over the page", async ({ page }) => {
  await selectFirstLine(page);
  await applyMarkup(page, "highlight");

  const markup = page.locator(".overlay .markup.markup-highlight");
  await expect(markup).toHaveCount(1);
  await expect(markup.locator(".markup-quad")).not.toHaveCount(0);
});

test("underline and strikethrough each add their own markup", async ({ page }) => {
  await selectFirstLine(page);
  await applyMarkup(page, "underline");
  await expect(page.locator(".overlay .markup.markup-underline")).toHaveCount(1);

  await selectFirstLine(page);
  await applyMarkup(page, "strikethrough");
  await expect(page.locator(".overlay .markup.markup-strikethrough")).toHaveCount(1);
});

test("a painted markup can be deleted from the overlay", async ({ page }) => {
  await selectFirstLine(page);
  await applyMarkup(page, "highlight");
  await expect(page.locator(".overlay .markup")).toHaveCount(1);

  await page.locator(".overlay .markup .markup-delete").click();
  await expect(page.locator(".overlay .markup")).toHaveCount(0);
});
