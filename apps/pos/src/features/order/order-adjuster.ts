import type { SentLineState } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import type { CounterOrder } from "./counter-order";
import {
  type AdjustableOrder,
  type Adjusted,
  NothingSavedError,
  type Recorded,
} from "./order-session-types";
import type { PricedCounterOrder } from "./price-counter-order";
import type { OrderLocks } from "./use-order-locks";

/** The order as last saved, for a command to build on; null when there is no save yet. */
export function adjustableOf(
  order: CounterOrder | null,
  priced: PricedCounterOrder | null,
  recorded: Recorded & { readonly preBillPrinted?: boolean },
  locks: OrderLocks,
): AdjustableOrder | null {
  const { businessDate } = recorded;
  if (order === null || priced === null || businessDate === null) return null;
  const sent: readonly SentLineState[] = recorded.sent ?? [];
  return {
    order,
    priced,
    kept: locks.kept,
    commandLines: locks.commandLines,
    sent,
    state: {
      status: "draft",
      version: recorded.version,
      businessDate,
      chargeProfile: recorded.chargeProfile,
      payments: [],
      sent,
      preBillPrinted: false,
    },
  };
}

/**
 * Runs `make` on the order as it stands once every queued save is recorded, records its
 * command in that queue, then lets the session take the order it leaves. A refusal from
 * `make` records nothing and stops nothing queued after it; the caller hears of it.
 */
export function queueAdjustment(
  input: {
    readonly saving: { current: Promise<unknown> };
    settledNow(): AdjustableOrder | null;
    enqueue(command: LocalCommand): Promise<unknown>;
    apply(adjusted: Adjusted): void;
  },
  make: (settled: AdjustableOrder) => Adjusted,
): Promise<void> {
  const next = input.saving.current.then(async () => {
    const settled = input.settledNow();
    if (settled === null) throw new NothingSavedError();
    const adjusted = make(settled);
    await input.enqueue(adjusted.command);
    input.apply(adjusted);
  });
  input.saving.current = next.catch(() => {});
  return next;
}
