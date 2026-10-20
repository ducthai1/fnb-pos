import { type BillLine, buildBill, renderEscPosChunks, renderPreview } from "@fnb/printing";
import { ZERO_VND, compareVnd } from "@fnb/domain";
import { vi } from "../../messages/vi";
import { newId } from "../ids/new-id";
import type { TillMenu } from "../menu/till-menu";
import { lineAmountOf } from "../order/cart-view";
import type { PaidSale } from "./paid-sale";
import type { PrintJob } from "./printer-port";
import { PRINTER_KEYS, RECEIPT_PRINTER } from "./printer-profiles";
import { childrenOf, itemsOf, slipHead } from "./sale-order";

/** The customer's bill: every amount is the domain's, the template only places them. */
export function billSlip(menu: TillMenu, sale: PaidSale, at: number): PrintJob {
  const { priced } = sale;
  const grossOf = new Map(priced.totals.lines.map((line) => [line.lineId, line.gross]));
  const lines: BillLine[] = itemsOf(priced.lines).map((item) => ({
    name: item.nameSnapshot,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: lineAmountOf(priced, item.id),
    children: childrenOf(priced.lines, item.id).map((child) => {
      const gross = grossOf.get(child.id) ?? ZERO_VND;
      return {
        name: child.nameSnapshot,
        quantity: child.quantity,
        amount: compareVnd(gross, ZERO_VND) === 0 ? null : gross,
      };
    }),
    note: item.note,
  }));
  const { totals } = priced;
  const head = slipHead(menu, sale, at);
  const document = buildBill({
    shop: { name: menu.shopName, address: null, phone: null },
    orderNumber: head.orderNumber,
    callNumber: head.callNumber,
    tableName: head.tableName,
    cashierName: sale.cashierName,
    printedAt: head.printedAt,
    lines,
    subtotal: totals.grossTotal,
    discounts: [],
    serviceCharge: compareVnd(totals.serviceCharge, ZERO_VND) === 0 ? null : totals.serviceCharge,
    pricesIncludeTax: sale.chargeProfile.pricesIncludeTax,
    taxes: totals.taxBreakdown.map((group) => ({ rate: group.rate, amount: group.tax })),
    total: totals.amountDue,
    payments: sale.tenders.map((tender) => ({
      method: vi.checkout.methods[tender.method],
      amount: tender.amount,
    })),
    change: sale.change,
    lookup: null,
    footer: null,
  });
  return {
    jobId: newId(),
    kind: "bill",
    printerKey: PRINTER_KEYS.receipt,
    preview: renderPreview(document, RECEIPT_PRINTER.paper),
    chunks: renderEscPosChunks(document, RECEIPT_PRINTER),
  };
}
