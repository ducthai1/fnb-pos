import { type Vnd, formatVnd, vnd } from "@fnb/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Tender } from "../../features/payment/tenders";
import { vi as text } from "../../messages/vi";
import { PaymentScreen } from "./payment-screen";

const T = text.checkout.payment;
const Q = text.qr;
const money = (n: number) => formatVnd(vnd(n));
const shown = (attribute: string) =>
  document.querySelector(`[data-${attribute}]`)?.getAttribute(`data-${attribute}`);

function openPayment(amountDue: Vnd, qrAccountSet = true) {
  const paid: (readonly Tender[])[] = [];
  const qrShown: number[] = [];
  render(
    <PaymentScreen
      header={null}
      amountDue={amountDue}
      qrAccountSet={qrAccountSet}
      onBack={() => {}}
      onQr={() => void qrShown.push(1)}
      onPaid={async (tenders) => void paid.push(tenders)}
    />,
  );
  return { paid, qrShown };
}

describe("taking the money", () => {
  it("works out the change of a quick-key note and pays the whole amount due", () => {
    const { paid } = openPayment(vnd(129_000));
    expect(screen.getByRole("button", { name: T.finish })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: T.quickCash(money(200_000)) }));
    expect(shown("remaining")).toBe("0");
    expect(shown("change")).toBe("71000");
    fireEvent.click(screen.getByRole("button", { name: T.finish }));
    expect(paid).toEqual([[{ method: "cash", amount: vnd(200_000) }]]);
  });

  it("offers a QR for the whole amount due, and no way to record a transfer by hand", () => {
    const { paid, qrShown } = openPayment(vnd(129_000));
    fireEvent.click(screen.getByRole("button", { name: Q.offer(money(129_000)) }));
    expect(qrShown).toHaveLength(1);
    const labels = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    expect(labels.filter((label) => /chuyển khoản/i.test(label))).toEqual([
      Q.offer(money(129_000)),
    ]);
    expect(paid).toEqual([]);
  });

  it("hides the QR and says why when the branch has no account to receive into", () => {
    openPayment(vnd(129_000), false);
    expect(screen.queryByRole("button", { name: Q.offer(money(129_000)) })).toBeNull();
    expect(screen.getByText(Q.noAccount)).toBeTruthy();
  });

  it("hides the QR once cash was taken: a QR asks for the order's whole total", () => {
    openPayment(vnd(129_000));
    fireEvent.change(screen.getByLabelText(T.cashTyped), { target: { value: "100.000" } });
    fireEvent.click(screen.getByRole("button", { name: T.addCash }));
    expect(shown("remaining")).toBe("29000");
    expect(screen.queryByRole("button", { name: Q.offer(money(29_000)) })).toBeNull();
    expect(screen.queryByRole("button", { name: Q.offer(money(129_000)) })).toBeNull();
    expect(screen.getByText(Q.wholeOrderOnly)).toBeTruthy();
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
    const { paid } = openPayment(vnd(0));
    expect(screen.queryByRole("button", { name: T.addCash })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: T.finish }));
    expect(paid).toEqual([[]]);
  });
});
