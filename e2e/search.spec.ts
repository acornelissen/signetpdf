import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

// Drive the real app with Tauri's bridge mocked, then open a document.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((bytes) => {
    let listenId = 0;
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (cmd: string) => {
        if (cmd === "open_pdf") return { path: "/fixture.pdf", bytes };
        if (cmd === "plugin:event|listen") return (listenId += 1);
        return null;
      },
    };
  }, fixtureBytes);
  await page.goto("/");
  await page.locator("#empty-open").click();
  await page.waitForSelector(".textLayer span");
});

test("Custom Highlight API is available in this engine", async ({ page }) => {
  expect(await page.evaluate(() => typeof CSS !== "undefined" && "highlights" in CSS)).toBe(true);
});

test("finds matches across pages, counts them, and highlights the current one", async ({
  page,
}) => {
  // Reveal the find bar directly (the Cmd/Ctrl+F binding is platform-sensitive).
  await page.evaluate(() => {
    document.getElementById("search-bar")!.hidden = false;
  });
  await page.fill("#search-input", "Page");

  // "Page" appears once on each of the two pages.
  await expect(page.locator("#search-count")).toHaveText("1 of 2");

  // The current match (on the rendered page 1) is highlighted.
  const currentSize = await page.evaluate(() => CSS.highlights.get("search-current")?.size ?? 0);
  expect(currentSize).toBeGreaterThan(0);
});

test("reports when there are no results", async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById("search-bar")!.hidden = false;
  });
  await page.fill("#search-input", "zzzznotfound");
  await expect(page.locator("#search-count")).toHaveText("No results");
});

test("next advances the current match", async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById("search-bar")!.hidden = false;
  });
  await page.fill("#search-input", "Page");
  await page.locator("#search-next").click();
  await expect(page.locator("#search-count")).toHaveText("2 of 2");
});
