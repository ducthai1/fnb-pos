import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { counterWithManager, managerApproves, pushedOf, tap } from "../test-support/approval-cafe";
import { signedInTill } from "../test-support/signed-in-till";

const R = text.refund;
const COFFEE = "Cà phê sữa";
const money = (amount: number) => formatVnd(vnd(amount));
const row = (no: number) => document.querySelector<HTMLElement>(`[data-history-order="${no}"]`);

/** Two coffees paid in cash, then the history of the day. */
async function paidThenHistory(server: ReturnType<typeof counterWithManager>) {
  await signedInTill(server);
  tap(/^Cà phê sữa/);
  tap(text.sale.more(COFFEE));
  tap(/^Thêm vào đơn/);
  await screen.findByText(text.sale.orderNumber(1));
  tap(text.sale.checkout);
  await screen.findByRole("heading", { name: text.checkout.payment.title });
  tap(text.checkout.payment.quickCash(money(58_000)));
  tap(text.checkout.payment.finish);
  await screen.findByRole("heading", { name: text.checkout.done.title });
  tap(text.checkout.done.nextOrder);
  await screen.findByText(text.sale.orderNumber(2));
  tap(text.history.open);
  await screen.findByRole("heading", { name: text.history.title });
  await waitFor(() => expect(row(1)?.dataset.status).toBe("paid"));
}

async function refundOne() {
  tap(text.history.refund(1));
  await screen.findByRole("heading", { name: R.title(1) });
  tap(text.sale.more(COFFEE));
  // Money prints with a no-break space, which text matchers fold: read the element itself.
  const payout = document.querySelector("[data-refund-payout]");
  expect(payout?.getAttribute("data-refund-payout")).toBe("29000");
  expect(payout?.textContent).toBe(R.amount(money(29_000)));
  tap(text.reasons.customer_returned);
  tap(R.confirm(money(29_000)));
}

describe("refunding a paid sale from the day's history", () => {
  it("is reached only once the shift is open, so every refund pays out of a drawer", async () => {
    const server = counterWithManager();
    await signedInTill(server, { openShift: false });
    await screen.findByRole("button", { name: text.checkout.openShift.open });
    expect(screen.queryByRole("button", { name: text.history.open })).toBeNull();
    tap(text.checkout.openShift.open);
    await screen.findByRole("region", { name: text.sale.menuLabel });
    expect(screen.getByRole("button", { name: text.history.open })).toBeTruthy();
  });

  it("offers only cash for a sale the customer paid in cash", async () => {
    const server = counterWithManager();
    await paidThenHistory(server);
    tap(text.history.refund(1));
    await screen.findByRole("heading", { name: R.title(1) });
    expect(screen.getByRole("button", { name: R.methods.cash })).toBeTruthy();
    expect(screen.queryByRole("button", { name: R.methods.bank_transfer })).toBeNull();
  });

  it("gives back one of two coffees in cash from the drawer, with a manager's approval", async () => {
    const server = counterWithManager();
    await paidThenHistory(server);
    await refundOne();
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toBe(
      text.approval.actions.refund(money(29_000), 1),
    );
    await managerApproves();
    await screen.findByRole("heading", { name: R.doneTitle });
    await waitFor(() => expect(pushedOf(server, "order.refund")).toHaveLength(1));
    const shift = pushedOf(server, "shift.open")[0]?.payload as { shiftId: string };
    const pay = pushedOf(server, "order.pay")[0]?.payload as { orderId: string };
    const sale = server.rows.get(pay.orderId)?.lines as { id: string; lineType: string }[];
    expect(pushedOf(server, "order.refund")[0]?.payload).toEqual({
      refundOrderId: expect.any(String),
      saleOrderId: pay.orderId,
      deviceOrderNo: 3,
      lines: [
        {
          lineId: sale.find((line) => line.lineType === "item")?.id,
          quantity: "1",
          restock: false,
        },
      ],
      reasonCode: "customer_returned",
      payouts: [{ method: "cash", amount: -29_000 }],
      shiftId: shift.shiftId,
      approvalId: server.state.approvals[0]?.approvalId,
    });
    // The manager approved this payout of this sale, and nothing else.
    expect(server.state.calls.approvals[0]?.action).toEqual({
      key: "refund",
      refundAmount: "29000",
      subject: { orderId: pay.orderId },
    });
    // The refund's slip says what it is for, its amounts as the domain priced them.
    const slip = document.querySelector('[data-slip-kind="refund"] pre')?.textContent ?? "";
    expect(slip).toContain(R.slipHeading);
    expect(slip).toContain(R.slipFooter(1));
    tap(R.backToHistory);
    await waitFor(() => expect(row(1)?.dataset.status).toBe("refunded"));
    expect(row(1)?.textContent).toContain(text.history.refunded(money(29_000)));
  });

  it("records nothing when the manager is not asked after all", async () => {
    const server = counterWithManager();
    await paidThenHistory(server);
    await refundOne();
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    await screen.findByRole("heading", { name: R.title(1) });
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(5));
    expect(pushedOf(server, "order.refund")).toEqual([]);
  });

  it("refunds for a reason the list has no word for with the note the cashier wrote", async () => {
    const server = counterWithManager();
    server.state.grants.set(server.state.grants.keys().next().value!, [{ key: "refund" }]);
    await paidThenHistory(server);
    tap(text.history.refund(1));
    await screen.findByRole("heading", { name: R.title(1) });
    tap(text.sale.more(COFFEE));
    tap(text.reasons.other);
    expect(screen.getByRole("button", { name: R.confirm(money(29_000)) })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.change(screen.getByRole("textbox", { name: text.adjust.reasonNote }), {
      target: { value: "Khách dị ứng sữa, quên dặn" },
    });
    tap(R.confirm(money(29_000)));
    await screen.findByRole("heading", { name: R.doneTitle });
    await waitFor(() => expect(pushedOf(server, "order.refund")).toHaveLength(1));
    expect(pushedOf(server, "order.refund")[0]?.payload).toMatchObject({
      reasonCode: "other",
      reasonNote: "Khách dị ứng sữa, quên dặn",
    });
  });

  it("offers nothing more to refund once every unit came back", async () => {
    const server = counterWithManager();
    server.state.grants.set(server.state.grants.keys().next().value!, [{ key: "refund" }]);
    await paidThenHistory(server);
    tap(text.history.refund(1));
    await screen.findByRole("heading", { name: R.title(1) });
    tap(text.sale.more(COFFEE));
    tap(text.sale.more(COFFEE));
    expect(screen.getByRole("button", { name: text.sale.more(COFFEE) })).toHaveProperty(
      "disabled",
      true,
    );
    tap(text.reasons.made_wrong);
    tap(R.confirm(money(58_000)));
    await screen.findByRole("heading", { name: R.doneTitle });
    tap(R.backToHistory);
    await waitFor(() => expect(row(1)?.dataset.status).toBe("refunded"));
    tap(text.history.refund(1));
    expect(await screen.findByText(R.nothingLeft)).toBeTruthy();
    expect(screen.getByRole("button", { name: text.sale.more(COFFEE) })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
