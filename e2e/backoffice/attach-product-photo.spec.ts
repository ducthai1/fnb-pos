import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi as text } from "@fnb/backoffice/messages/vi";
import { newId } from "@fnb/db";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { readImageFacts } from "../../apps/api/src/media/image-format";
import { solidPng } from "../../apps/api/test/integration/support/sample-image-bytes";
import { asOwner, expectNoOverflow, signedInBackoffice, statusAfter, unexpectedProblems } from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const T = text.menuPhoto;
const SHOTS = fileURLToPath(new URL("../../tmp/product-photos", import.meta.url));
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

interface Stored {
  version: number;
  imageKey: string | null;
  imageUrl: string | null;
}

it("attaches a camera-sized photo to a product, shrunk to 800px WebP, and the branch's till is sent it", async () => {
  const id = newId();
  const brandId = await brandOf(stack.branchId);
  expect(
    (await asOwner(stack, "PUT", `/catalog/products/${id}`, {
      version: null,
      brandId,
      kind: "prepared_drink",
      name: "Cà phê sữa đá có ảnh",
      basePrice: 29_000,
      pricingMode: "fixed",
    })).status,
  ).toBe(201);

  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await page.goto(`${stack.backofficeOrigin}/menu/products/${id}`);
  const field = page.locator(".bo-photo-field");
  await field.waitFor();
  // A photo as a phone takes it, twice the size the tills need.
  const upload = page.waitForResponse((response) => response.url().endsWith("/api/media/product-images"));
  await field.getByLabel(T.choose).setInputFiles({ name: "IMG_2041.png", mimeType: "image/png", buffer: solidPng(1600, 1200, 9) });
  expect((await upload).status()).toBe(201);
  const preview = field.getByRole("img", { name: T.preview("Cà phê sữa đá có ảnh") });
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(800);
  expect(await statusAfter(page, `/catalog/products/${id}`, () => page.getByRole("button", { name: text.menu.editor.save }).click())).toBe(200);
  await page.getByText(text.menu.editor.saved).waitFor();
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, "backoffice-editor-with-photo.png") });
  await expectNoOverflow(page, "the editor with a photo");

  const stored = (await asOwner(stack, "GET", `/catalog/products/${id}`)).body as Stored;
  expect(stored.imageKey).toMatch(/^[0-9a-f]{64}\.webp$/);
  const served = await fetch(`${stack.apiOrigin}${stored.imageUrl}`);
  expect(served.status).toBe(200);
  expect(served.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  const facts = readImageFacts(new Uint8Array(await served.arrayBuffer()));
  expect(facts).toEqual({ extension: "webp", width: 800, height: 600 });

  // The list shows it small, and a till of the branch is sent its address.
  await page.goto(`${stack.backofficeOrigin}/menu`);
  const listed = page.getByRole("link", { name: text.menu.products.edit("Cà phê sữa đá có ảnh") }).locator("img");
  await expect.poll(() => listed.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(800);
  await page.screenshot({ path: join(SHOTS, "backoffice-product-list-with-photo.png") });
  const bootstrap = await fetch(`${stack.apiOrigin}/pos/bootstrap`, { headers: { authorization: `Device ${stack.deviceToken}` } });
  const { menu } = (await bootstrap.json()) as { menu: { products: { id: string; imageUrl?: string }[] } };
  expect(menu.products.find((product) => product.id === id)?.imageUrl).toBe(stored.imageUrl);
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});

async function brandOf(branchId: string): Promise<string> {
  const { branches } = (await asOwner(stack, "GET", "/branches")).body as {
    branches: { id: string; brandId: string }[];
  };
  const branch = branches.find((each) => each.id === branchId);
  if (branch === undefined) throw new Error("the stack's branch is not listed");
  return branch.brandId;
}
