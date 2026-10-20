import type { SentLineState } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import type { TillPlace } from "../order/till-command";
import { billSlip } from "./bill-slip";
import { cupLabelSlip } from "./cup-label-slip";
import { kitchenSlips } from "./kitchen-slips";
import type { PaidSale } from "./paid-sale";
import { jobReportedCommand, markSentCommand } from "./print-commands";
import type { PrintJob, PrintOutcome, PrinterPort } from "./printer-port";

export interface PrintedSlip {
  readonly job: PrintJob;
  readonly outcome: PrintOutcome;
}

/** The printer port threw instead of answering: reported as a failure of that job. */
const PORT_ERROR = "PRINTER_PORT_ERROR";

async function printOne(printer: PrinterPort, job: PrintJob): Promise<PrintOutcome> {
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
  const others = [cupLabelSlip(menu, sale, at), billSlip(menu, sale, at)].flatMap((job) =>
    job === null ? [] : [job],
  );
  const printed: PrintedSlip[] = [];
  let sent: SentLineState[] = [];
  for (const ticket of tickets) {
    const outcome = await printOne(printer, ticket.job);
    printed.push({ job: ticket.job, outcome });
    if (outcome.status === "printed") {
      sent = [...sent, ...ticket.sent];
      await record(markSentCommand(place, sale, ticket, sent, now()));
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
