import type { OrderSnapshot } from "./order-rows";
import { snapshotToWire } from "./order-wire-codec";

/**
 * A stable text form of a set of orders, so the till, the other till and the server can
 * be compared for exact equality (ids, money, versions, lines) with one string compare.
 */
export function canonicalState(snapshots: readonly OrderSnapshot[]): string {
  return [...snapshots]
    .sort((a, b) => (a.order.id < b.order.id ? -1 : 1))
    .map((snapshot) => {
      const wire = snapshotToWire(snapshot);
      wire.lines.sort((a, b) => (a.id < b.id ? -1 : 1));
      return JSON.stringify(wire);
    })
    .join("\n");
}
