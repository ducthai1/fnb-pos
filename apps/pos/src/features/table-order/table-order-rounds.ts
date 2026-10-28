import {
  type KitchenTicketLine,
  type OrderLine,
  QUANTITY_SCALE,
  type SentLineState,
  diffKitchenTicket,
} from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import type { CounterOrder, SeatedTable } from "../order/counter-order";
import type { PricedCounterOrder } from "../order/price-counter-order";
import { serverCopyNow } from "../order/server-copy";
import type { TillPlace } from "../order/till-command";
import { kitchenSlips, stationRoutingOf } from "../printing/kitchen-slips";
import { preBillSlip } from "../printing/pre-bill-slip";
import { jobReportedCommand, markSentCommand, withSent } from "../printing/print-commands";
import { type PrintedSlip, printOne } from "../printing/print-sale-slips";
import type { PrinterPort } from "../printing/printer-port";
import { preBillPrintedCommand, transferTableCommand } from "./table-order-commands";
import type { TableOrderSession } from "./table-order-session";

export interface RoundInput {
  readonly menu: TillMenu;
  readonly place: TillPlace;
  readonly printer: PrinterPort;
  readonly session: TableOrderSession;
  readonly cashierName: string;
  readonly client: Pick<SyncClient, "snapshot" | "onChange">;
  now(): number;
}

/**
 * Before a round: the server's copy, when it already has every command of the till, so a
 * cancel the till made goes out under the server's id. One the server does not know yet
 * waits for a later round: recorded under the till's id, the server would refuse it.
 */
async function knownToServer(input: RoundInput): Promise<(line: KitchenTicketLine) => boolean> {
  const stored = await serverCopyNow(input.client, input.session.order.orderId);
  if (stored !== null) input.session.rebase(stored);
  const waiting = input.session.unconfirmedCancels;
  return (line) => !(line.kind === "cancel" && waiting.has(line.lineId));
}

/** What the stations do not have yet of the order as shown: its item ids and its units. */
export function owedToKitchen(
  menu: TillMenu,
  order: CounterOrder,
  lines: readonly OrderLine[],
  sent: readonly SentLineState[],
): { readonly lineIds: ReadonlySet<string>; readonly units: number } {
  const domain = {
    id: order.orderId,
    status: "draft" as const,
    serviceType: order.serviceType,
    channelKey: null,
    businessDate: "",
    lines,
    refundOfOrderId: null,
    refundAmounts: null,
    version: 0,
  };
  try {
    const diff = diffKitchenTicket(domain, sent, stationRoutingOf(menu));
    const owed = diff.tickets.flatMap((ticket) => ticket.lines);
    // A weighing counts as one: 350 g of beans owed is something owed, not 0,35 of nothing.
    const units = owed.reduce((sum, line) => sum + unitsOwed(line.quantity), 0);
    return { lineIds: new Set(owed.map((line) => line.lineId)), units };
  } catch {
    // Lines the domain cannot read (a menu change mid-order) owe nothing the till can print.
    return { lineIds: new Set(), units: 0 };
  }
}

const unitsOwed = (units: bigint): number =>
  Number(units > 0n ? (units + QUANTITY_SCALE - 1n) / QUANTITY_SCALE : units / QUANTITY_SCALE);

const treeOf = (priced: PricedCounterOrder, itemId: string): readonly OrderLine[] =>
  priced.lines.filter((line) => line.id === itemId || line.parentLineId === itemId);

/** A job's outcome, reported for the backoffice's log when a real printer answered. */
export async function report(
  input: RoundInput,
  orderId: string,
  slip: PrintedSlip,
  record: (c: LocalCommand) => Promise<void>,
) {
  if (slip.outcome.status !== "preview_only") {
    await record(jobReportedCommand(input.place, orderId, slip.job, slip.outcome, input.now()));
  }
}

/**
 * "Gửi bếp": a ticket per station with only what it has not seen since the last round, as
 * last saved. A ticket the printer took is recorded as sent and locks its items; one only
 * shown or jammed stays owed and prints again on the next send. Null: nothing saved yet.
 */
export async function sendRoundToKitchen(input: RoundInput): Promise<PrintedSlip[] | null> {
  const { session, place } = input;
  if ((await session.settled()) === null) return null;
  const only = await knownToServer(input);
  const settled = await session.settled();
  if (settled === null) return null;
  const tickets = kitchenSlips(input.menu, settled, input.now(), only);
  const printed: PrintedSlip[] = [];
  let sent = settled.sent ?? [];
  let version = settled.state.version;
  const locked = new Map<string, readonly OrderLine[]>();
  for (const ticket of tickets) {
    const slip = { job: ticket.job, outcome: await printOne(input.printer, ticket.job) };
    printed.push(slip);
    if (slip.outcome.status === "printed") {
      sent = withSent(sent, ticket.sent);
      const recorded = { ...settled, state: { ...settled.state, version } };
      await session.record(markSentCommand(place, recorded, ticket, sent, input.now()));
      version += 1;
      for (const line of ticket.lines) locked.set(line.lineId, treeOf(settled.priced, line.lineId));
    }
    await report(input, settled.order.orderId, slip, session.record);
  }
  if (locked.size > 0) session.noteSent(sent, locked);
  return printed;
}

/**
 * "In tạm tính": the order as last saved, without payments. Shown on screen or printed, the
 * guests have seen what they owe, so the table waits to pay; a jammed print records nothing.
 */
export async function printPreBill(input: RoundInput): Promise<PrintedSlip | null> {
  const { session } = input;
  const settled = await session.settled();
  if (settled === null) return null;
  const profile = settled.state.chargeProfile;
  const job = preBillSlip(
    input.menu,
    settled,
    profile.pricesIncludeTax,
    input.cashierName,
    input.now(),
  );
  const slip = { job, outcome: await printOne(input.printer, job) };
  if (slip.outcome.status !== "failed") {
    await session.record(preBillPrintedCommand(input.place, settled, input.now()));
    session.notePreBill();
  }
  await report(input, settled.order.orderId, slip, session.record);
  return slip;
}

/** table.transfer of the order as last saved; false when nothing was saved to move yet. */
export async function moveGuests(
  input: Pick<RoundInput, "place" | "session" | "now">,
  to: SeatedTable,
): Promise<boolean> {
  const settled = await input.session.settled();
  if (settled === null) return false;
  await input.session.record(transferTableCommand(input.place, settled, to, input.now()));
  return true;
}
