import type { LocalCommand } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import type { TillPlace } from "../order/till-command";
import { type BillLookup, billSlip } from "./bill-slip";
import type { PaidSale } from "./paid-sale";
import { jobReportedCommand } from "./print-commands";
import { type PrintedSlip, printOne } from "./print-sale-slips";
import type { PrinterPort } from "./printer-port";

/**
 * The bill again, as a new job, with the e-invoice's lookup code and its QR once issued. A
 * real printer's answer is reported like the first print's, so the log shows the reprint.
 */
export async function reprintBill(input: {
  menu: TillMenu;
  place: TillPlace;
  sale: PaidSale;
  printer: PrinterPort;
  lookup: BillLookup | null;
  record(command: LocalCommand): Promise<void>;
  now(): number;
}): Promise<PrintedSlip> {
  const { place, sale, printer, now } = input;
  const job = billSlip(input.menu, sale, now(), input.lookup);
  const outcome = await printOne(printer, job);
  if (outcome.status !== "preview_only") {
    await input.record(jobReportedCommand(place, sale.order.orderId, job, outcome, now()));
  }
  return { job, outcome };
}
