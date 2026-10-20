import type { SyncClient } from "@fnb/sync-client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { newId } from "../ids/new-id";
import type { TillMenu } from "../menu/till-menu";
import { newCounterOrder } from "./counter-order";
import { type OrderNumbers, orderNumbers } from "./device-order-number";
import { type OrderOpening, freshOpening } from "./order-opening";
import type { CounterOrderSession } from "./order-session-types";
import type { TillPlace } from "./till-command";
import { useDraftQueue } from "./use-draft-queue";

export type { CounterOrderSession, Recorded } from "./order-session-types";

/** The counter's session, and putting a draft the till holds back on the counter. */
export interface CounterSession extends CounterOrderSession {
  /** Puts a draft back on the counter (after a reload, or one left for later). */
  reopen(opening: OrderOpening): void;
}

/**
 * The counter's draft, saved to the outbox on every change (order.save_draft carries the
 * whole cart): a crash or a dead battery loses at most the last tap, and the server has the
 * order the moment the till is online. An order with nothing in it is not saved until it has.
 */
export function useCounterOrder(
  client: SyncClient,
  place: TillPlace,
  menu: TillMenu,
  shared?: OrderNumbers,
): CounterSession {
  const own = useMemo(() => orderNumbers(client, place.deviceId), [client, place.deviceId]);
  const numbers = shared ?? own;
  const menuNow = useRef(menu);
  menuNow.current = menu;
  const enqueue = useCallback(
    (command: Parameters<SyncClient["enqueue"]>[0]) => client.enqueue(command),
    [client],
  );
  const draft = useDraftQueue({ enqueue, place, menu, opening: null, resaveAtCheckout: true });
  const { reset, afterQueued } = draft;

  const startNew = useCallback(() => {
    reset(null);
    void afterQueued(async () => {
      const number = await numbers.next();
      const fresh = newCounterOrder(newId(), number);
      reset(freshOpening(fresh, menuNow.current.config.chargeProfile));
    }).catch(console.error);
    // afterQueued only reads refs, so a new one each render must not start another order.
  }, [numbers, reset]);
  useEffect(startNew, [startNew]);

  return {
    order: draft.order,
    chargeProfile: draft.order === null ? null : draft.recorded.current.chargeProfile,
    saveFailed: draft.saveFailed,
    kept: draft.locks.state.kept,
    commandLines: draft.locks.state.commandLines,
    update: draft.update,
    saveAt: draft.saveAt,
    recorded: () => draft.recorded.current,
    record: draft.record,
    adjustable: draft.adjustable,
    adjust: draft.adjust,
    startNew,
    reopen: (opening) => void afterQueued(async () => reset(opening)),
  };
}
