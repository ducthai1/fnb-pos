import {
  type BillInput,
  type BillLine,
  type PrintDocument,
  buildBill,
  renderEscPosChunks,
  renderPreview,
} from "@fnb/printing";
import { ZERO_VND, compareVnd } from "@fnb/domain";
import { vi } from "../../messages/vi";
import { newId } from "../ids/new-id";
import type { TillMenu } from "../menu/till-menu";
import { lineAmountOf } from "../order/cart-view";
import type { PricedCounterOrder } from "../order/price-counter-order";
import type { PaidSale } from "./paid-sale";
import type { PrintJob } from "./printer-port";
import { weighedOnSlip } from "./weighed-print";
import { PRINTER_KEYS, RECEIPT_PRINTER } from "./printer-profiles";
import { type SlipOrder, childrenOf, itemsOf, slipHead } from "./sale-order";

/** The e-invoice's lookup code and the page to look it up on, printed as text and as a QR. */
export interface BillLookup {
  readonly code: string;
  readonly url: string;
}

/**
 * Each item with its options, every amount as the domain priced the line; a weighed item
 * with its grams and what its price is per, read from the menu's unit for it.
 */
export function billLinesOf(menu: TillMenu, priced: PricedCounterOrder): BillLine[] {
  const grossOf = new Map(priced.totals.lines.map((line) => [line.lineId, line.gross]));
  return itemsOf(priced.lines).map((item) => ({
    name: item.nameSnapshot,
    quantity: item.quantity,
    weighed: weighedOnSlip(menu, item.productId, item.quantity),
    unitPrice: item.unitPrice,
    amount: lineAmountOf(priced, item.id),
    children: childrenOf(priced.lines, item.id)
      .filter((child) => child.lineType !== "discount")
      .map((child) => {
        const gross = grossOf.get(child.id) ?? ZERO_VND;
        return {
          name: child.nameSnapshot,
          quantity: child.quantity,
          amount: compareVnd(gross, ZERO_VND) === 0 ? null : gross,
        };
      }),
    note: item.note,
  }));
}

/** What a bill and a pre-bill share: the order, its lines and the domain's totals. */
export function billBody(
  menu: TillMenu,
  sale: Pick<SlipOrder, "order" | "priced">,
  pricesIncludeTax: boolean,
  cashierName: string,
  at: number,
): Omit<BillInput, "payments" | "change" | "lookup" | "footer"> {
  const { totals } = sale.priced;
  const head = slipHead(menu, sale, at);
  return {
    shop: { name: menu.shopName, address: null, phone: null },
    orderNumber: head.orderNumber,
    callNumber: head.callNumber,
    tableName: head.tableName,
    cashierName,
    printedAt: head.printedAt,
    lines: billLinesOf(menu, sale.priced),
    subtotal: totals.grossTotal,
    // Every discount of the order as one line: the item each came off is not the bill's concern.
    discounts:
      compareVnd(totals.discountTotal, ZERO_VND) > 0
        ? [{ label: vi.adjust.cart.orderDiscount, amount: totals.discountTotal }]
        : [],
    serviceCharge: compareVnd(totals.serviceCharge, ZERO_VND) === 0 ? null : totals.serviceCharge,
    pricesIncludeTax,
    taxes: totals.taxBreakdown.map((group) => ({ rate: group.rate, amount: group.tax })),
    total: totals.amountDue,
  };
}

/** A receipt-printer job for a slip document. */
export function receiptJob(document: PrintDocument, kind: PrintJob["kind"]): PrintJob {
  return {
    jobId: newId(),
    kind,
    printerKey: PRINTER_KEYS.receipt,
    preview: renderPreview(document, RECEIPT_PRINTER.paper),
    chunks: renderEscPosChunks(document, RECEIPT_PRINTER),
  };
}

/**
 * The customer's bill: every amount is the domain's, the template only places them. Once the
 * sale's e-invoice is issued, a reprint carries its lookup code so the customer can find it.
 */
export function billSlip(
  menu: TillMenu,
  sale: PaidSale,
  at: number,
  lookup: BillLookup | null = null,
): PrintJob {
  const body = billBody(menu, sale, sale.chargeProfile.pricesIncludeTax, sale.cashierName, at);
  const document = buildBill({
    ...body,
    payments: sale.tenders.map((tender) => ({
      method: vi.checkout.methods[tender.method],
      amount: tender.amount,
    })),
    change: sale.change,
    lookup,
    footer: null,
  });
  return receiptJob(document, "bill");
}
