import { newId } from "@fnb/db";
import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { backoffice, putProduct } from "./support/backoffice-calls";
import {
  approvalsOfTill,
  cashPaymentsOfShift,
  refundsOfSale,
  ticketLinesOfOrder,
  voidsOfOrder,
} from "./support/operation-records";
import { openShiftIdOfTill, salesOfTill } from "./support/server-records";
import {
  approvalAskedFor,
  managerApproves,
  managerAt,
  otherBranchOf,
} from "./support/staff-and-approvals";
import { floorOf } from "./support/table-records";
import {
  dataOf,
  expectNoOverflow,
  openShift,
  pairedTillWithCashier,
} from "./support/till-in-browser";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 2 });
let browser: Browser | undefined;
// This spec serves at tables in the shop's second branch, so switching tables on there
// never changes what the other specs' tills (all in the first branch) show.
let branchId = "";
const tablesSetting = () => `/settings/branch/${branchId}/tables`;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  if (branchId !== "")
    await backoffice(stack, "DELETE", tablesSetting(), {}, 200).catch(console.error);
  await browser?.close();
  await pool.end();
});

const ids = {
  bar: newId(),
  drink: newId(),
  sizeM: newId(),
  sizeL: newId(),
  area: newId(),
  tables: [newId()],
};
const DRINK = "Bạc xỉu duyệt";
const MANAGER = "Quản lý duyệt tại chỗ";
const PIN = "2468";
const A = text.approval.actions;
const money = (amount: number) => formatVnd(vnd(amount));
const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

async function setUpShop() {
  branchId = await otherBranchOf(pool, stack);
  await backoffice(stack, "PUT", tablesSetting(), { value: true }, 200);
  await backoffice(
    stack,
    "PUT",
    `/catalog/stations/${ids.bar}`,
    { version: null, branchId, name: "Bar duyệt" },
    201,
  );
  const drink = {
    kind: "prepared_drink",
    pricingMode: "fixed",
    taxRateBp: 800,
    stationId: ids.bar,
  };
  const variants = [
    { id: ids.sizeM, name: "M" },
    { id: ids.sizeL, name: "L", price: 35_000 },
  ];
  await putProduct(stack, ids.drink, { ...drink, name: DRINK, basePrice: 29_000, variants }, null);
  await floorOf(stack, ids, "Tầng duyệt", ["D1"], branchId);
  await managerAt(stack, branchId, MANAGER, PIN);
}

/** Two of the drink in `size` on the order on screen. */
async function twoOf(page: Page, size: "M" | "L") {
  await button(page, new RegExp(`^${DRINK}`)).click();
  await button(page, size).click();
  await button(page, text.sale.more(DRINK)).click();
  await button(page, /^Thêm vào đơn/).click();
}

async function payCash(page: Page, amount: number) {
  // The counter's checkout and a table's pay button read the same.
  await button(page, text.sale.checkout).click();
  await page.getByRole("heading", { name: text.checkout.payment.title }).waitFor();
  await button(page, text.checkout.payment.quickCash(money(amount))).click();
  await button(page, text.checkout.payment.finish).click();
  await page.getByRole("heading", { name: text.checkout.done.title }).waitFor();
}

