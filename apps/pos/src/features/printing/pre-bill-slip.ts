import { ZERO_VND } from "@fnb/domain";
import { PRINT_LABELS_VI, type PrintBlock, buildBill } from "@fnb/printing";
import { vi } from "../../messages/vi";
import type { TillMenu } from "../menu/till-menu";
import { billBody, receiptJob } from "./bill-slip";
import type { PrintJob } from "./printer-port";
import type { SlipOrder } from "./sale-order";

/**
 * The pre-bill a table asks for before paying: the bill as it would print now, with no
 * payment on it and its own heading, so nobody takes it for a receipt of money taken.
 */
export function preBillSlip(
  menu: TillMenu,
  order: SlipOrder,
  pricesIncludeTax: boolean,
  cashierName: string,
  at: number,
): PrintJob {
  const bill = buildBill({
    ...billBody(menu, order, pricesIncludeTax, cashierName, at),
    payments: [],
    change: ZERO_VND,
    lookup: null,
    footer: null,
  });
  const document = bill.map((block): PrintBlock =>
    block.kind === "text" && block.text === PRINT_LABELS_VI.billTitle
      ? { ...block, text: vi.tables.slips.preBillHeading }
      : block,
  );
  return receiptJob(document, "pre_bill");
}
