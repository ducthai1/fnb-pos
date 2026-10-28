import type { SentLineState } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import type { TillPlace } from "../order/till-command";
import { billSlip } from "./bill-slip";
import { cupLabelSlip } from "./cup-label-slip";
import { kitchenSlips, recordablePart } from "./kitchen-slips";
import type { PaidSale } from "./paid-sale";
import { jobReportedCommand, markSentCommand, withSent } from "./print-commands";
import type { PrintJob, PrintOutcome, PrinterPort } from "./printer-port";

export interface PrintedSlip {
  readonly job: PrintJob;
  readonly outcome: PrintOutcome;
}

/** The printer port threw instead of answering: reported as a failure of that job. */
const PORT_ERROR = "PRINTER_PORT_ERROR";

/** The paid order as its payment left it, for what each command after it expects. */
const paidState = (sale: PaidSale) => ({
  status: "paid" as const,
  version: sale.version,
  businessDate: sale.businessDate,
  chargeProfile: sale.chargeProfile,
  payments: sale.payments,
});

/** Prints one job; a port that throws counts as a failed print, never as a crash. */
export async function printOne(printer: PrinterPort, job: PrintJob): Promise<PrintOutcome> {
  try {
    return await printer.print(job);
  } catch {
    return { status: "failed", attempts: 1, errorCode: PORT_ERROR };
  }
}

/**
 * Prints the paid sale's slips, bar tickets first so drinks start while the bill prints.
 * A ticket is recorded as sent only once the printer took it: a preview or a jammed printer
 * leaves it owed, and the next send prints it again. Every job a printer answered for is
 * reported, printed or failed; a slip only shown on screen reports nothing.
 */
export async function printSaleSlips(input: {
  menu: TillMenu;
  place: TillPlace;
  sale: PaidSale;
  printer: PrinterPort;
  /** Records a command after those already recorded for the order. */
  record(command: LocalCommand): Promise<void>;
  now(): number;
}): Promise<PrintedSlip[]> {
  const { menu, place, sale, printer, record, now } = input;
  const at = now();
  const tickets = kitchenSlips(menu, sale, at);
  // Cup labels are for counter orders, handed over at the counter. A table's drinks are
  // carried to the table, so a table order never prints labels, now or when its rounds go
  // to the bar.
  const labels = sale.order.table === null ? cupLabelSlip(menu, sale, at) : null;
  const others = [labels, billSlip(menu, sale, at)].flatMap((job) => (job === null ? [] : [job]));
  const printed: PrintedSlip[] = [];
  let sent: readonly SentLineState[] = sale.sent ?? [];
  const recorded = { order: sale.order, priced: sale.priced, state: paidState(sale) };
  const unprinted = new Set<string>();
  for (const ticket of tickets) {
    const outcome = await printOne(printer, ticket.job);
    printed.push({ job: ticket.job, outcome });
    if (outcome.status !== "printed") unprinted.add(ticket.job.jobId);
    const part = outcome.status === "printed" ? recordablePart(ticket, unprinted) : null;
    if (part !== null) {
      sent = withSent(sent, part.sent);
      await record(markSentCommand(place, recorded, part, sent, now()));
    }
    if (outcome.status !== "preview_only")
      await record(jobReportedCommand(place, sale.order.orderId, ticket.job, outcome, now()));
  }
  for (const job of others) {
    const outcome = await printOne(printer, job);
    printed.push({ job, outcome });
    if (outcome.status !== "preview_only")
      await record(jobReportedCommand(place, sale.order.orderId, job, outcome, now()));
  }
  return printed;
}