it("gives 20% off with a manager's PIN, voids a cup the bar has, refunds half a sale in cash", async () => {
  await setUpShop();
  const till = await pairedTillWithCashier(browser!, stack, "Thu ngân duyệt", branchId);
  const { page } = till;
  await openShift(page, [money(500_000)]);

  // The cashier may give 10% off an item alone: 20% needs the manager.
  await twoOf(page, "L");
  await expect.poll(() => dataOf(page, "amount-due")).toBe("70000");
  const tall = `${DRINK} (L)`;
  await button(page, text.adjust.tools.discount(tall)).click();
  await button(page, text.adjust.discount.percentPreset("20%")).click();
  await button(page, text.adjust.discount.confirm).click();
  expect(await approvalAskedFor(page)).toBe(A.lineDiscountRate("20%", tall));
  await expectNoOverflow(page, "approval sheet");
  expect(await managerApproves(page, MANAGER, PIN)).toBe(201);
  await expect.poll(() => dataOf(page, "amount-due")).toBe("56000");
  await payCash(page, 56_000);
  await button(page, text.checkout.done.nextOrder).click();

  // At a table: two to the bar, then one of them cancelled, with a ticket for the bar.
  await button(page, text.tables.modes.tables).click();
  await page.locator(`[data-table="${ids.tables[0]}"]`).click();
  await page.getByRole("heading", { name: text.tables.order.title("D1") }).waitFor();
  await twoOf(page, "M");
  await button(page, text.tables.order.sendToKitchen(2)).click();
  await page.locator("[data-print-status='printed']").first().waitFor();
  await button(page, text.tables.slips.backToOrder).click();
  const small = `${DRINK} (M)`;
  await button(page, text.adjust.tools.void(small)).click();
  await page.getByRole("heading", { name: text.adjust.void.title }).waitFor();
  await button(page, text.reasons.made_wrong).click();
  await button(page, text.adjust.void.confirm(1)).click();
  expect(await approvalAskedFor(page)).toBe(A.voidAfterSent(1, small));
  expect(await managerApproves(page, MANAGER, PIN)).toBe(201);
  await page.getByRole("heading", { name: text.adjust.void.cancelTicketTitle }).waitFor();
  await page.locator("[data-slip-kind='kitchen'][data-print-status='printed']").waitFor();
  expect(await page.locator("[data-slip-kind='kitchen'] pre").textContent()).toContain("HỦY");
  await button(page, text.tables.slips.backToOrder).click();
  await expect.poll(() => dataOf(page, "amount-due")).toBe("29000");
  await payCash(page, 29_000);
  await button(page, text.tables.order.backToFloor).click();
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });

  const [sale, tableOrder] = await salesOfTill(pool, stack.tenantId, till.deviceId);
  expect(sale).toMatchObject({ status: "paid", paid: 56_000n });
  expect(tableOrder).toMatchObject({ status: "paid", paid: 29_000n });
  expect(await voidsOfOrder(pool, stack.tenantId, tableOrder!.id)).toEqual([
    expect.objectContaining({
      from_sent: "1.000",
      from_unsent: "0.000",
      reason_code: "made_wrong",
    }),
  ]);
  expect((await voidsOfOrder(pool, stack.tenantId, tableOrder!.id))[0]?.approval_id).not.toBeNull();
  expect(await ticketLinesOfOrder(pool, stack.tenantId, tableOrder!.id)).toEqual([
    { kind: "new", quantity: "2.000" },
    { kind: "cancel", quantity: "1.000" },
  ]);

  // One of the two L comes back: half of what the sale charged, out of the drawer.
  const [shiftId] = await openShiftIdOfTill(pool, stack.tenantId, till.deviceId);
  const before = await cashPaymentsOfShift(pool, stack.tenantId, shiftId!);
  await button(page, text.tables.modes.counter).click();
  await button(page, text.history.open).click();
  await button(page, text.history.refund(1)).click();
  await page.getByRole("heading", { name: text.refund.title(1) }).waitFor();
  await button(page, text.sale.more(tall)).click();
  await expect.poll(() => dataOf(page, "refund-payout")).toBe("28000");
  await button(page, text.reasons.customer_returned).click();
  await expectNoOverflow(page, "refund");
  await button(page, text.refund.confirm(money(28_000))).click();
  expect(await approvalAskedFor(page)).toBe(A.refund(money(28_000), 1));
  expect(await managerApproves(page, MANAGER, PIN)).toBe(201);
  await page.getByRole("heading", { name: text.refund.doneTitle }).waitFor();
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });

  expect(await refundsOfSale(pool, stack.tenantId, sale!.id)).toEqual([
    expect.objectContaining({ status: "paid", paid: -28_000n, shift_id: shiftId }),
  ]);
  expect((await cashPaymentsOfShift(pool, stack.tenantId, shiftId!)) - before).toBe(-28_000n);
  expect(await approvalsOfTill(pool, stack.tenantId, till.deviceId)).toEqual([
    { action_key: "line_discount", payload: { discountRate: 2000 }, used: true },
    { action_key: "void_after_sent", payload: {}, used: true },
    { action_key: "refund", payload: {}, used: true },
  ]);
  expect(till.problems).toEqual([]);
  await till.close();
});
