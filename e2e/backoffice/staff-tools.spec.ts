import { vi as text } from "@fnb/backoffice/messages/vi";
import { HOSTILE_NAMES } from "@fnb/pos/test-support/hostile-names";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import {
  asOwner,
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  statusAfter,
  unexpectedProblems,
} from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const K = text.staffTools;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** As long as each field takes, with no space to wrap at; its own, as specs share the stack. */
const STAFF_NAME = `${HOSTILE_NAMES.staff}`.slice(0, 70) + "Khóa";
const ROLE_NAME = "VaiTròCaĐêmPhaChếKiêmThuNgânChiNhánhQuậnMộtKhôngKhoảngTrắngNàoCả".slice(0, 80);

it("locks, lets back, re-PINs someone with the worst name, and lists who holds a role, on a phone", async () => {
  const role = await asOwner(stack, "POST", "/roles", {
    name: ROLE_NAME,
    permissionKeys: ["open_drawer"],
    thresholds: {},
  });
  expect(role.status).toBe(201);
  const roleId = (role.body as { roleId: string }).roleId;
  const hired = await asOwner(stack, "POST", "/staff", {
    displayName: STAFF_NAME,
    roleId,
    pin: "4826",
    branchIds: [stack.branchId],
  });
  expect(hired.status).toBe(201);
  const staffId = (hired.body as { staffId: string }).staffId;

  const { page, problems, close } = await signedInBackoffice(browser!, stack, {
    width: 360,
    height: 900,
  });
  await openSection(page, text.shell.nav.staff);
  const row = page.locator(`tr[data-staff="${staffId}"]`);
  await row.getByRole("button", { name: K.lockLabel(STAFF_NAME) }).click();
  const panel = page.locator(`tr[data-staff-tool="${staffId}"]`).getByRole("alertdialog");
  await expectNoOverflow(page, "the lock confirmation");
  await page.setViewportSize({ width: 360, height: 900 });
  expect(
    await statusAfter(page, `/staff/${staffId}/deactivate`, () =>
      panel.getByRole("button", { name: K.lock }).click(),
    ),
  ).toBe(204);
  await page
    .getByRole("status")
    .filter({ hasText: K.locked(STAFF_NAME) })
    .waitFor();
  await row.getByRole("button", { name: K.reopenLabel(STAFF_NAME) }).click();
  expect(
    await statusAfter(page, `/staff/${staffId}/reactivate`, () =>
      panel.getByRole("button", { name: K.reopen }).click(),
    ),
  ).toBe(204);
  await row.getByRole("button", { name: K.resetPinLabel(STAFF_NAME) }).click();
  await panel.getByLabel(K.newPinLabel).fill("7391");
  expect(
    await statusAfter(page, `/staff/${staffId}/pin`, () =>
      panel.getByRole("button", { name: K.resetPin }).click(),
    ),
  ).toBe(204);
  await page
    .getByRole("status")
    .filter({ hasText: K.pinReset(STAFF_NAME) })
    .waitFor();
  await expectNoOverflow(page, "the staff list after the tools");

  await page.setViewportSize({ width: 360, height: 900 });
  await openSection(page, text.shell.nav.roles);
  await page.getByRole("button", { name: K.archiveLabel(ROLE_NAME) }).click();
  const archive = page.getByRole("alertdialog", { name: K.archiveTitle(ROLE_NAME) });
  expect(
    await statusAfter(page, `/roles/${roleId}/archive`, () =>
      archive.getByRole("button", { name: K.archive }).click(),
    ),
  ).toBe(409);
  await archive.getByText(K.staffHolder(STAFF_NAME, true)).waitFor();
  await expectNoOverflow(page, "the holders of a role");

  // The archive's refusal is the one 4xx this walk asks for.
  const refusal = (p: { url: string; text: string }) =>
    p.url.endsWith(`/api/roles/${roleId}/archive`) && /409/.test(p.text);
  expect(unexpectedProblems(problems).filter((p) => !refusal(p))).toEqual([]);
  await close();
});
