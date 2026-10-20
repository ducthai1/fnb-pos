import type { OrderChargeProfile, SentLineState } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newId } from "../ids/new-id";
import type { TillMenu } from "../menu/till-menu";
import { type CounterOrder, newCounterOrder } from "./counter-order";
import { type OrderNumbers, orderNumbers } from "./device-order-number";
import { type PricedCounterOrder, priceCounterOrder } from "./price-counter-order";
import { saveDraftCommand } from "./save-draft-command";
import { type TillPlace, businessDateAt } from "./till-command";

/** The order on the counter and what has been recorded of it on the till. */
export interface Recorded {
  /** Charge profile the order opened with: the server keeps that one for the order's life. */
  chargeProfile: OrderChargeProfile;
  /** Day of the first save, which the server keeps as the order's day. */
  businessDate: string | null;
  version: number;
  /** What the stations have of each item: a table's rounds sent so far; none on the counter. */
  sent?: readonly SentLineState[];
}

export interface CounterOrderSession {
  readonly order: CounterOrder | null;
  readonly chargeProfile: OrderChargeProfile | null;
  readonly saveFailed: boolean;
  /** Changes the cart; the draft is saved on the till right after, in the order changed. */
  update(change: (order: CounterOrder) => CounterOrder): void;
  /** Saves the draft priced at `at` once every earlier save is recorded; null when it failed. */
  saveAt(at: number): Promise<PricedCounterOrder | null>;
  readonly recorded: () => Readonly<Recorded>;
  /**
   * Records a command after every save already queued; one on the order bumps its version,
   * unless it leaves the order's row as it was (`keepsVersion`), as buyer details do.
   */
  record(command: LocalCommand, options?: { readonly keepsVersion?: boolean }): Promise<void>;
  /** Clears the counter for the next customer. */
  startNew(): void;
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
): CounterOrderSession {
  const [order, setOrder] = useState<CounterOrder | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const current = useRef<CounterOrder | null>(null);
  const recorded = useRef<Recorded>({
    chargeProfile: menu.config.chargeProfile,
    businessDate: null,
    version: 0,
  });
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const own = useMemo(() => orderNumbers(client, place.deviceId), [client, place.deviceId]);
  const numbers = shared ?? own;
  const menuNow = useRef(menu);
  menuNow.current = menu;

  const startNew = useCallback(() => {
    current.current = null;
    setOrder(null);
    setSaveFailed(false);
    const opened = saving.current.then(async () => {
      const number = await numbers.next();
      recorded.current = {
        chargeProfile: menuNow.current.config.chargeProfile,
        businessDate: null,
        version: 0,
      };
      const fresh = newCounterOrder(newId(), number);
      current.current = fresh;
      setOrder(fresh);
    });
    saving.current = opened.catch(console.error);
  }, [numbers]);
  useEffect(startNew, [startNew]);

  const save = useCallback(
    async (draft: CounterOrder, at: number): Promise<PricedCounterOrder | null> => {
      const state = recorded.current;
      try {
        const priced = priceCounterOrder(menuNow.current, draft, state.chargeProfile, at);
        const businessDate = state.businessDate ?? businessDateAt(place, at);
        const version = state.version + 1;
        const status = "draft" as const;
        const command = saveDraftCommand(
          place,
          draft,
          priced,
          { ...state, status, businessDate, version, payments: [], sent: [] },
          at,
        );
        await client.enqueue(command);
        recorded.current = { ...state, businessDate, version };
        setSaveFailed(false);
        return priced;
      } catch (error) {
        console.error(error);
        setSaveFailed(true);
        return null;
      }
    },
    [client, place],
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
      if (before === null) return;
      const after = change(before);
      if (after === before) return;
      current.current = after;
      setOrder(after);
      if (after.lines.length > 0 || recorded.current.version > 0) void queue(after, Date.now());
    },
    [queue],
  );

  const record = useCallback(
    (command: LocalCommand, options?: { readonly keepsVersion?: boolean }) => {
      const next = saving.current.then(async () => {
        await client.enqueue(command);
        if (command.target.entity === "order" && options?.keepsVersion !== true) {
          recorded.current = { ...recorded.current, version: recorded.current.version + 1 };
        }
      });
      // A failed record stops nothing queued after it; the caller hears of it.
      saving.current = next.catch(() => {});
      return next;
    },
    [client],
  );

  const saveAt = useCallback(
    async (at: number) => (current.current === null ? null : queue(current.current, at)),
    [queue],
  );

  return {
    order,
    chargeProfile: order === null ? null : recorded.current.chargeProfile,
    saveFailed,
    update,
    saveAt,
    recorded: () => recorded.current,
    record,
    startNew,
  };
}
