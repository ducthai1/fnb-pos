import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  SHOP_ACCOUNT,
  bankSettles,
  cafeServerWith,
  pushedOf,
  tap,
  twoCoffeesToPayment,
} from "../test-support/qr-cafe-server";
import { signedInTill } from "../test-support/signed-in-till";

const W = text.wallet;
const zaloPayOn = () =>
  cafeServerWith({ payment_account: SHOP_ACCOUNT, payment_wallets: ["zalopay"] });
const walletPhase = () =>
  document.querySelector("[data-wallet-phase]")?.getAttribute("data-wallet-phase");
const cards = () =>
  [...document.querySelectorAll("[data-pay-way]")].map((card) => card.getAttribute("data-pay-way"));

describe("paying by ZaloPay at the counter", () => {
  it("offers no ZaloPay card while the branch has not turned it on", async () => {
    await signedInTill(cafeServerWith({ payment_account: SHOP_ACCOUNT }));
    await twoCoffeesToPayment();
    expect(cards()).toEqual(["cash", "qr"]);
  });

  it("opens the payment on the server for the total, shows its QR, and closes the sale once paid", async () => {
    const server = zaloPayOn();
    await signedInTill(server);
    await twoCoffeesToPayment();
    expect(cards()).toEqual(["cash", "qr", "zalopay"]);
    tap("ZaloPay");
    await waitFor(() => expect(walletPhase()).toBe("waiting"));
    const [asked] = server.state.walletPayments;
    expect(asked).toMatchObject({ wallet: "zalopay", amount: 58_000 });
    // The order the server prices is on the server before the wallet is asked.
    expect(pushedOf(server, "order.save_draft").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-wallet-qr]")?.getAttribute("data-wallet-qr")).toBe(
      `ZPQR-${asked?.intentId}`,
    );
    bankSettles(server, "paid", 58_000);
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
    expect(pushedOf(server, "order.pay")[0]?.payload).toMatchObject({
      payments: [{ method: "qr_transfer", amount: 58_000, paymentIntentId: asked?.intentId }],
      expectedAmountDue: 58_000,
    });
  });

  it("never closes the sale on a payment of another amount", async () => {
    const server = zaloPayOn();
    await signedInTill(server);
    await twoCoffeesToPayment();
    tap("ZaloPay");
    await waitFor(() => expect(walletPhase()).toBe("waiting"));
    bankSettles(server, "partial", 50_000);
    await waitFor(() => expect(walletPhase()).toBe("short"));
    const pulls = server.state.calls.pulls;
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(pulls + 2));
    expect(pushedOf(server, "order.pay")).toEqual([]);
  });

  it("says why when the server cannot be reached, and opens nothing", async () => {
    const server = zaloPayOn();
    await signedInTill(server);
    await twoCoffeesToPayment();
    server.state.online = false;
    tap("ZaloPay");
    expect(await screen.findByText(W.offline("ZaloPay"))).toBeTruthy();
    expect(walletPhase()).toBeUndefined();
    expect(pushedOf(server, "order.pay")).toEqual([]);
  });

  it("takes the payment down when the cashier cancels it", async () => {
    const server = zaloPayOn();
    await signedInTill(server);
    await twoCoffeesToPayment();
    tap("ZaloPay");
    await waitFor(() => expect(walletPhase()).toBe("waiting"));
    const intentId = server.state.walletPayments[0]?.intentId;
    tap(W.cancel);
    await screen.findByLabelText(text.checkout.payment.cashTyped);
    await waitFor(() => expect(pushedOf(server, "payment.cancel_intent")).toHaveLength(1));
    expect(pushedOf(server, "payment.cancel_intent")[0]?.payload).toEqual({ intentId });
  });
});
