import { ROLE_TEMPLATES, type Vnd, vnd } from "@fnb/domain";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { MINH, MINH_PIN, managerApproves } from "../test-support/approval-cafe";
import {
  SHOP_ACCOUNT,
  bankSettles,
  cafeServerWith,
  money,
  pushedOf,
  qrPhaseShown,
  tap,
  twoCoffeesOnQr,
} from "../test-support/qr-cafe-server";
import { LAN, signedInTill } from "../test-support/signed-in-till";

const Q = text.qr;

/** The QR café with Minh to approve and Lan moving up to `alone` of cash a shift by herself. */
function overpaidCafe(alone: Vnd) {
  const server = cafeServerWith({ payment_account: SHOP_ACCOUNT }, [LAN, MINH]);
  server.state.pins.set(MINH.id, MINH_PIN);
  server.state.grants.set(LAN.id, [{ key: "cash_move", threshold: { maxAmount: alone } }]);
  server.state.grants.set(MINH.id, [...ROLE_TEMPLATES.manager.grants]);
  return server;
}

/** Two coffees (58.000 đ) on a QR the customer over-paid by 2.000 đ, on the over card. */
async function overpaidBy2000(server: ReturnType<typeof overpaidCafe>) {
  await signedInTill(server);
  const intent = await twoCoffeesOnQr(server);
  bankSettles(server, "overpaid", 60_000);
  await waitFor(() => expect(qrPhaseShown()).toBe("over"));
  return intent;
}

const shiftOpened = (server: ReturnType<typeof overpaidCafe>) =>
  (pushedOf(server, "shift.open")[0]?.payload as { shiftId: string }).shiftId;

describe("handing a QR's excess back from the drawer", () => {
  it("within the cashier's cash limit, closes the order and hands it back without asking", async () => {
    const server = overpaidCafe(vnd(500_000));
    const intent = await overpaidBy2000(server);
    tap(Q.handBackCash(money(2_000)));
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedOf(server, "payment.hand_back_excess")).toHaveLength(1));
    expect(pushedOf(server, "payment.hand_back_excess")[0]?.payload).toEqual({
      intentId: intent.id,
      cashMoveId: expect.any(String),
      amount: 2_000,
    });
    expect(server.state.calls.approvals).toEqual([]);
  });

  it("past it, asks a manager to approve that cash out of the shift, then closes and hands it back", async () => {
    const server = overpaidCafe(vnd(1_000));
    const intent = await overpaidBy2000(server);
    tap(Q.handBackCash(money(2_000)));
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toBe(
      text.approval.actions.handBackExcess(money(2_000)),
    );
    // Nothing is recorded while the manager is asked: the cash has not left the drawer.
    expect(pushedOf(server, "order.pay")).toEqual([]);
    await managerApproves();
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedOf(server, "payment.hand_back_excess")).toHaveLength(1));
    // The manager approved exactly this cash out of this shift, as the server judges it.
    expect(server.state.calls.approvals.map((call) => call.action)).toEqual([
      { key: "cash_move", amount: "2000", subject: { shiftId: shiftOpened(server) } },
    ]);
    expect(pushedOf(server, "payment.hand_back_excess")[0]?.payload).toEqual({
      intentId: intent.id,
      cashMoveId: expect.any(String),
      amount: 2_000,
      approvalId: server.state.approvals[0]?.approvalId,
    });
    expect(pushedOf(server, "order.pay")[0]?.payload).toMatchObject({
      payments: [{ method: "qr_transfer", amount: 58_000, paymentIntentId: intent.id }],
    });
  });

  it("records nothing when the manager is not asked after all, and the cashier chooses again", async () => {
    const server = overpaidCafe(vnd(1_000));
    await overpaidBy2000(server);
    tap(Q.handBackCash(money(2_000)));
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    // Back on the same over card of the drawer, its choices as they were.
    await waitFor(() => expect(qrPhaseShown()).toBe("over"));
    const pulls = server.state.calls.pulls;
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(pulls + 2));
    expect(pushedOf(server, "order.pay")).toEqual([]);
    expect(pushedOf(server, "payment.hand_back_excess")).toEqual([]);
    expect(pushedOf(server, "payment.create_intent")).toHaveLength(1);
    // Leaving the excess for a manager to refund later still closes the order.
    tap(Q.closeOverLater);
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
    expect(pushedOf(server, "payment.hand_back_excess")).toEqual([]);
  });
});
