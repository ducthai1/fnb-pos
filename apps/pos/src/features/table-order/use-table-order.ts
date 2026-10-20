import type { SentLineState } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { useCallback, useRef, useState } from "react";
import type { TillMenu } from "../menu/till-menu";
import type { CounterOrder } from "../order/counter-order";
import {
  type KeptLines,
  type PricedCounterOrder,
  priceCounterOrder,
} from "../order/price-counter-order";
import { saveDraftCommand } from "../order/save-draft-command";
import { type TillPlace, businessDateAt } from "../order/till-command";
import type { TableOrderOpening } from "./table-order-opening";
import { keptUntouched, settledOrder } from "./table-order-state";
import type { PreBillState, TableOrderSession } from "./table-order-session";
import { useOrderRefusal } from "./use-order-refusal";

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
  const [order, setOrder] = useState(opening.order);
  const [kept, setKept] = useState(opening.kept);
  const [sent, setSent] = useState(opening.recorded.sent ?? []);
  const [preBill, setPreBill] = useState<PreBillState>(
    opening.recorded.preBillPrinted ? "current" : "none",
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const current = useRef(opening.order);
  const recorded = useRef(opening.recorded);
  const keptNow = useRef(opening.kept);
  const preBillNow = useRef(preBill);
  const lastPriced = useRef<PricedCounterOrder | null>(opening.priced);
  const dirty = useRef(false);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const ours = useRef(new Set<string>());
  const menuNow = useRef(menu);
  menuNow.current = menu;
  const refusal = useOrderRefusal(client, opening.order.orderId, ours.current);
  const blocked = refusal !== null;
  const blockedNow = useRef(blocked);
  blockedNow.current = blocked;

  const enqueue = useCallback(
    async (command: LocalCommand) => {
      ours.current.add(command.commandId);
      onRecorded(command.commandId);
      await client.enqueue(command);
    },
    [client, onRecorded],
  );

  const save = useCallback(
    async (draft: CounterOrder, at: number): Promise<PricedCounterOrder | null> => {
      const state = recorded.current;
      try {
        const priced = priceCounterOrder(
          menuNow.current,
          draft,
          state.chargeProfile,
          at,
          keptNow.current,
        );
        const businessDate = state.businessDate ?? businessDateAt(place, at);
        const version = state.version + 1;
        const expected = { ...state, status: "draft" as const, businessDate, version };
        await enqueue(
          saveDraftCommand(
            place,
            draft,
            priced,
            { ...expected, payments: [], sent: state.sent ?? [], preBillPrinted: false },
            at,
          ),
        );
        recorded.current = { ...state, businessDate, version, preBillPrinted: false };
        lastPriced.current = priced;
        if (current.current === draft) dirty.current = false;
        setSaveFailed(false);
        return priced;
      } catch (error) {
        console.error(error);
        setSaveFailed(true);
        return null;
      }
    },
    [enqueue, place],
  );

  const queue = useCallback(
    (draft: CounterOrder, at: number) => {
      const next = saving.current.then(() => save(draft, at));
      saving.current = next;
      return next;
    },
    [save],
  );

  const update = useCallback(
    (change: (order: CounterOrder) => CounterOrder) => {
      const before = current.current;
      const after = change(before);
      if (
        blockedNow.current ||
        after === before ||
        !keptUntouched(before, after, keptNow.current)
      ) {
        return;
      }
      current.current = after;
      dirty.current = true;
      setOrder(after);
      if (preBillNow.current === "current") {
        preBillNow.current = "changed";
        setPreBill("changed");
      }
      if (after.lines.length > 0 || recorded.current.version > 0) void queue(after, Date.now());
    },
    [queue],
  );

  const record = useCallback(
    (command: LocalCommand, options?: { readonly keepsVersion?: boolean }) => {
      const next = saving.current.then(async () => {
        await enqueue(command);
        if (command.target.entity === "order" && options?.keepsVersion !== true) {
          recorded.current = { ...recorded.current, version: recorded.current.version + 1 };
        }
      });
      saving.current = next.catch(() => {});
      return next;
    },
    [enqueue],
  );

  const saveAt = useCallback(
    async (at: number) => {
      await saving.current;
      if (dirty.current || lastPriced.current === null) return queue(current.current, at);
      return lastPriced.current;
    },
    [queue],
  );

  const settled = useCallback(async () => {
    await saving.current;
    if (dirty.current) return null;
    return settledOrder(current.current, lastPriced.current, recorded.current);
  }, []);

  const noteSent = useCallback((next: readonly SentLineState[], locked: KeptLines) => {
    recorded.current = { ...recorded.current, sent: next };
    keptNow.current = new Map([...keptNow.current, ...locked]);
    setSent(next);
    setKept(keptNow.current);
  }, []);

  const notePreBill = useCallback(() => {
    recorded.current = { ...recorded.current, preBillPrinted: true };
    preBillNow.current = "current";
    setPreBill("current");
  }, []);

  return {
    order,
    chargeProfile: recorded.current.chargeProfile,
    saveFailed,
    update,
    saveAt,
    recorded: () => recorded.current,
    record,
    // The floor, not this session, starts what comes after a paid table.
    startNew: () => {},
    kept,
    sent,
    preBill,
    refusal,
    settled,
    noteSent,
    notePreBill,
  };
}
