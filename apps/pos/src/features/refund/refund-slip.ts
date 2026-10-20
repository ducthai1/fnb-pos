import { ZERO_VND, computeOrderTotals } from "@fnb/domain";
import { PRINT_LABELS_VI, type PrintBlock, buildBill } from "@fnb/printing";
import { vi } from "../../messages/vi";
import type { TillMenu } from "../menu/till-menu";
import type { StoredOrder } from "../order/stored-order";
import { billBody, receiptJob } from "../printing/bill-slip";
import type { PrintJob } from "../printing/printer-port";
import type { RefundMethod } from "./refund-command";
import type { TillRefund } from "./refund-plan";

/**
 * The refund's slip: the bill of the refund order (its lines and amounts negative, as the
 * domain priced them from the sale), under its own heading and naming the sale it is for.
 */
export function refundSlip(input: {
  menu: TillMenu;
  sale: StoredOrder;
  refund: TillRefund;
  refundNo: number;
  method: RefundMethod;
  cashierName: string;
  at: number;
}): PrintJob {
  const { sale, refund } = input;
  const order = {
    orderId: refund.built.order.id,
    deviceOrderNo: input.refundNo,
    serviceType: "takeaway" as const,
    tableTag: null,
    table: null,
    lines: [],
  };
  const priced = {
    lines: refund.built.order.lines,
    totals: computeOrderTotals(refund.built.order, sale.chargeProfile),
  };
  const bill = buildBill({
    ...billBody(
      input.menu,
      { order, priced },
      sale.chargeProfile.pricesIncludeTax,
      input.cashierName,
      input.at,
    ),
    payments: [{ method: vi.checkout.methods[input.method], amount: refund.amountDue }],
    change: ZERO_VND,
    lookup: null,
    footer: vi.refund.slipFooter(sale.deviceOrderNo),
  });
  const document = bill.map((block): PrintBlock =>
    block.kind === "text" && block.text === PRINT_LABELS_VI.billTitle
      ? { ...block, text: vi.refund.slipHeading }
      : block,
  );
  return receiptJob(document, "refund");
}
