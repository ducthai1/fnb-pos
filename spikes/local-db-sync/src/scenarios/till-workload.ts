import { sampleLines } from "../shared/sample-menu";
import { addLineOffline, createOrderOffline, payOrderOffline } from "../sync-client/pos-order-actions";
import type { Till } from "./till-harness";

export interface WorkloadCounts {
  created: number;
  linesAdded: number;
  paid: number;
  /** The local copy was already paid, so the cashier could not even try. */
  blockedLocally: number;
}

export interface WorkloadMix {
  steps: number;
  createShare: number;
  addLineShare: number;
  maxPauseMs: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A cashier working while sync runs: new orders, extra lines and payments on any order the
 * till knows, including ones another till created. The order list is re-read from the
 * local DB every few steps, so pulled orders join in.
 */
export async function runTillWorkload(till: Till, mix: WorkloadMix): Promise<WorkloadCounts> {
  const counts: WorkloadCounts = { created: 0, linesAdded: 0, paid: 0, blockedLocally: 0 };
  let known: string[] = [];
  for (let step = 0; step < mix.steps; step += 1) {
    if (step % 10 === 0) {
      known = (await till.store.listOrderSnapshots())
        .filter((s) => s.order.status === "open")
        .map((s) => s.order.id);
    }
    const roll = till.random.next();
    if (roll < mix.createShare || known.length === 0) {
      const entry = await createOrderOffline(till.ctx, sampleLines(till.random, 3));
      known.push(entry.payload.order_id);
      counts.created += 1;
    } else {
      const orderId = till.random.pick(known);
      const addLine = roll < mix.createShare + mix.addLineShare;
      const entry = addLine
        ? await addLineOffline(till.ctx, orderId, sampleLines(till.random, 1)[0]!)
        : await payOrderOffline(till.ctx, orderId);
      if (entry === null) counts.blockedLocally += 1;
      else if (addLine) counts.linesAdded += 1;
      else counts.paid += 1;
    }
    if (mix.maxPauseMs > 0) await sleep(till.random.int(0, mix.maxPauseMs));
  }
  return counts;
}
