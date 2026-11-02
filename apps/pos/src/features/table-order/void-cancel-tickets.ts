import type { KitchenTicketLine, VoidRecord } from "@fnb/domain";
import { vi } from "../../messages/vi";
import { serverCopyOf } from "../order/server-copy";
import { kitchenSlips, recordablePart } from "../printing/kitchen-slips";
import { markSentCommand, withSent } from "../printing/print-commands";
import { type PrintedSlip, printOne } from "../printing/print-sale-slips";
import { kitchenSlipHandedOver } from "../printing/printer-port";
import { type RoundInput, report } from "./table-order-rounds";

/** How long the till waits for the server's own cancel line before printing its own. */
const SERVER_WAIT_MS = 4_000;

export interface CancelTickets {
  readonly slips: PrintedSlip[];
  /** False: printed from the till's copy, so the server does not know the ticket yet. */
  readonly known: boolean;
}

/**
 * The cancel ticket a void of units the kitchen has owes its station, printed at once. The
 * server makes the cancel line under the id the till gave it, so the ticket is recorded under
 * that id at once, offline too: the record waits in the outbox behind the void and reaches
 * the server after it. The till still waits a moment for the server's copy, to print from it
 * when it is there.
 */
export async function printVoidCancelTickets(
  input: RoundInput & { readonly record: VoidRecord; readonly waitMs?: number },
): Promise<CancelTickets> {
  const { session, record, place } = input;
  if (record.reversalLineId !== null) session.noteLocalCancel(record.reversalLineId);
  const stored = await serverCopyOf(
    input.client,
    session.order.orderId,
    input.waitMs ?? SERVER_WAIT_MS,
  );
  if (stored !== null) session.rebase(stored);
  const settled = await session.settled();
  if (settled === null) return { slips: [], known: stored !== null };
  const only = (line: KitchenTicketLine) =>
    line.kind === "cancel" && line.cancelsLineId === record.lineId;
  const slips: PrintedSlip[] = [];
  let sent = settled.sent ?? [];
  let version = settled.state.version;
  const unprinted = new Set<string>();
  for (const ticket of kitchenSlips(input.menu, settled, input.now(), only)) {
    const slip = { job: ticket.job, outcome: await printOne(input.printer, ticket.job) };
    slips.push(slip);
    if (!kitchenSlipHandedOver(slip.outcome)) unprinted.add(ticket.job.jobId);
    const part = kitchenSlipHandedOver(slip.outcome) ? recordablePart(ticket, unprinted) : null;
    if (part !== null) {
      sent = withSent(sent, part.sent);
      const recorded = { ...settled, state: { ...settled.state, version } };
      await session.record(markSentCommand(place, recorded, part, sent, input.now()));
      version += 1;
    }
    await report(input, settled.order.orderId, slip, session.record);
  }
  if (sent !== (settled.sent ?? [])) session.noteSent(sent, new Map());
  return { slips, known: stored !== null };
}

/** The slips screen after a void: its cancel tickets, and a word when the server has not heard. */
export async function cancelTicketsScreen(input: RoundInput & { readonly record: VoidRecord }) {
  const done = await printVoidCancelTickets(input);
  const offline = !done.known && done.slips.length > 0;
  return { slips: done.slips, ...(offline ? { notice: vi.adjust.void.cancelTicketOffline } : {}) };
}
