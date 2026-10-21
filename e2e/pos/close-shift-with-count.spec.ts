import { newId } from "@fnb/db";
import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { backoffice, putProduct } from "./support/backoffice-calls";
import { approvalsOfTill, cashMovesOfShift, shiftsOfTill } from "./support/operation-records";
import { approvalAskedFor, managerApproves, managerAt } from "./support/staff-and-approvals";
import {
  dataOf,
  expectNoOverflow,
  openShift,
  pairedTillWithCashier,
} from "./support/till-in-browser";
import { onceTheServerHasIt } from "./support/once-the-server-has-it";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 2 });
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await pool.end();
});

const ids = { bar: newId(), juice: newId() };
const JUICE = "Nước cam đóng ca";
const MANAGER = "Quản lý đóng ca";
const PIN = "1357";
const C = text.cash;
const T = text.closeShift;
const A = text.approval.actions;
const money = (amount: number) => formatVnd(vnd(amount));
const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

async function setUpShop() {
  const station = { version: null, branchId: stack.branchId, name: "Bar đóng ca" };
  await backoffice(stack, "PUT", `/catalog/stations/${ids.bar}`, station, 201);
  const juice = {
    kind: "prepared_drink",
    pricingMode: "fixed",
    taxRateBp: 800,
    stationId: ids.bar,
  };
  await putProduct(stack, ids.juice, { ...juice, name: JUICE, basePrice: 30_000 }, null);
  await managerAt(stack, stack.branchId, MANAGER, PIN);
}

async function moveCash(page: Page, kind: "in" | "out", amount: number, reason: string) {
  await button(page, kind === "in" ? C.in : C.out).click();
  await page.getByLabel(C.amount).fill(String(amount));
  await page.getByLabel(C.reason).fill(reason);
  await button(page, C.confirm(kind, money(amount))).click();
}

it("moves cash in and out, closes a short drawer with a manager, the server keeping the difference", async () => {
  await setUpShop();
  const till = await pairedTillWithCashier(browser!, stack, "Thu ngân đóng ca");
  const { page } = till;
  await openShift(page, [money(500_000)]);
  await button(page, new RegExp(`^${JUICE}`)).click();
  await button(page, text.sale.checkout).click();
  await button(page, text.checkout.payment.quickCash(money(30_000))).click();
  await button(page, text.checkout.payment.finish).click();
  await page.getByRole("heading", { name: text.checkout.done.title }).waitFor();
  await button(page, text.checkout.done.nextOrder).click();

  // 50.000 out is within the cashier's 500.000; 480.000 in makes 530.000 moved: a manager.
  await button(page, C.open).click();
  await page.getByRole("heading", { name: C.title }).waitFor();
  await moveCash(page, "out", 50_000, "Trả tiền đá");
  await page.getByText(C.done("out", money(50_000))).waitFor();
  await moveCash(page, "in", 480_000, "Đổi tiền lẻ");
  expect(await approvalAskedFor(page)).toBe(
    `${A.cashIn(money(480_000))} (${A.cashInShift(money(530_000))})`,
  );
  expect(await managerApproves(page, MANAGER, PIN)).toBe(201);
  await page.getByText(C.done("in", money(480_000))).waitFor();
  await expectNoOverflow(page, "cash move");
  await button(page, C.back).click();

  // 500.000 + 30.000 − 50.000 + 480.000 should be there; 950.000 is.
  await button(page, T.open).click();
  await page.getByRole("heading", { name: T.title }).waitFor();
  await expect.poll(() => dataOf(page, "expected")).toBe("960000");
  for (const note of [500_000, 200_000, 200_000, 50_000]) {
    await button(page, text.checkout.openShift.addNote(money(note))).click();
  }
  expect(await dataOf(page, "difference")).toBe("-10000");
  await expectNoOverflow(page, "close shift");
  await button(page, T.confirm).click();
  expect(await approvalAskedFor(page)).toBe(A.closeDifference(money(-10_000)));
  expect(await managerApproves(page, MANAGER, PIN)).toBe(201);
  await page.getByRole("heading", { name: T.doneTitle }).waitFor();
  await page.locator("[data-slip-kind='shift_report'][data-print-status='printed']").waitFor();
  await button(page, T.openNext).click();
  await page.getByRole("heading", { name: text.checkout.openShift.title }).waitFor();
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });

  await onceTheServerHasIt(async () =>
    (await shiftsOfTill(pool, stack.tenantId, till.deviceId)).map((shift) => shift.status),
  ).toEqual(["closed"]);
  const [shift, ...others] = await shiftsOfTill(pool, stack.tenantId, till.deviceId);
  expect(others).toEqual([]);
  expect(shift).toMatchObject({
    status: "closed",
    counted_cash: "950000",
    expected_cash: "960000",
    difference: "-10000",
  });
  expect(shift?.close_approval_id).not.toBeNull();
  const moves = await cashMovesOfShift(pool, stack.tenantId, shift!.id);
  expect(moves.map(({ kind, amount, reason }) => ({ kind, amount, reason }))).toEqual([
    { kind: "out", amount: "50000", reason: "Trả tiền đá" },
    { kind: "in", amount: "480000", reason: "Đổi tiền lẻ" },
  ]);
  expect(moves.map((move) => move.approval_id === null)).toEqual([true, false]);
  // Both approvals are for this shift, and for the figures the manager was shown.
  const subject = { shiftId: shift!.id };
  expect(await approvalsOfTill(pool, stack.tenantId, till.deviceId)).toEqual([
    { action_key: "cash_move", payload: { amount: "530000", subject }, used: true },
    {
      action_key: "accept_close_difference",
      payload: { difference: "-10000", subject },
      used: true,
    },
  ]);
  expect(till.problems).toEqual([]);
  await till.close();
});
