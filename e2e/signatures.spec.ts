import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/two-page.pdf", import.meta.url))),
];
const signatureBytes = [
  ...readFileSync(fileURLToPath(new URL("../fixtures/signature.png", import.meta.url))),
];

// Drive the real app with Tauri mocked; save_signature/list_signatures are
// backed by an in-memory store on window so the dialog's persist+reuse flow can
// be exercised in a real browser engine.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((bytes) => {
    let listenId = 0;
    const w = window as unknown as { __sigStore: { id: string; png: number[] }[] };
    w.__sigStore = [];
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (cmd: string, args?: { bytes?: number[] }) => {
        if (cmd === "open_pdf") return { path: "/fixture.pdf", bytes };
        if (cmd === "plugin:event|listen") {
          listenId += 1;
          return listenId;
        }
        if (cmd === "save_signature") {
          const id = String(w.__sigStore.length);
          w.__sigStore.push({ id, png: args?.bytes ?? [] });
          return id;
        }
        if (cmd === "list_signatures") {
          return w.__sigStore.map((s) => ({ id: s.id, png: s.png }));
        }
        return null;
      },
    };
  }, fixtureBytes);
  await page.goto("/");
  await page.locator("#empty-open").click();
  await page.waitForSelector(".textLayer span");
});

async function drawOnPad(page: import("@playwright/test").Page) {
  const pad = page.locator(".signature-pad");
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 8 });
  await page.mouse.up();
}

test("ticking Save for reuse persists the drawn signature", async ({ page }) => {
  await page.locator("#sign-tool").click();
  await expect(page.locator("#saved-signatures")).toBeHidden(); // none saved yet

  await drawOnPad(page);
  await page.locator("#signature-save").check();
  await page.locator("#signature-use").click();

  const stored = await page.evaluate(
    () => (window as unknown as { __sigStore: { png: number[] }[] }).__sigStore,
  );
  expect(stored).toHaveLength(1);
  expect(stored[0].png.length).toBeGreaterThan(0);
});

test("leaving Save for reuse unticked persists nothing", async ({ page }) => {
  await page.locator("#sign-tool").click();
  await drawOnPad(page);
  await page.locator("#signature-use").click();

  const stored = await page.evaluate(
    () => (window as unknown as { __sigStore: unknown[] }).__sigStore,
  );
  expect(stored).toHaveLength(0);
});

test("a saved signature can be picked and placed at a right-click point", async ({ page }) => {
  // Seed one saved signature (a real PNG so it rasterises back to a stamp).
  await page.evaluate((png) => {
    (window as unknown as { __sigStore: unknown[] }).__sigStore = [{ id: "seed", png }];
  }, signatureBytes);

  const pageBox = (await page.locator(".page-container").first().boundingBox())!;
  await page.mouse.click(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height / 2, {
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Add signature here", exact: true }).click();

  const thumb = page.locator(".saved-signature");
  await expect(thumb).toHaveCount(1);
  await thumb.click();

  await expect(page.locator('.stamp[data-annotation-kind="signature"]')).toHaveCount(1);
});

test("a placed signature moves with the keyboard once selected", async ({ page }) => {
  await page.evaluate((png) => {
    (window as unknown as { __sigStore: unknown[] }).__sigStore = [{ id: "seed", png }];
  }, signatureBytes);

  const pageBox = (await page.locator(".page-container").first().boundingBox())!;
  await page.mouse.click(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height / 2, {
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Add signature here", exact: true }).click();
  await page.locator(".saved-signature").click();

  const stamp = page.locator('.stamp[data-annotation-kind="signature"]');
  await stamp.click(); // select (focus the container)
  await expect(stamp).toBeFocused();

  const start = (await stamp.boundingBox())!;
  await page.keyboard.press("Shift+ArrowRight");
  const moved = (await stamp.boundingBox())!;
  expect(moved.x).toBeGreaterThan(start.x + 5);
});
