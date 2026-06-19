import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];

// Drive the real app with Tauri's open_pdf mocked, then exercise the shape tool.
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

/** Arm a shape tool and drag a box on the first page, at a vertical offset. */
async function drawShape(
  page: import("@playwright/test").Page,
  toolId: string,
  top = 60,
): Promise<void> {
  await page.locator(toolId).click();
  const box = (await page.locator(".overlay").first().boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + top);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + top + 80, { steps: 10 });
  await page.mouse.up();
}

test("dragging the rectangle tool draws a stroked rectangle", async ({ page }) => {
  await drawShape(page, "#shape-rectangle");
  const shape = page.locator(".overlay .shape.shape-rectangle");
  await expect(shape).toHaveCount(1);
  await expect(shape.locator("rect")).toHaveCount(1);
});

test("each shape tool draws its kind", async ({ page }) => {
  await drawShape(page, "#shape-ellipse", 60);
  await expect(page.locator(".overlay .shape.shape-ellipse ellipse")).toHaveCount(1);

  await drawShape(page, "#shape-arrow", 260);
  // arrow = shaft + two head segments
  await expect
    .poll(() => page.locator(".overlay .shape.shape-arrow line").count())
    .toBeGreaterThanOrEqual(3);
});

test("a drawn shape can be deleted", async ({ page }) => {
  await drawShape(page, "#shape-rectangle");
  await expect(page.locator(".overlay .shape")).toHaveCount(1);
  await page.locator(".overlay .shape .shape-delete").click();
  await expect(page.locator(".overlay .shape")).toHaveCount(0);
});

test("a drawn shape can be moved by dragging its body", async ({ page }) => {
  await drawShape(page, "#shape-rectangle");
  const rect = page.locator(".overlay .shape.shape-rectangle");
  const before = (await rect.boundingBox())!;
  // Drag the stroke (top edge of the rect) sideways.
  await page.mouse.move(before.x + before.width / 2, before.y + 1);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + 41, { steps: 10 });
  await page.mouse.up();
  const after = (await rect.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 30);
  expect(after.y).toBeGreaterThan(before.y + 20);
});

test("a drawn shape can be resized by dragging a handle", async ({ page }) => {
  await drawShape(page, "#shape-rectangle");
  const rect = page.locator(".overlay .shape.shape-rectangle");
  const before = (await rect.boundingBox())!;
  const handle = rect.locator('.shape-handle[data-end="end"]');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 80, h.y + 60, { steps: 10 });
  await page.mouse.up();
  const after = (await rect.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 30);
});

test("turning fill on draws a filled rectangle", async ({ page }) => {
  await page.locator("#shape-fill").click(); // enable fill
  await expect(page.locator("#shape-fill")).toHaveAttribute("aria-pressed", "true");
  await drawShape(page, "#shape-rectangle");
  const rect = page.locator(".overlay .shape.shape-rectangle rect");
  await expect(rect).toHaveCount(1);
  expect(await rect.getAttribute("fill")).not.toBe("none"); // filled
});

test("a focused shape moves with the keyboard", async ({ page }) => {
  await drawShape(page, "#shape-rectangle");
  const rect = page.locator(".overlay .shape.shape-rectangle");
  await rect.focus();
  const before = (await rect.boundingBox())!;
  await page.keyboard.press("Shift+ArrowRight"); // 10pt move
  await page.keyboard.press("Shift+ArrowDown");
  const after = (await rect.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 4);
  expect(after.y).toBeGreaterThan(before.y + 4);
});

test("a tiny click (no drag) does not create a shape", async ({ page }) => {
  await page.locator("#shape-rectangle").click();
  const box = (await page.locator(".overlay").first().boundingBox())!;
  await page.mouse.click(box.x + 80, box.y + 80);
  await expect(page.locator(".overlay .shape")).toHaveCount(0);
});
