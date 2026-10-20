import { basisPoints, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import type { DailyBatch, EInvoiceDocument, IssuedInvoice } from "../einvoice-provider";
import { FakeEInvoiceProvider } from "./fake-einvoice-provider";

const SELLER = {
  taxCode: "0312345678",
  name: "Công ty TNHH Phở Sáng",
  address: "12 Lê Lợi, Quận 1",
  templateSymbol: "1C26MAA",
};

const document = (id: string): EInvoiceDocument => ({
  id,
  kind: "sale",
  adjusts: null,
  regimeVersion: "nd254-tt91",
  seller: SELLER,
  buyer: null,
  soldAt: new Date("2026-10-20T03:00:00.000Z"),
  businessDate: "2026-10-20",
  amounts: {
    lines: [],
    grossTotal: vnd(29_000),
    discountTotal: vnd(0),
    netTotal: vnd(29_000),
    serviceCharge: vnd(0),
    serviceChargeTax: vnd(0),
    taxBreakdown: [{ rate: basisPoints(800), base: vnd(26_852), tax: vnd(2_148) }],
    taxTotal: vnd(2_148),
    amountDue: vnd(29_000),
  },
});

const batchOf = (invoices: IssuedInvoice[]): DailyBatch => ({
  id: "batch-1",
  branchId: "branch-1",
  businessDate: "2026-10-20",
  regimeVersion: "nd254-tt91",
  seller: { taxCode: SELLER.taxCode, name: SELLER.name, address: SELLER.address },
  invoices: invoices.map((invoice, index) => ({
    id: `invoice-${index}`,
    number: invoice.number,
    templateSymbol: SELLER.templateSymbol,
    taxAuthorityCode: invoice.taxAuthorityCode,
    soldAt: new Date("2026-10-20T03:00:00.000Z"),
    amountDue: vnd(29_000),
    taxTotal: vnd(2_148),
  })),
});

const issued = async (provider: FakeEInvoiceProvider, id: string) => {
  const result = await provider.issue(document(id));
  if (!result.ok) throw new Error(`issue failed: ${result.code}`);
  return result;
};

describe("FakeEInvoiceProvider", () => {
  it("answers the invoice it already issued when the same invoice is sent again", async () => {
    const provider = new FakeEInvoiceProvider();
    const first = await issued(provider, "a");
    const again = await issued(provider, "a");
    const other = await issued(provider, "b");
    expect(again).toEqual(first);
    expect(other.number).not.toBe(first.number);
    expect(provider.callsOf("issue").map((call) => call.document.id)).toEqual(["a", "a", "b"]);
  });

  it("gives every invoice a lookup code and a page to look it up on", async () => {
    const invoice = await issued(new FakeEInvoiceProvider(), "a");
    expect(invoice.lookupUrl).toContain(invoice.lookupCode);
    expect(invoice.taxAuthorityCode).toMatch(/^M1-26-/);
  });

  it("finds an invoice by our id only once it was issued", async () => {
    const provider = new FakeEInvoiceProvider();
    expect(await provider.lookup("a")).toEqual({ found: false });
    const invoice = await issued(provider, "a");
    expect(await provider.lookup("a")).toEqual({ ...invoice, found: true });
  });

  it("takes a batch of the invoices it issued and refuses one naming an invoice it never did", async () => {
    const provider = new FakeEInvoiceProvider();
    const invoice = await issued(provider, "a");
    expect(await provider.submitDailyBatch(batchOf([invoice]))).toEqual({
      ok: true,
      reference: "FAKE-BATCH-000001",
    });
    const forged = { ...invoice, number: "99999999" };
    expect(await provider.submitDailyBatch(batchOf([forged]))).toMatchObject({
      ok: false,
      failure: "permanent",
    });
  });

  it("fails the next calls as told, then behaves again", async () => {
    const provider = new FakeEInvoiceProvider();
    provider.failNext("issue", { failure: "temporary", code: "RATE_LIMITED" }, 2);
    provider.failNext("submitDailyBatch", { failure: "permanent", code: "BAD_BATCH" });
    expect(await provider.issue(document("a"))).toEqual({
      ok: false,
      failure: "temporary",
      code: "RATE_LIMITED",
    });
    expect((await provider.issue(document("a"))).ok).toBe(false);
    expect((await provider.issue(document("a"))).ok).toBe(true);
    expect(await provider.submitDailyBatch(batchOf([]))).toMatchObject({ code: "BAD_BATCH" });
  });

  it("refuses everything while down, answering or dropping the connection", async () => {
    const provider = new FakeEInvoiceProvider();
    provider.goDown();
    expect(await provider.issue(document("a"))).toMatchObject({ ok: false, failure: "temporary" });
    provider.goDown({ throws: true });
    await expect(provider.issue(document("a"))).rejects.toThrow("connection reset");
    provider.comeBack();
    expect((await provider.issue(document("a"))).ok).toBe(true);
  });
});
