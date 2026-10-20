import { type SentLineState, computeOrderTotals } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { useCallback, useRef, useState } from "react";
import type { TillMenu } from "../menu/till-menu";
import { commandMadeLines } from "../order/command-made-lines";
import type { KeptLines } from "../order/price-counter-order";
import type { StoredOrder } from "../order/stored-order";
import type { TillPlace } from "../order/till-command";
import { useDraftQueue } from "../order/use-draft-queue";
import type { TableOrderOpening } from "./table-order-opening";
import type { TableOrderSession } from "./table-order-session";
import { settledOrder } from "./table-order-state";
import { useOrderRefusal } from "./use-order-refusal";
import { usePreBillState } from "./use-pre-bill-state";

/**
 * The order at a table while its screen is open: saved after every change (order.save_draft
 * carries the whole order, the server keeps lines by id), items the kitchen has kept as
 * they are, and the commands of each round recorded after the saves they follow. Once the
 * server refuses one of them, the till's view of the order is no longer the server's, so
 * nothing more is recorded until the order is opened again from the floor.
 */
export function useTableOrder(
  client: SyncClient,
  place: TillPlace,
  menu: TillMenu,
  opening: TableOrderOpening,
  /** Told of every command recorded for the order, so the floor can report a refusal. */
  onRecorded: (commandId: string) => void,
): TableOrderSession {
  const [sent, setSent] = useState(opening.recorded.sent ?? []);
  const preBill = usePreBillState(opening.recorded.preBillPrinted);
  const ours = useRef(new Set<string>(opening.answersFor));
  const refusal = useOrderRefusal(client, opening.order.orderId, ours.current);
  const unconfirmed = useRef(new Set(opening.unconfirmedCancels));
  const blockedNow = useRef(false);
  blockedNow.current = refusal !== null;

  const enqueue = useCallback(
    async (command: LocalCommand) => {
      ours.current.add(command.commandId);
      onRecorded(command.commandId);
      await client.enqueue(command);
    },
    [client, onRecorded],
  );
  const draft = useDraftQueue({
    enqueue,
    place,
    menu,
    opening,
    blocked: () => blockedNow.current,
    onChanged: preBill.outOfDate,
    expectsVersion: true,
  });
  const { recorded, locks } = draft;

  const settled = useCallback(async () => {
    if (!(await draft.settledNow()) || draft.current.current === null) return null;
    const state = { ...recorded.current, preBillPrinted: recorded.current.preBillPrinted === true };
    return settledOrder(draft.current.current, draft.lastPriced.current, state);
  }, [draft, recorded]);

  const noteSent = useCallback(
    (next: readonly SentLineState[], locked: KeptLines) => {
      recorded.current = { ...recorded.current, sent: next };
      const held = locks.now.current;
      locks.set({ ...held, kept: new Map([...held.kept, ...locked]) });
      setSent(next);
    },
    [recorded, locks],
  );

  // The server made its own cancel lines: take its command-made lines and what it says the
  // stations have, so tickets go out under the ids it knows. Only once nothing waits.
  const rebase = useCallback(
    (stored: StoredOrder) => {
      const order = draft.current.current;
      const priced = draft.lastPriced.current;
      if (order === null || priced === null || draft.dirty.current) return;
      const commandLines = commandMadeLines(stored.lines);
      const own = new Set(locks.now.current.commandLines.map((line) => line.id));
      const lines = [...priced.lines.filter((line) => !own.has(line.id)), ...commandLines];
      const totals = computeOrderTotals(
        { lines, serviceType: order.serviceType },
        recorded.current.chargeProfile,
      );
      draft.lastPriced.current = { lines, totals };
      recorded.current = { ...recorded.current, sent: stored.sent, version: stored.version };
      locks.set({ ...locks.now.current, commandLines });
      unconfirmed.current.clear();
      setSent(stored.sent);
    },
    [draft, locks, recorded],
  );

  const notePreBill = useCallback(() => {
    recorded.current = { ...recorded.current, preBillPrinted: true };
    preBill.printedNow();
  }, [recorded, preBill]);

  return {
    order: draft.order ?? opening.order,
    chargeProfile: recorded.current.chargeProfile,
    saveFailed: draft.saveFailed,
    kept: locks.state.kept,
    commandLines: locks.state.commandLines,
    update: draft.update,
    saveAt: draft.saveAt,
    recorded: () => recorded.current,
    record: draft.record,
    adjustable: draft.adjustable,
    adjust: draft.adjust,
    // The floor, not this session, starts what comes after a paid table.
    startNew: () => {},
    sent,
    preBill: preBill.state,
    refusal,
    settled,
    noteSent,
    notePreBill,
    unconfirmedCancels: unconfirmed.current,
    noteLocalCancel: (lineId) => void unconfirmed.current.add(lineId),
    rebase,
  };
}
