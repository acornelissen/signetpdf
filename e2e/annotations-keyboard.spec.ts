import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

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

// Create a text box with the text tool; it opens focused for editing.
async function createTextBox(page: import("@playwright/test").Page) {
  await page.locator("#text-tool").click();
  const pageBox = (await page.locator(".page-container").first().boundingBox())!;
  await page.mouse.click(pageBox.x + 160, pageBox.y + 160);
  await expect(page.locator(".text-box")).toHaveCount(1);
}

test("Escape leaves editing for the selected state", async ({ page }) => {
  await createTextBox(page);
  await expect(page.locator(".text-box-input")).toBeFocused(); // editing
  await page.locator(".text-box-input").press("Escape");
  await expect(page.locator(".text-box")).toBeFocused(); // selected, not editing
});

test("a selected text box moves and resizes with the keyboard", async ({ page }) => {
  await createTextBox(page);
  const tb = page.locator(".text-box");
  await page.locator(".text-box-input").press("Escape");
  await expect(tb).toBeFocused();

  const start = (await tb.boundingBox())!;
  await page.keyboard.press("Shift+ArrowRight"); // 10pt move
  const moved = (await tb.boundingBox())!;
  expect(moved.x).toBeGreaterThan(start.x + 5);

  const widthBefore = moved.width;
  await page.keyboard.press("Alt+Shift+ArrowRight"); // 10pt resize
  const resized = (await tb.boundingBox())!;
  expect(resized.width).toBeGreaterThan(widthBefore + 5);
});

test("arrow keys move the caret while editing, leaving the box put", async ({ page }) => {
  await createTextBox(page);
  const input = page.locator(".text-box-input");
  await input.fill("hello"); // still editing
  const tb = page.locator(".text-box");
  const before = (await tb.boundingBox())!;
  await input.press("ArrowLeft");
  const after = (await tb.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
});
