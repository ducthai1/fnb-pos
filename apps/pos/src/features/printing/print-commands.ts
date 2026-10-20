import { markSentToKitchenPayloadSchema, printJobReportedPayloadSchema } from "@fnb/contracts";
import type { SentLineState } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import type { CounterOrder } from "../order/counter-order";
import { type TillOrderState, tillOrderSnapshot } from "../order/order-snapshot-for-till";
import type { PricedCounterOrder } from "../order/price-counter-order";
import { type TillPlace, tillCommand } from "../order/till-command";
import type { KitchenTicketJob } from "./kitchen-slips";
import type { PrintJob, PrintOutcome } from "./printer-port";

/** An order as the till last recorded it, for the row a command on it is expected to leave. */
export interface RecordedOrder {
  readonly order: CounterOrder;
  readonly priced: PricedCounterOrder;
  /** The order as recorded before this command; the command adds one to its version. */
  readonly state: Omit<TillOrderState, "sent">;
}

/** The sent state of earlier tickets with a ticket's lines laid over it, line by line. */
export function withSent(
  earlier: readonly SentLineState[],
  printed: readonly SentLineState[],
): SentLineState[] {
  const replaced = new Set(printed.map((line) => line.lineId));
  return [...earlier.filter((line) => !replaced.has(line.lineId)), ...printed];
}

/** order.mark_sent_to_kitchen for a ticket the printer took; never for one only shown. */
export function markSentCommand(
  place: TillPlace,
  recorded: RecordedOrder,
  ticket: KitchenTicketJob,
  sentSoFar: readonly SentLineState[],
  at: number,
): LocalCommand {
  const { order, priced, state } = recorded;
  const payload = {
    orderId: order.orderId,
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
      entityId: order.orderId,
      optimistic: tillOrderSnapshot(place, order, priced, {
        ...state,
        version: state.version + 1,
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
