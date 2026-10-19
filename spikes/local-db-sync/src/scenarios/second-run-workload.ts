import type { LocalStore } from "../local-store/local-store";
import { sampleLines } from "../shared/sample-menu";
import type { SeededRandom } from "../shared/seeded-random";
import {
  type PosContext,
  addLineOffline,
  createOrderOffline,
  payOrderOffline,
} from "../sync-client/pos-order-actions";

export interface SecondRunCounts {
  created: number;
  linesAdded: number;
  paid: number;
}

/**
 * The second run on an existing till: new orders, plus extra lines and payments on any
 * open order, old or new, so later commands depend on earlier ones (ordering matters).
 * Runs unchanged on node:sqlite and in the browser worker.
 */
export async function runSecondRunWorkload(
  store: LocalStore,
  ctx: PosContext,
  random: SeededRandom,
  orders: number,
): Promise<SecondRunCounts> {
  const open = (await store.listOrderSnapshots())
    .filter((s) => s.order.status === "open")
    .map((s) => s.order.id);
  const counts: SecondRunCounts = { created: 0, linesAdded: 0, paid: 0 };
  for (let i = 0; i < orders; i += 1) {
    open.push((await createOrderOffline(ctx, sampleLines(random, 3))).payload.order_id);
    counts.created += 1;
    if (random.chance(0.3)) {
      const [line] = sampleLines(random, 1);
      if (line && (await addLineOffline(ctx, random.pick(open), line))) counts.linesAdded += 1;
    }
    if (random.chance(0.3)) {
      const orderId = random.pick(open);
      if (await payOrderOffline(ctx, orderId)) counts.paid += 1;
      open.splice(open.indexOf(orderId), 1);
    }
    await new Promise((resolve) => setTimeout(resolve, random.int(0, 4)));
  }
  return counts;
}
