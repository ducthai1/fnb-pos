import type { EInvoiceBuyer, OrderEInvoiceSnapshot } from "@fnb/contracts";
import { printableLookup } from "../../features/invoice/use-order-einvoice";
import { vi } from "../../messages/vi";

const I = vi.invoice;

function buyerSummary(buyer: EInvoiceBuyer | null): string {
  if (buyer === null) return I.retail;
  if (buyer.taxCode !== undefined) return I.forCompany(buyer.name ?? "", buyer.taxCode);
  return I.forPerson(buyer.name ?? buyer.citizenId ?? buyer.phone ?? "");
}

/**
 * Who the e-invoice will be for, and the way to change it: on the payment screen, and after
 * payment until the invoice is issued.
 */
export function BuyerInvoiceOffer({
  buyer,
  pending = false,
  onEdit,
}: {
  buyer: EInvoiceBuyer | null;
  /** The server queued the invoice and it is not issued yet. */
  pending?: boolean;
  onEdit(): void;
}) {
  return (
    <section className="pos-card pos-invoice" aria-label={I.title}>
      {pending ? <p className="pos-hint">{I.pending}</p> : null}
      <p className="pos-wrap" data-invoice-buyer={buyer === null ? "retail" : "named"}>
        {buyerSummary(buyer)}
      </p>
      <button type="button" className="pos-button" onClick={onEdit}>
        {buyer === null ? I.offer : I.edit}
      </button>
    </section>
  );
}

/**
 * The sale's e-invoice on the "paid" screen: once issued, its number and lookup code, and a
 * reprint of the bill carrying them; before that, who it will be for.
 */
export function SaleInvoicePanel({
  invoice,
  buyer,
  reprinting,
  onEditBuyer,
  onReprint,
}: {
  invoice: OrderEInvoiceSnapshot | null;
  buyer: EInvoiceBuyer | null;
  reprinting: boolean;
  onEditBuyer(): void;
  onReprint(): void;
}) {
  if (invoice === null || invoice.status !== "issued") {
    return <BuyerInvoiceOffer buyer={buyer} pending={invoice !== null} onEdit={onEditBuyer} />;
  }
  const lookup = printableLookup(invoice);
  return (
    <section className="pos-card pos-invoice" aria-label={I.issued}>
      <h2 className="pos-slip__title">{I.issued}</h2>
      {invoice.number === null ? null : <p className="pos-wrap">{I.number(invoice.number)}</p>}
      {invoice.lookupCode === null ? null : (
        <p className="pos-wrap">
          {I.lookupCode}:{" "}
          <strong className="pos-qr__code" data-einvoice-lookup={invoice.lookupCode}>
            {invoice.lookupCode}
          </strong>
        </p>
      )}
      {lookup === null ? null : (
        <button
          type="button"
          className="pos-button pos-button--primary"
          onClick={onReprint}
          disabled={reprinting}
        >
          {reprinting ? I.reprinting : I.reprint}
        </button>
      )}
    </section>
  );
}
