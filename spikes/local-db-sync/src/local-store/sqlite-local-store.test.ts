import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vnd } from "../shared/domain";
import { orderToWire } from "../shared/order-wire-codec";
import { seededRandom } from "../shared/seeded-random";
import { isSyncError } from "../shared/sync-error";
import { SYNC_ERROR_CODES } from "../shared/sync-error-codes";
import { sampleLines } from "../shared/sample-menu";
import { type PosContext, createOrderOffline } from "../sync-client/pos-order-actions";
import type { LocalStore } from "./local-store";
import { openNodeSqliteDriver } from "./node-sqlite-driver";
import type { SqliteDriver } from "./sqlite-driver";
import { createSqliteLocalStore } from "./sqlite-local-store";

let dir: string;
let driver: SqliteDriver;
let store: LocalStore;
let ctx: PosContext;
const random = seededRandom(7);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spike-local-store-"));
  driver = openNodeSqliteDriver(join(dir, "till.db"));
  store = createSqliteLocalStore(driver);
  ctx = { store, deviceId: "till-1", businessDate: "2026-10-20", now: () => 1_760_000_000_000 };
});

afterEach(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return isSyncError(error) ? error.code : "not-a-sync-error";
  }
  return undefined;
}

describe("writeWithCommand", () => {
  it("stores the order, its lines and a pending command together", async () => {
    const entry = await createOrderOffline(ctx, sampleLines(random, 3));
    const snapshot = await store.readOrderSnapshot(entry.payload.order_id);
    expect(snapshot?.lines).toHaveLength(3);
    expect(entry.deviceSeq).toBe(1);
    expect(await store.readPendingCommands(10)).toEqual([entry]);
  });

  it("keeps neither the order nor its lines when the command cannot be queued", async () => {
    const first = await createOrderOffline(ctx, sampleLines(random, 1));
    const orphanId = "019a0000-0000-7000-8000-000000000001";
    const order = { ...(await store.readOrderSnapshot(first.payload.order_id))!.order };
    const write = { orders: [{ ...order, id: orphanId }], lines: [] };
    const code = await errorCodeOf(store.writeWithCommand(write, first));
    expect(code).toBe(SYNC_ERROR_CODES.commandAlreadyQueued);
    expect(await store.readOrderSnapshot(orphanId)).toBeNull();
  });

  it("never hands out a device_seq twice, even after the newest outbox row is deleted", async () => {
    await createOrderOffline(ctx, sampleLines(random, 1));
    const second = await createOrderOffline(ctx, sampleLines(random, 1));
    driver.run("DELETE FROM outbox WHERE device_seq = ?", [second.deviceSeq]);
    const third = await createOrderOffline(ctx, sampleLines(random, 1));
    expect(third.deviceSeq).toBe(second.deviceSeq + 1);
  });
});

describe("applyPulledChanges", () => {
  it("defers a pulled page while commands are pending, then applies it once they are accepted", async () => {
    const entry = await createOrderOffline(ctx, sampleLines(random, 1));
    const local = (await store.readOrderSnapshot(entry.payload.order_id))!.order;
    const serverCopy = orderToWire({ ...local, version: 7 });
    const page = [{ change_seq: "5", entity: "order" as const, data: serverCopy }];

    expect(await store.applyPulledChanges(page, "5")).toBe("deferred-pending-commands");
    expect(await store.readCursor()).toBe("0");

    await store.markAccepted([entry.commandId]);
    expect(await store.applyPulledChanges(page, "5")).toBe("applied");
    expect(await store.readCursor()).toBe("5");
    expect((await store.readOrderSnapshot(local.id))?.order.version).toBe(7);
  });

  it("refuses a page that would move the cursor backwards", async () => {
    await store.applyPulledChanges([], "10");
    const code = await errorCodeOf(store.applyPulledChanges([], "9"));
    expect(code).toBe(SYNC_ERROR_CODES.cursorWentBackwards);
    expect(await store.readCursor()).toBe("10");
  });

  it("ignores a change at or below the cursor so a stale copy cannot overwrite a newer one", async () => {
    const entry = await createOrderOffline(ctx, sampleLines(random, 1));
    await store.markAccepted([entry.commandId]);
    const local = (await store.readOrderSnapshot(entry.payload.order_id))!.order;
    const newer = orderToWire({ ...local, version: 3, status: "paid" });
    const older = orderToWire({ ...local, version: 2 });
    await store.applyPulledChanges([{ change_seq: "8", entity: "order", data: newer }], "8");
    await store.applyPulledChanges([{ change_seq: "8", entity: "order", data: older }], "8");
    expect((await store.readOrderSnapshot(local.id))?.order.status).toBe("paid");
  });
});

describe("markRejected", () => {
  it("replaces the optimistic order with the server copy, or drops it when the server has none", async () => {
    const kept = await createOrderOffline(ctx, sampleLines(random, 2));
    const dropped = await createOrderOffline(ctx, sampleLines(random, 2));
    const serverOrder = (await store.readOrderSnapshot(kept.payload.order_id))!.order;
    const snapshot = { order: { ...serverOrder, totalVnd: vnd(1_000) }, lines: [] };

    await store.markRejected({ commandId: kept.commandId, code: "X", orderId: serverOrder.id, snapshot });
    await store.markRejected({
      commandId: dropped.commandId,
      code: "X",
      orderId: dropped.payload.order_id,
      snapshot: null,
    });

    expect(await store.readOrderSnapshot(serverOrder.id)).toEqual(snapshot);
    expect(await store.readOrderSnapshot(dropped.payload.order_id)).toBeNull();
    expect(await store.countCommands()).toEqual({ pending: 0, accepted: 0, rejected: 2 });
  });
});
