import { vi as text } from "@fnb/pos/messages/vi";
import { HOSTILE_NAMES } from "@fnb/pos/test-support/hostile-names";
import { measureScreenOverflow } from "@fnb/pos/test-support/measure-screen-overflow";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { watchPageProblems } from "../support/page-problems";

const stack = inject("posStack");
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** A backoffice call as the shop's owner, which must answer 201. */
async function backoffice(path: string, body: object): Promise<Record<string, string>> {
  const response = await fetch(`${stack.apiOrigin}${path}`, {
    method: "POST",
    headers: { cookie: stack.managerCookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status, `${path}: ${await response.clone().text()}`).toBe(201);
  return (await response.json()) as Record<string, string>;
}

/** Clicks and returns the HTTP status of the first answer from `path` that follows. */
async function statusAfter(page: Page, path: string, click: () => Promise<void>) {
  const answered = page.waitForResponse((response) => response.url().endsWith(`/api${path}`));
  await click();
  return (await answered).status();
}

const tapPin = async (page: Page, pin: string) => {
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
};

/** The screen fits at phone width and at tablet width, measured on the element that scrolls. */
async function expectNoOverflow(page: Page) {
  for (const width of [360, 800]) {
    await page.setViewportSize({ width, height: 740 });
    const overflow = await measureScreenOverflow(page);
    expect(overflow, `at ${width}px`).toMatchObject({
      scrollerExcess: 0,
      pageExcess: 0,
      outside: [],
    });
  }
  await page.setViewportSize({ width: 360, height: 740 });
}

it("pairs a till with a code from the backoffice, refuses a wrong PIN, and signs the cashier in", async () => {
  const cashier = { displayName: HOSTILE_NAMES.staff, pin: "5937" };
  await backoffice("/staff", { ...cashier, roleId: stack.roleId, branchIds: [stack.branchId] });
  const { code } = await backoffice("/devices/pairing-codes", { branchId: stack.branchId });
  const context = await browser!.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  const problems = watchPageProblems(page);

  await page.goto(stack.posOrigin);
  // index.html holds an empty #root: this field exists only once React rendered the pairing
  // screen, which it does only after the till's database opened in its Worker.
  const codeField = page.getByLabel(text.pairing.codeLabel);
  await codeField.fill(`${code!.slice(0, 4)}-${code!.slice(4)}`.toLowerCase());
  const pair = page.getByRole("button", { name: text.pairing.submit });
  expect(await statusAfter(page, "/devices/pair", () => pair.click())).toBe(201);

  const cashierButton = page.getByRole("button", { name: cashier.displayName });
  await cashierButton.waitFor();
  await expectNoOverflow(page);
  await cashierButton.click();

  await tapPin(page, "1357");
  const submit = page.getByRole("button", { name: text.staff.submit });
  expect(await statusAfter(page, "/pos/staff-sessions", () => submit.click())).toBe(401);
  await expect
    .poll(() => page.getByRole("alert").textContent())
    .toBe(text.errors.API_STAFF_PIN_INVALID);
  await expectNoOverflow(page);

  await tapPin(page, cashier.pin);
  expect(await statusAfter(page, "/pos/staff-sessions", () => submit.click())).toBe(201);
  await page.getByRole("heading", { name: text.sales.title }).waitFor();
  await page.getByText(text.sales.signedInAs(cashier.displayName)).waitFor();
  // Online only once a sync pass really got an answer from the API.
  await page.getByText(text.sync.online).waitFor();
  await expectNoOverflow(page);

  // Paired for good: a reload opens the same till's database and goes to the staff list.
  await page.reload();
  await cashierButton.waitFor();
  expect(await page.getByLabel(text.pairing.codeLabel).count()).toBe(0);

  const wrongPin = (problem: { url: string; text: string }) =>
    problem.url.endsWith("/api/pos/staff-sessions") && problem.text.includes("401");
  expect(problems.filter((problem) => !wrongPin(problem))).toEqual([]);
  expect(problems.filter(wrongPin).length).toBeGreaterThan(0);
  await context.close();
});
