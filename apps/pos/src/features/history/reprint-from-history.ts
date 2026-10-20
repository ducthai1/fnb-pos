import { ZERO_VND } from "@fnb/domain";
import type { EntityView, SyncClient } from "@fnb/sync-client";
import { einvoiceOfOrder, printableLookup } from "../invoice/use-order-einvoice";
import type { TillMenu } from "../menu/till-menu";
import { openingFromStored } from "../order/order-opening";
import type { StoredOrder } from "../order/stored-order";
import type { TillPlace } from "../order/till-command";
import type { PaymentMethod } from "../payment/tenders";
import type { PaidSale } from "../printing/paid-sale";
import type { PrintedSlip } from "../printing/print-sale-slips";
import type { PrinterPort } from "../printing/printer-port";
import { reprintBill } from "../printing/reprint-bill";

/**
 * The bill of a sale from the history, as the till holds it: its lines and payments as
 * stored, the e-invoice's lookup once issued. The change handed back is not kept, so the
 * reprint shows the payments as applied.
 */
export function reprintStoredSale(input: {
  client: Pick<SyncClient, "enqueue">;
  menu: TillMenu;
  place: TillPlace;
  printer: PrinterPort;
  cashierName: string;
  stored: StoredOrder;
  view: EntityView | undefined;
}): Promise<PrintedSlip> {
  const { stored } = input;
  const opening = openingFromStored(input.menu, stored);
  if (opening.priced === null) throw new Error("a stored order is always priced");
  const payments = stored.payments.map((payment) => ({
    method: payment.method as PaymentMethod,
    amount: payment.amount,
  }));
  const sale: PaidSale = {
    order: opening.order,
    priced: opening.priced,
    chargeProfile: stored.chargeProfile,
    businessDate: stored.businessDate,
    version: stored.version,
    tenders: payments,
    payments,
    change: ZERO_VND,
    paidAt: Date.now(),
    cashierName: input.cashierName,
    sent: stored.sent,
  };
  const lookup =
    input.view === undefined ? null : printableLookup(einvoiceOfOrder(input.view.snapshot));
  return reprintBill({
    ...input,
    sale,
    lookup,
    record: async (command) => {
      await input.client.enqueue(command);
    },
    now: Date.now,
  });
}
