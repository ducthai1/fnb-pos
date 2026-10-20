import type { EntitySnapshot, PosFloorPlan } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useMemo, useState } from "react";
import type { ApiResult } from "../api/api-result";
import { failureMessage } from "../api/failure-message";
import { type StoredTableOrder, readStoredTableOrder } from "../table-order/stored-table-order";
import type { FloorOccupancy } from "./floor-occupancy";
import { type FloorTableView, floorTablesView } from "./floor-tables-view";
import { useLocalFloorPlan } from "./use-local-floor-plan";

export interface FloorInput {
  readonly client: Pick<SyncClient, "snapshots" | "onChange">;
  /** GET /floor/occupancy with the till's credential. */
  loadFloor(): Promise<ApiResult<FloorOccupancy>>;
  /** Called after each sync pass (and count change); returns the unsubscribe. */
  onSyncPass(listener: () => void): () => void;
  /** Orders this till has seen with a current pre-bill; grown here as they are seen. */
  readonly preBilled: Set<string>;
  /** The bootstrap's plan: drawn with the feed's changes, the network no longer read. */
  readonly plan?: PosFloorPlan | undefined;
  /** The bootstrap's open drafts, under the copies the till's database holds. */
  readonly openOrders?: readonly EntitySnapshot[] | undefined;
}

export interface FloorState {
  /** Null until the plan was read once. */
  readonly occupancy: FloorOccupancy | null;
  readonly loadError: string | null;
  readonly tables: readonly FloorTableView[];
  /** Every order the till holds, by id, to open the one seated at a table. */
  readonly orders: ReadonlyMap<string, StoredTableOrder>;
}

async function heldOrders(
  client: FloorInput["client"],
  preBilled: Set<string>,
  openOrders: readonly EntitySnapshot[],
) {
  const orders = new Map<string, StoredTableOrder>();
  const opened = openOrders.flatMap((snapshot) => readStoredTableOrder(snapshot) ?? []);
  for (const view of await client.snapshots("order")) {
    const order = readStoredTableOrder(view.snapshot);
    if (order === null) continue;
    orders.set(
      order.orderId,
      view.source === "optimistic" ? { ...order, heldOnTill: true } : order,
    );
    if (order.status === "draft" && order.preBillPrinted) preBilled.add(order.orderId);
  }
  // A till paired while guests sit opens their order before the feed brings it.
  for (const order of opened) {
    const held = orders.get(order.orderId);
    if (held !== undefined && held.version >= order.version) continue;
    orders.set(order.orderId, order);
    if (order.status === "draft" && order.preBillPrinted) preBilled.add(order.orderId);
  }
  return orders;
}

const NO_ORDERS: readonly EntitySnapshot[] = [];

/**
 * The floor while it is on screen: the plan with the server's statuses, read again after
 * every sync pass (another till may have seated guests), corrected at once by the orders
 * the till holds whenever one of them changes (its own commands, or the change feed).
 */
export function useFloor(input: FloorInput): FloorState {
  const { client, loadFloor, onSyncPass, preBilled, plan } = input;
  const openOrders = input.openOrders ?? NO_ORDERS;
  const localPlan = useLocalFloorPlan(client, plan);
  const [read, setOccupancy] = useState<FloorOccupancy | null>(null);
  const occupancy = plan === undefined ? read : localPlan;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ReadonlyMap<string, StoredTableOrder>>(new Map());

  useEffect(() => {
    let live = true;
    let loading = false;
    let loadedAt = Number.NEGATIVE_INFINITY;
    const load = () => {
      // Passes and count changes come in bursts while orders are taken: one read a second.
      if (plan !== undefined || loading || Date.now() - loadedAt < 1_000) return;
      loading = true;
      loadedAt = Date.now();
      loadFloor()
        .then((result) => {
          if (!live) return;
          if (result.ok) setOccupancy(result.value);
          setLoadError(result.ok ? null : failureMessage(result));
        })
        .catch(console.error)
        .finally(() => {
          loading = false;
        });
    };
    let reading: Promise<void> = Promise.resolve();
    const read = () => {
      reading = reading
        .then(async () => {
          const held = await heldOrders(client, preBilled, openOrders);
          if (live) setOrders(held);
        })
        .catch(console.error);
    };
    const stopPasses = onSyncPass(load);
    const stopChanges = client.onChange((changed) => {
      if (changed.some((ref) => ref.entity === "order")) read();
    });
    load();
    read();
    return () => {
      live = false;
      stopPasses();
      stopChanges();
    };
  }, [client, loadFloor, onSyncPass, preBilled, plan, openOrders]);

  const tables = useMemo(
    () => (occupancy === null ? [] : floorTablesView(occupancy, [...orders.values()], preBilled)),
    [occupancy, orders, preBilled],
  );
  return { occupancy, loadError, tables, orders };
}
