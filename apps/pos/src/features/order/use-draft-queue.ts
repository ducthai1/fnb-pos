import type { LocalCommand } from "@fnb/sync-client";
import { useCallback, useRef, useState } from "react";
import type { TillMenu } from "../menu/till-menu";
import { cartChangeAllowed } from "./cart-change-guard";
import type { CounterOrder } from "./counter-order";
import { adjustableOf, queueAdjustment } from "./order-adjuster";
import type { OrderOpening } from "./order-opening";
import type { AdjustableOrder, Adjusted, Recorded } from "./order-session-types";
import { type PricedCounterOrder, priceCounterOrder } from "./price-counter-order";
import { saveDraftCommand } from "./save-draft-command";
import { type TillPlace, businessDateAt } from "./till-command";
import { useOrderLocks } from "./use-order-locks";

type RecordedHere = Recorded & { readonly preBillPrinted?: boolean };

export interface DraftQueueOptions {
  enqueue(command: LocalCommand): Promise<unknown>;
  place: TillPlace;
  menu: TillMenu;
  opening: OrderOpening | null;
  /** The server refused a command of the order: nothing more is recorded on it. */
  blocked?: () => boolean;
  /** The cart or a command changed what the order comes to. */
  onChanged?: () => void;
  /** Checkout prices the order again at that moment (the counter), else as last saved. */
  resaveAtCheckout?: boolean;
  /**
   * Each save names the version it was edited from (an order other tills edit too: a
   * table's), so the server refuses it rather than wipe what another till added.
   */
  expectsVersion?: boolean;
}

/**
 * One order's commands in the order they were made: every cart change saves the whole draft
 * (order.save_draft; the server keeps lines by id), and every other command waits for the
 * saves before it, built on the order as last saved. Shared by the counter and the tables.
 */
export function useDraftQueue(options: DraftQueueOptions) {
  const { enqueue, place } = options;
  const [order, setOrder] = useState<CounterOrder | null>(options.opening?.order ?? null);
  const [saveFailed, setSaveFailed] = useState(false);
  const locks = useOrderLocks(options.opening ?? undefined);
  const current = useRef(options.opening?.order ?? null);
  const recorded = useRef<RecordedHere>(
    options.opening?.recorded ?? {
      chargeProfile: options.menu.config.chargeProfile,
      businessDate: null,
      version: 0,
    },
  );
  const lastPriced = useRef<PricedCounterOrder | null>(options.opening?.priced ?? null);
  const dirty = useRef(false);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const live = useRef(options);
  live.current = options;
  const blocked = () => live.current.blocked?.() === true;
  const changed = () => live.current.onChanged?.();

  const reset = useCallback(
    (opening: OrderOpening | null) => {
      current.current = opening?.order ?? null;
      recorded.current = opening?.recorded ?? {
        chargeProfile: live.current.menu.config.chargeProfile,
        businessDate: null,
        version: 0,
      };
      lastPriced.current = opening?.priced ?? null;
      dirty.current = false;
      locks.set(opening);
      setOrder(current.current);
      setSaveFailed(false);
    },
    [locks.set],
  );

  async function save(draft: CounterOrder, at: number): Promise<PricedCounterOrder | null> {
    const state = recorded.current;
    const held = locks.now.current;
    try {
      const priced = priceCounterOrder(
        live.current.menu,
        draft,
        state.chargeProfile,
        at,
        held.kept,
        held.commandLines,
      );
      const businessDate = state.businessDate ?? businessDateAt(place, at);
      const version = state.version + 1;
      const expected = { ...state, status: "draft" as const, businessDate, version };
      const sent = state.sent ?? [];
      const row = { ...expected, payments: [], sent, preBillPrinted: false };
      const expectedVersion = live.current.expectsVersion === true ? state.version : undefined;
      await enqueue(saveDraftCommand(place, draft, priced, row, at, expectedVersion));
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
  }

  /** Runs `step` once everything queued before it is recorded; a failure stops nothing after. */
  function afterQueued<T>(step: () => Promise<T>): Promise<T> {
    const next = saving.current.then(step);
    saving.current = next.catch(() => {});
    return next;
  }
  const queue = (draft: CounterOrder, at: number) => afterQueued(() => save(draft, at));

  function update(change: (order: CounterOrder) => CounterOrder) {
    const before = current.current;
    if (before === null) return;
    const after = change(before);
    const held = locks.now.current;
    const allowed = cartChangeAllowed(before, after, held.kept, held.commandLines);
    if (blocked() || after === before || !allowed) return;
    current.current = after;
    dirty.current = true;
    setOrder(after);
    changed();
    if (after.lines.length > 0 || recorded.current.version > 0) void queue(after, Date.now());
  }

  function record(command: LocalCommand, options?: { readonly keepsVersion?: boolean }) {
    return afterQueued(async () => {
      await enqueue(command);
      if (command.target.entity === "order" && options?.keepsVersion !== true) {
        recorded.current = { ...recorded.current, version: recorded.current.version + 1 };
      }
    });
  }

  const adjustableNow = (): AdjustableOrder | null =>
    dirty.current || blocked()
      ? null
      : adjustableOf(current.current, lastPriced.current, recorded.current, locks.now.current);

  const adjust = (make: (settled: AdjustableOrder) => Adjusted) =>
    queueAdjustment(
      {
        saving,
        settledNow: adjustableNow,
        enqueue,
        apply(adjusted) {
          const version = recorded.current.version + 1;
          recorded.current = { ...recorded.current, version, preBillPrinted: false };
          lastPriced.current = adjusted.priced;
          locks.set({ kept: adjusted.kept, commandLines: adjusted.commandLines });
          current.current = adjusted.order;
          setOrder(adjusted.order);
          changed();
        },
      },
      make,
    );

  async function saveAt(at: number) {
    await saving.current;
    const draft = current.current;
    if (draft === null) return null;
    if (live.current.resaveAtCheckout === true || dirty.current || lastPriced.current === null) {
      return queue(draft, at);
    }
    return lastPriced.current;
  }

  return {
    order,
    saveFailed,
    locks,
    current,
    recorded,
    lastPriced,
    dirty,
    reset,
    afterQueued,
    update,
    record,
    saveAt,
    adjust,
    adjustable: async () => {
      await saving.current;
      return adjustableNow();
    },
    /** Waits for everything queued, then whether the order is as last saved. */
    settledNow: async () => {
      await saving.current;
      return !dirty.current;
    },
  };
}
