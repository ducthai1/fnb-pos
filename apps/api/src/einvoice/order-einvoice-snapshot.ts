import type { EInvoiceStatus, OrderEInvoiceSnapshot } from "@fnb/contracts";
import type pg from "pg";

/** The order's invoice as the order's snapshot shows it, or null when it has none. */
export async function readOrderEInvoiceSnapshot(
  client: pg.ClientBase,
  orderId: string,
): Promise<OrderEInvoiceSnapshot | null> {
  const { rows } = await client.query<{
    id: string;
    status: EInvoiceStatus;
    number: string | null;
    template_symbol: string;
    tax_authority_code: string | null;
    lookup_code: string | null;
    lookup_url: string | null;
  }>(
    "SELECT id, status, number, template_symbol, tax_authority_code, lookup_code, lookup_url " +
      "FROM einvoice WHERE order_id = $1",
    [orderId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    status: row.status,
    number: row.number,
    templateSymbol: row.template_symbol,
    taxAuthorityCode: row.tax_authority_code,
    lookupCode: row.lookup_code,
    lookupUrl: row.lookup_url,
  };
}
