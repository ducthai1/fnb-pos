import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { invoiceCafeServer, invoiceIssued } from "../test-support/invoice-cafe-server";
import { money, pushedOf, tap, twoCoffeesToPayment } from "../test-support/qr-cafe-server";
import { signedInTill } from "../test-support/signed-in-till";

const I = text.invoice;
const LOOKUP = { lookupCode: "TC8K2M9QXA", lookupUrl: "https://tracuu.example.vn/?ma=TC8K2M9QXA" };

async function paidInCash() {
  const server = invoiceCafeServer();
  await signedInTill(server);
  await twoCoffeesToPayment();
  tap(text.checkout.payment.quickCash(money(100_000)));
  tap(text.checkout.payment.finish);
  await screen.findByRole("heading", { name: text.checkout.done.title });
  await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
  await waitFor(() => expect(document.querySelectorAll("[data-print-status]")).toHaveLength(3));
  return server;
}

describe("the e-invoice on the paid screen", () => {
  it("shows the lookup code once issued, and reprints the bill with it and its QR", async () => {
    const server = await paidInCash();
    invoiceIssued(server, { status: "issued", ...LOOKUP });
    await screen.findByRole("heading", { name: I.issued });
    expect(
      document.querySelector("[data-einvoice-lookup]")?.getAttribute("data-einvoice-lookup"),
    ).toBe(LOOKUP.lookupCode);
    expect(screen.getByText(I.number("00000042"))).toBeTruthy();
    // The bill printed at payment had no lookup yet.
    const firstBill = screen.getAllByText(text.checkout.done.slipNames.bill)[0]?.closest("article");
    expect(firstBill?.textContent).not.toContain(LOOKUP.lookupCode);
    tap(I.reprint);
    await waitFor(() => expect(document.querySelectorAll("[data-print-status]")).toHaveLength(4));
    const reprinted = [...document.querySelectorAll("article")].at(-1);
    expect(reprinted?.textContent).toContain(`Mã tra cứu: ${LOOKUP.lookupCode}`);
  });

  it("offers no reprint while the invoice waits, and still lets the buyer be named", async () => {
    const server = await paidInCash();
    invoiceIssued(server, { status: "pending", lookupCode: null, lookupUrl: null });
    await screen.findByText(I.pending);
    expect(screen.queryByRole("button", { name: I.reprint })).toBeNull();
    tap(I.offer);
    await screen.findByRole("heading", { name: I.title });
  });

  it("offers no reprint for an issued invoice whose page a receipt QR cannot carry", async () => {
    const server = await paidInCash();
    invoiceIssued(server, {
      status: "issued",
      lookupCode: "TC1",
      lookupUrl: "https://tra-cứu.vn/1",
    });
    await screen.findByRole("heading", { name: I.issued });
    expect(screen.getByText("TC1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: I.reprint })).toBeNull();
  });
});
