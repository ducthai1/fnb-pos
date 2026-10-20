import { markSentToKitchenPayloadSchema, printJobReportedPayloadSchema } from "@fnb/contracts";
import type { SentLineState } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import { type TillPlace, tillCommand } from "../order/till-command";
import type { KitchenTicketJob } from "./kitchen-slips";
import type { PaidSale } from "./paid-sale";
import type { PrintJob, PrintOutcome } from "./printer-port";

/** order.mark_sent_to_kitchen for a ticket the printer took; never for one only shown. */
export function markSentCommand(
  place: TillPlace,
  sale: PaidSale,
  ticket: KitchenTicketJob,
  sentSoFar: readonly SentLineState[],
  at: number,
): LocalCommand {
  const payload = {
    orderId: sale.order.orderId,
    ticketId: ticket.job.jobId,
    stations: [{ stationId: ticket.stationId, lines: ticket.lines }],
  };
  return tillCommand(
    place,
    "order.mark_sent_to_kitchen",
    markSentToKitchenPayloadSchema,
    payload,
    at,
    {
      entity: "order",
      entityId: sale.order.orderId,
      optimistic: tillOrderSnapshot(place, sale.order, sale.priced, {
        status: "paid",
        version: sale.version + 1,
        businessDate: sale.businessDate,
        chargeProfile: sale.chargeProfile,
        payments: sale.payments,
        sent: sentSoFar,
      }),
    },
  );
}

/** print.job_reported: how a slip came out on a real printer, for the backoffice's log. */
export function jobReportedCommand(
  place: TillPlace,
  orderId: string,
  job: PrintJob,
  outcome: Exclude<PrintOutcome, { status: "preview_only" }>,
  at: number,
): LocalCommand {
  const payload = {
    jobId: job.jobId,
    kind: job.kind,
    status: outcome.status,
    attempts: outcome.attempts,
    printerKey: job.printerKey,
    orderId,
    ...(outcome.status === "failed" ? { errorCode: outcome.errorCode } : {}),
    occurredAt: new Date(at).toISOString(),
  };
  return tillCommand(place, "print.job_reported", printJobReportedPayloadSchema, payload, at, {
    entity: "print_job",
    entityId: job.jobId,
    optimistic: { id: job.jobId, version: 0, status: outcome.status },
  });
}
