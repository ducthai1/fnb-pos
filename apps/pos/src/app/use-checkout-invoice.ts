import type { EInvoiceBuyer, OrderEInvoiceSnapshot } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { useState } from "react";
import { invoicingEnabled } from "../features/invoice/invoicing-profile";
import { setBuyerCommand } from "../features/invoice/set-buyer-command";
import { printableLookup, useOrderEInvoice } from "../features/invoice/use-order-einvoice";
import type { TillMenu } from "../features/menu/till-menu";
import type { CounterOrder } from "../features/order/counter-order";
import { type TillOrderState, tillOrderSnapshot } from "../features/order/order-snapshot-for-till";
import type { PricedCounterOrder } from "../features/order/price-counter-order";
import { type TillPlace, businessDateAt } from "../features/order/till-command";
import type { CounterOrderSession } from "../features/order/use-counter-order";
import type { PaidSale } from "../features/printing/paid-sale";
import type { PrintedSlip } from "../features/printing/print-sale-slips";
import type { PrinterPort } from "../features/printing/printer-port";
import { reprintBill } from "../features/printing/reprint-bill";

export interface CheckoutInvoice {
  /** The branch issues e-invoices: only then can a buyer be put on one. */
  readonly enabled: boolean;
  /** Who the cashier recorded the invoice to be for; null: a retail customer. */
  readonly buyer: EInvoiceBuyer | null;
  /** The order's invoice as the server last sent it, once queued. */
  readonly invoice: OrderEInvoiceSnapshot | null;
  saveBuyer(buyer: EInvoiceBuyer | null): Promise<void>;
  /** The bill again with the issued invoice's lookup code; null when there is none yet. */
  reprint(): Promise<PrintedSlip | null>;
}

/**
 * The counter order's e-invoice: the buyer the customer asks for (before paying, or after
 * until the invoice goes out), and the bill reprinted with the lookup code once issued.
 */
export function useCheckoutInvoice(
  input: {
    client: SyncClient;
    place: TillPlace;
    menu: TillMenu;
    printer: PrinterPort;
    session: CounterOrderSession;
    order: CounterOrder;
    priced: PricedCounterOrder;
  },
  sale: PaidSale | null,
): CheckoutInvoice {
  const { client, place, session, order, priced } = input;
  const [buyer, setBuyer] = useState<EInvoiceBuyer | null>(null);
  const invoice = useOrderEInvoice(client, order.orderId);

  async function saveBuyer(next: EInvoiceBuyer | null) {
    const at = Date.now();
    const recorded = session.recorded();
    const state: TillOrderState =
      sale === null
        ? {
            status: "draft",
            version: recorded.version,
            businessDate: recorded.businessDate ?? businessDateAt(place, at),
            chargeProfile: recorded.chargeProfile,
            payments: [],
            sent: recorded.sent ?? [],
          }
        : {
            status: "paid",
            version: recorded.version,
            businessDate: sale.businessDate,
            chargeProfile: sale.chargeProfile,
            payments: sale.payments,
            sent: recorded.sent ?? [],
          };
    const expected = tillOrderSnapshot(place, order, priced, state);
    await session.record(setBuyerCommand(place, order.orderId, next, expected, at), {
      keepsVersion: true,
    });
    setBuyer(next);
  }

  async function reprint() {
    const lookup = printableLookup(invoice);
    if (sale === null || lookup === null) return null;
    return reprintBill({ ...input, sale, lookup, record: session.record, now: Date.now });
  }

  return { enabled: invoicingEnabled(input.menu.config), buyer, invoice, saveBuyer, reprint };
}
