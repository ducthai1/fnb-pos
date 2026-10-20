import { type Vnd, formatVnd, vnd } from "@fnb/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Tender } from "../../features/payment/tenders";
import { vi as text } from "../../messages/vi";
import { PaymentScreen } from "./payment-screen";

const T = text.checkout.payment;
const money = (n: number) => formatVnd(vnd(n));
const shown = (attribute: string) =>
  document.querySelector(`[data-${attribute}]`)?.getAttribute(`data-${attribute}`);

function openPayment(amountDue: Vnd) {
  const paid: (readonly Tender[])[] = [];
  render(
    <PaymentScreen
      header={null}
      amountDue={amountDue}
      onBack={() => {}}
      onPaid={async (tenders) => void paid.push(tenders)}
    />,
  );
  return paid;
}

describe("taking the money", () => {
  it("works out the change of a quick-key note and pays the whole amount due", () => {
    const paid = openPayment(vnd(129_000));
    expect(screen.getByRole("button", { name: T.finish })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: T.quickCash(money(200_000)) }));
    expect(shown("remaining")).toBe("0");
    expect(shown("change")).toBe("71000");
    fireEvent.click(screen.getByRole("button", { name: T.finish }));
    expect(paid).toEqual([[{ method: "cash", amount: vnd(200_000) }]]);
  });

  it("takes part in cash and the rest by a transfer the cashier confirms", () => {
    const paid = openPayment(vnd(129_000));
    fireEvent.change(screen.getByLabelText(T.cashTyped), { target: { value: "100.000" } });
    fireEvent.click(screen.getByRole("button", { name: T.addCash }));
    expect(shown("remaining")).toBe("29000");
    fireEvent.click(screen.getByRole("button", { name: T.qrConfirm(money(29_000)) }));
    expect(shown("change")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: T.finish }));
    expect(paid[0]).toEqual([
      { method: "cash", amount: vnd(100_000) },
      { method: "qr_transfer", amount: vnd(29_000) },
    ]);
  });

  it("refuses an amount that is not digits, and lets a tender be taken back", () => {
    openPayment(vnd(129_000));
    fireEvent.change(screen.getByLabelText(T.cashTyped), { target: { value: "hai trăm" } });
    fireEvent.click(screen.getByRole("button", { name: T.addCash }));
    expect(screen.getByRole("alert").textContent).toBe(T.refusals.unreadable);
    fireEvent.change(screen.getByLabelText(T.cashTyped), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: T.addCash }));
    expect(screen.getByRole("alert").textContent).toBe(T.refusals.not_positive);
    fireEvent.click(screen.getByRole("button", { name: T.quickCash(money(129_000)) }));
    fireEvent.click(
      screen.getByRole("button", {
        name: T.removeTender(text.checkout.methods.cash, money(129_000)),
      }),
    );
    expect(shown("remaining")).toBe("129000");
  });

  it("handles the largest bill a till could see, to the đồng", () => {
    openPayment(vnd(99_999_999_000));
    fireEvent.click(screen.getByRole("button", { name: T.quickCash(money(100_000_000_000)) }));
    expect(shown("change")).toBe("1000");
  });

  it("pays a free order without taking anything", () => {
    const paid = openPayment(vnd(0));
    expect(screen.queryByRole("button", { name: T.addCash })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: T.finish }));
    expect(paid).toEqual([[]]);
  });
});
