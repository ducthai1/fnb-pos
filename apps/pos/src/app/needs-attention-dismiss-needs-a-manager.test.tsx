import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { MINH, managerApproves, staffAsCashierAndManager } from "../test-support/approval-cafe";
import {
  SHOP_ACCOUNT,
  bankSettles,
  cafeServerWith,
  money,
  pushedOf,
  tap,
  twoCoffeesOnQr,
} from "../test-support/qr-cafe-server";
import { LAN, signedInTill } from "../test-support/signed-in-till";

const SETTLED_QR = "SYNC_ORDER_HAS_SETTLED_QR";
const entryWith = (code: string) => document.querySelector(`[data-rejected-code="${code}"]`);
const D = text.needsAttention.dismissal;

/** Cash refused over a paid QR, as the till of a cashier (not a manager) is left with it. */
async function cashierWithRefusedCash() {
  const server = staffAsCashierAndManager(
    cafeServerWith({ payment_account: SHOP_ACCOUNT }, [LAN, MINH]),
  );
  await signedInTill(server);
  await twoCoffeesOnQr(server);
  server.state.refuseTypes.set("payment.cancel_intent", "DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION");
  tap(text.qr.cancel);
  await screen.findByRole("heading", { name: text.checkout.payment.title });
  await waitFor(() => expect(pushedOf(server, "payment.cancel_intent")).toHaveLength(1));
  bankSettles(server, "paid", 58_000);
  server.state.refuseTypes.set("order.pay", SETTLED_QR);
  tap(text.checkout.payment.quickCash(money(100_000)));
  tap(text.checkout.payment.finish);
  await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
  fireEvent.click(await screen.findByRole("link", { name: text.sync.needsAttention(2) }));
  await screen.findByRole("heading", { name: text.needsAttention.title });
  return server;
}

/** The dismissal form of the refusal with `code`, filled in with a reason and words. */
async function fillDismissal(code: string) {
  const dismiss = entryWith(code)?.querySelector("button:last-of-type");
  if (dismiss === null || dismiss === undefined) throw new Error("no dismiss button");
  fireEvent.click(dismiss);
  await screen.findByRole("heading", { name: D.title });
  tap(text.reasons.handled_by_hand);
  fireEvent.change(screen.getByLabelText(text.adjust.reasonNote), {
    target: { value: "Đã hoàn tiền mặt cho khách, giữ khoản chuyển khoản" },
  });
  tap(D.confirm);
}

describe("setting aside a refused command that had money in it, as a cashier", () => {
  it("asks a manager to approve, names that order, and sends the approval with the trace", async () => {
    const server = await cashierWithRefusedCash();
    await fillDismissal(SETTLED_QR);
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toContain(
      text.approval.actions.dismissRefused("Thanh toán đơn", 1),
    );
    await managerApproves();
    await waitFor(() => expect(pushedOf(server, "sync.rejection_dismissed")).toHaveLength(1));
    const orderId = pushedOf(server, "order.pay")[0]?.payload.orderId;
    expect(server.state.calls.approvals[0]?.action).toEqual({
      key: "close_unpaid_table",
      subject: { orderId },
    });
    expect(pushedOf(server, "sync.rejection_dismissed")[0]?.payload).toMatchObject({
      rejectedType: "order.pay",
      orderId,
      approvalId: server.state.approvals[0]?.approvalId,
    });
    await waitFor(() => expect(entryWith(SETTLED_QR)).toBeNull());
  });

  it("finds the order of a QR taken down too late from the QR itself", async () => {
    const server = await cashierWithRefusedCash();
    await fillDismissal("DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION");
    await managerApproves();
    await waitFor(() => expect(pushedOf(server, "sync.rejection_dismissed")).toHaveLength(1));
    const orderId = pushedOf(server, "order.pay")[0]?.payload.orderId;
    expect(pushedOf(server, "sync.rejection_dismissed")[0]?.payload).toMatchObject({
      rejectedType: "payment.cancel_intent",
      orderId,
      approvalId: server.state.approvals[0]?.approvalId,
    });
  });

  it("records nothing when nobody approves, and stays on the form", async () => {
    const server = await cashierWithRefusedCash();
    await fillDismissal(SETTLED_QR);
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    await screen.findByRole("heading", { name: D.title });
    expect(pushedOf(server, "sync.rejection_dismissed")).toEqual([]);
    expect(server.state.calls.approvals).toEqual([]);
  });
});
