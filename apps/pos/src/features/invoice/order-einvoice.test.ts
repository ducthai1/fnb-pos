import { describe, expect, it } from "vitest";
import { EINVOICE_PROFILE } from "../../test-support/invoice-cafe-server";
import { SALE_MENU } from "../../test-support/paid-sale-fixture";
import { invoicingEnabled } from "./invoicing-profile";
import { einvoiceOfOrder, printableLookup } from "./use-order-einvoice";

const invoice = {
  id: "0199f000-0000-7000-8000-00000000e001",
  status: "issued",
  number: "00000042",
  templateSymbol: "1C26MAA",
  taxAuthorityCode: "M1-26-ABCDE-00000000042",
  lookupCode: "TC8K2M9QXA",
  lookupUrl: "https://tracuu.example.vn/?ma=TC8K2M9QXA",
};

describe("the order's e-invoice on the till", () => {
  it("prints a lookup only once the invoice is issued with a code and a page", () => {
    const issued = einvoiceOfOrder({ id: "o", einvoice: invoice });
    expect(printableLookup(issued)).toEqual({
      code: "TC8K2M9QXA",
      url: "https://tracuu.example.vn/?ma=TC8K2M9QXA",
    });
    const pending = einvoiceOfOrder({ einvoice: { ...invoice, status: "pending" } });
    expect(printableLookup(pending)).toBeNull();
    expect(
      printableLookup(einvoiceOfOrder({ einvoice: { ...invoice, lookupUrl: null } })),
    ).toBeNull();
  });

  it("leaves off a page a receipt printer's QR cannot encode", () => {
    const accented = { ...invoice, lookupUrl: "https://tra-cứu.vn/?ma=TC8K2M9QXA" };
    expect(printableLookup(einvoiceOfOrder({ einvoice: accented }))).toBeNull();
  });

  it("reads no invoice from an order without one, or with one it cannot read", () => {
    expect(einvoiceOfOrder({ id: "o" })).toBeNull();
    expect(einvoiceOfOrder({ einvoice: { ...invoice, status: "lost" } })).toBeNull();
  });
});

describe("whether the branch invoices its sales", () => {
  const config = (settings: Record<string, unknown>) => ({ ...SALE_MENU.config, settings });

  it("does with an enabled profile, and does not with none, a disabled or an unreadable one", () => {
    expect(invoicingEnabled(config({ einvoice_profile: EINVOICE_PROFILE }))).toBe(true);
    expect(invoicingEnabled(config({}))).toBe(false);
    expect(
      invoicingEnabled(config({ einvoice_profile: { ...EINVOICE_PROFILE, enabled: false } })),
    ).toBe(false);
    expect(invoicingEnabled(config({ einvoice_profile: { enabled: true } }))).toBe(false);
  });
});
