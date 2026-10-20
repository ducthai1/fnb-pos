import { cafeServerWith, type QrServer } from "./qr-cafe-server";

/** A branch invoicing every sale through a provider, as the backoffice stores the profile. */
export const EINVOICE_PROFILE = {
  enabled: true,
  sellerTaxCode: "0312345678",
  sellerName: "Công ty TNHH Cà Phê Mây",
  sellerAddress: "12 Lê Lợi, Bến Nghé, Quận 1, TP.HCM",
  templateSymbol: "1C26MAA",
  provider: "fake",
  regimeVersion: "nd254-tt91",
  refundInvoicing: "none",
} as const;

/** The café, invoicing its sales unless `enabled` is false. */
export const invoiceCafeServer = (enabled = true) =>
  cafeServerWith({ einvoice_profile: { ...EINVOICE_PROFILE, enabled } });

/** The paid order's row as the server holds it: the one order.pay answered. */
export function paidOrderRow(server: QrServer) {
  const row = [...server.rows.values()].find((candidate) => candidate.status === "paid");
  if (row === undefined) throw new Error("no paid order on the server");
  return row;
}

/**
 * The provider issued the order's invoice: the server sends the order out again, newer, with
 * the invoice's number and lookup code (or still pending, with none).
 */
export function invoiceIssued(
  server: QrServer,
  invoice: { status: string; lookupCode: string | null; lookupUrl: string | null },
) {
  const row = paidOrderRow(server);
  const issued = invoice.status === "issued";
  const next = {
    ...row,
    version: row.version + 1,
    einvoice: {
      id: "0199f000-0000-7000-8000-00000000e001",
      status: invoice.status,
      number: issued ? "00000042" : null,
      templateSymbol: EINVOICE_PROFILE.templateSymbol,
      taxAuthorityCode: issued ? "M1-26-ABCDE-00000000042" : null,
      lookupCode: invoice.lookupCode,
      lookupUrl: invoice.lookupUrl,
    },
  };
  server.rows.set(row.id, next);
  server.state.feed.push({ entity: "order", entityId: row.id, snapshot: next });
}
