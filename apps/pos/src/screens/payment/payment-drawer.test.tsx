import { type Vnd, formatVnd, vnd } from "@fnb/domain";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Tender } from "../../features/payment/tenders";
import { vi as text } from "../../messages/vi";
import { PaymentDrawer } from "./payment-drawer";

const T = text.checkout.payment;
const Q = text.qr;
const money = (n: number) => formatVnd(vnd(n));
const shown = (attribute: string) =>
  document.querySelector(`[data-${attribute}]`)?.getAttribute(`data-${attribute}`);
const tap = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const card = (name: string) => screen.getByRole("button", { name });

function openDrawer(amountDue: Vnd, options: { qrAccountSet?: boolean; leaves?: boolean } = {}) {
  const invoice = <button type="button">invoice buyer</button>;
  const calls = { paid: [] as (readonly Tender[])[], qr: 0, left: 0, back: 0 };
  render(
    <PaymentDrawer
      amountDue={amountDue}
      qrAccountSet={options.qrAccountSet ?? true}
      invoice={invoice}
      onQr={() => void calls.qr++}
      onLeaveQr={async () => {
        calls.left++;
        return options.leaves ?? true;
      }}
      qrPanel={() => <p data-qr-panel>QR</p>}
      qrBusy={false}
      onBack={() => void calls.back++}
      onPaid={async (tenders) => void calls.paid.push(tenders)}
    />,
  );
  return calls;
}

describe("the payment drawer", () => {
  it("opens as a dialog on cash, the amount due on top, and pays the change of a quick key", () => {
    const calls = openDrawer(vnd(129_000));
    const dialog = screen.getByRole("dialog", { name: T.title });
    expect(within(dialog).getByRole("heading", { name: T.title })).toBeTruthy();
    expect(shown("amount-due")).toBe("129000");
    expect(card(T.cash).getAttribute("aria-pressed")).toBe("true");
    expect(card(Q.title).getAttribute("aria-pressed")).toBe("false");
    expect(card(T.finish)).toHaveProperty("disabled", true);
    tap(T.quickCash(money(200_000)));
    expect(shown("remaining")).toBe("0");
    expect(shown("change")).toBe("71000");
    tap(T.finish);
    expect(calls.paid).toEqual([[{ method: "cash", amount: vnd(200_000) }]]);
    expect(calls.qr).toBe(0);
  });

  it("refuses to finish while cash is short, and takes cash in several pieces", () => {
    const calls = openDrawer(vnd(129_000));
    fireEvent.change(screen.getByLabelText(T.cashTyped), { target: { value: "100.000" } });
    tap(T.addCash);
    expect(shown("remaining")).toBe("29000");
    expect(card(T.finish)).toHaveProperty("disabled", true);
    fireEvent.keyDown(window, { key: text.sale.keys.pay });
    expect(calls.paid).toEqual([]);
    tap(T.quickCash(money(50_000)));
    expect(shown("change")).toBe("21000");
    fireEvent.keyDown(window, { key: text.sale.keys.pay });
    expect(calls.paid).toEqual([
      [
        { method: "cash", amount: vnd(100_000) },
        { method: "cash", amount: vnd(50_000) },
      ],
    ]);
  });

  it("shows the QR once its card is chosen, and takes it down before going back to cash", async () => {
    const calls = openDrawer(vnd(129_000));
    tap(Q.title);
    expect(calls.qr).toBe(1);
    expect(card(Q.title).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-qr-panel]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: T.finish })).toBeNull();
    expect(screen.queryByLabelText(T.cashTyped)).toBeNull();
    // Editing the buyer would leave the drawer with the QR still out: not offered beside it.
    expect(screen.queryByRole("button", { name: "invoice buyer" })).toBeNull();
    await act(async () => tap(T.cash));
    expect(screen.getByRole("button", { name: "invoice buyer" })).toBeTruthy();
    expect(calls.left).toBe(1);
    expect(card(T.cash).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-qr-panel]")).toBeNull();
    expect(calls.paid).toEqual([]);
  });

  it("stays on the QR when it could not be taken down", async () => {
    const calls = openDrawer(vnd(129_000), { leaves: false });
    tap(Q.title);
    await act(async () => tap(T.cash));
    expect(calls.left).toBe(1);
    expect(card(Q.title).getAttribute("aria-pressed")).toBe("true");
    await act(async () => tap(T.back));
    expect(calls.back).toBe(0);
  });

  it("says why there is no QR when the branch has no account, and draws none", () => {
    const calls = openDrawer(vnd(129_000), { qrAccountSet: false });
    tap(Q.title);
    expect(screen.getByText(Q.noAccount)).toBeTruthy();
    expect(calls.qr).toBe(0);
    expect(document.querySelector("[data-qr-panel]")).toBeNull();
  });

  it("offers no QR once cash was taken: a QR asks for the order's whole total", () => {
    const calls = openDrawer(vnd(129_000));
    tap(T.quickCash(money(129_000)));
    tap(Q.title);
    expect(screen.getByText(Q.wholeOrderOnly)).toBeTruthy();
    expect(calls.qr).toBe(0);
    tap(T.cash);
    tap(T.removeTender(text.checkout.methods.cash, money(129_000)));
    expect(shown("remaining")).toBe("129000");
  });

  it("goes back to the order on Esc and on its close button, sending nothing", async () => {
    const calls = openDrawer(vnd(129_000));
    tap(T.quickCash(money(200_000)));
    fireEvent.keyDown(window, { key: text.sale.keys.back });
    await act(async () => {});
    expect(calls.back).toBe(1);
    await act(async () => tap(T.back));
    expect(calls.back).toBe(2);
    expect(calls).toMatchObject({ paid: [], qr: 0, left: 0 });
  });

  it("takes a QR still out down before going back to the order", async () => {
    const calls = openDrawer(vnd(129_000));
    tap(Q.title);
    fireEvent.keyDown(window, { key: text.sale.keys.back });
    await act(async () => {});
    expect(calls).toMatchObject({ qr: 1, left: 1, back: 1, paid: [] });
  });

  it("refuses an amount that is not digits or not above zero", () => {
    openDrawer(vnd(129_000));
    fireEvent.change(screen.getByLabelText(T.cashTyped), { target: { value: "hai trăm" } });
    tap(T.addCash);
    expect(screen.getByRole("alert").textContent).toBe(T.refusals.unreadable);
    fireEvent.change(screen.getByLabelText(T.cashTyped), { target: { value: "0" } });
    tap(T.addCash);
    expect(screen.getByRole("alert").textContent).toBe(T.refusals.not_positive);
  });

  it("handles the largest bill a till could see, to the đồng", () => {
    openDrawer(vnd(99_999_999_000));
    tap(T.quickCash(money(100_000_000_000)));
    expect(shown("change")).toBe("1000");
  });

  it("pays a free order without taking anything or offering a way to pay", () => {
    const calls = openDrawer(vnd(0));
    expect(screen.queryByRole("button", { name: T.addCash })).toBeNull();
    expect(screen.queryByRole("button", { name: Q.title })).toBeNull();
    tap(T.finish);
    expect(calls.paid).toEqual([[]]);
  });
});
