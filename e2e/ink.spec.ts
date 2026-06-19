import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

// Drive the real app with Tauri's open_pdf mocked, then exercise the ink tool.
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

/** Arm the pen and drag a freehand path across the first page. */
async function drawInk(page: import("@playwright/test").Page, top = 80): Promise<void> {
  await page.locator("#draw-menu").click();
  await page.locator("#ink-tool").click();
  const box = (await page.locator(".overlay").first().boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + top);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + top + 40, { steps: 8 });
  await page.mouse.move(box.x + 180, box.y + top - 10, { steps: 8 });
  await page.mouse.up();
}

test("dragging the pen draws a freehand ink stroke", async ({ page }) => {
  await drawInk(page);
  const ink = page.locator(".overlay .ink");
  await expect(ink).toHaveCount(1);
  await expect(ink.locator("polyline")).toHaveCount(1);
});

test("an ink stroke can be deleted", async ({ page }) => {
  await drawInk(page);
  await expect(page.locator(".overlay .ink")).toHaveCount(1);
  await page.locator(".overlay .ink .ink-delete").click();
  await expect(page.locator(".overlay .ink")).toHaveCount(0);
});

test("an ink stroke can be moved by dragging it", async ({ page }) => {
  await drawInk(page, 80);
  const ink = page.locator(".overlay .ink");
  const before = (await ink.boundingBox())!;
  const overlay = (await page.locator(".overlay").first().boundingBox())!;
  // Press on a vertex of the drawn path (overlay-relative 110,120) and drag.
  await page.mouse.move(overlay.x + 110, overlay.y + 120);
  await page.mouse.down();
  await page.mouse.move(overlay.x + 180, overlay.y + 180, { steps: 10 });
  await page.mouse.up();
  const after = (await ink.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 20);
});

test("a focused ink stroke moves with the keyboard", async ({ page }) => {
  await drawInk(page);
  const ink = page.locator(".overlay .ink");
  await ink.focus();
  const before = (await ink.boundingBox())!;
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  const after = (await ink.boundingBox())!;
  expect(after.y).toBeGreaterThan(before.y + 4);
});

test("a single click (no drag) draws nothing", async ({ page }) => {
  await page.locator("#draw-menu").click();
  await page.locator("#ink-tool").click();
  const box = (await page.locator(".overlay").first().boundingBox())!;
  await page.mouse.click(box.x + 90, box.y + 90);
  await expect(page.locator(".overlay .ink")).toHaveCount(0);
});
