import { vi as text } from "@fnb/backoffice/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import {
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  statusAfter,
  unexpectedProblems,
} from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const T = text.devices;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

it("pairs a till with a code made in the backoffice, lists it, and revokes it", async () => {
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.devices);
  await page.getByRole("heading", { name: T.title }).waitFor();

  const create = page.getByRole("button", { name: T.createCode });
  expect(await statusAfter(page, "/devices/pairing-codes", () => create.click())).toBe(201);
  const shown = page.locator("[data-pairing-code]");
  const code = (await shown.getAttribute("data-pairing-code")) ?? "";
  expect(code).toMatch(/^[A-Z0-9]{8}$/);
  expect(await page.getByText(/Dùng một lần, hết hạn lúc \d\d:\d\d\./).count()).toBe(1);
  await expectNoOverflow(page, "devices with a code");

  // The till types the code, the way the POS does, with a dash and in lower case.
  const tillName = "Quầy pha chế tầng 2";
  const paired = await fetch(`${stack.apiOrigin}/devices/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase(), deviceName: tillName }),
  });
  expect(paired.status).toBe(201);
  const { deviceToken } = (await paired.json()) as { deviceToken: string };

  // The list refreshes itself while the code is live: nobody reloads the page.
  const revoke = page.getByRole("button", { name: T.revokeLabel(tillName) });
  await revoke.waitFor({ timeout: 15_000 });
  await revoke.click();
  const confirm = page.getByRole("alertdialog", { name: T.revokeTitle(tillName) });
  await confirm.waitFor();
  const confirmButton = confirm.getByRole("button", { name: T.revokeConfirm });
  expect(await statusAfter(page, `/devices/${await deviceIdOf(page, tillName)}/revoke`, () => confirmButton.click())).toBe(204);
  await page.getByText(T.revokedDone(tillName)).waitFor();
  await expect.poll(() => page.getByRole("button", { name: T.revokeLabel(tillName) }).count()).toBe(0);

  // Revoked for real: the till's token no longer opens anything.
  const me = await fetch(`${stack.apiOrigin}/devices/me`, { headers: { authorization: `Device ${deviceToken}` } });
  expect(me.status).toBe(401);
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});

async function deviceIdOf(page: import("playwright-core").Page, name: string): Promise<string> {
  const row = page.locator("tr[data-device-id]", { hasText: name });
  return (await row.getAttribute("data-device-id")) ?? "";
}
