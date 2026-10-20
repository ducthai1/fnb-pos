import { describe, expect, it } from "vitest";
import { answer, change, draft, order, page, testId } from "./local-store-fixtures";
import { openNodeSqliteDriver } from "./node-sqlite-driver";
import { createSqliteLocalStore } from "./sqlite-local-store";

const OLD = "0192f5a4-0000-7000-8000-000000000001";
const NEW = "0192f5a4-0000-7000-8000-000000000002";
const SETTLED_AT = "2026-10-20T03:00:00.000Z";

/** A till that saw OLD, recorded `count` orders and had the first `answered` of them settled. */
async function tillThatSold(count: number, answered: number) {
  const store = createSqliteLocalStore(openNodeSqliteDriver(":memory:"));
  await store.adoptServerGeneration(OLD);
  const orders: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const orderId = testId();
    orders.push(orderId);
    const { command } = await store.enqueue(draft(orderId));
    if (n < answered) {
      const snapshot = order(orderId, 2, { by: "old server" });
      await store.recordResults([command], [answer(command, "accepted", { snapshot })], SETTLED_AT);
    }
  }
  return { store, orders };
}

describe("rebasing onto a restored server's generation", () => {
  it("sends again, in device_seq order and ahead of newer commands, what the server lost", async () => {
    const { store } = await tillThatSold(5, 4);
    const rebase = await store.rebaseOntoGeneration(NEW, 2);
    expect(rebase).toMatchObject({ resent: 2, unrecoverable: 0 });
    const pending = await store.pendingCommands(10);
    expect(pending.map((command) => command.deviceSeq)).toEqual([3, 4, 5]);
    expect(pending.map((command) => command.resentFromGeneration)).toEqual([OLD, OLD, undefined]);
    expect(await store.serverGeneration()).toBe(NEW);
    expect(await store.restoreState()).toEqual({ resending: 2, unrecoverable: 0 });
  });

  it("leaves the commands the server still holds settled", async () => {
    const { store } = await tillThatSold(3, 3);
    expect((await store.rebaseOntoGeneration(NEW, 3)).resent).toBe(0);
    expect(await store.pendingCount()).toBe(0);
    expect(await store.restoreState()).toEqual({ resending: 0, unrecoverable: 0 });
  });

  it("takes a refused command off the needs-attention list until the server answers again", async () => {
    const store = createSqliteLocalStore(openNodeSqliteDriver(":memory:"));
    await store.adoptServerGeneration(OLD);
    const { command } = await store.enqueue(draft(testId()));
    await store.recordResults([command], [answer(command, "rejected")], SETTLED_AT);
    await store.rebaseOntoGeneration(NEW, 0);
    expect(await store.rejectedCommands()).toEqual([]);
    const [resent] = await store.pendingCommands(10);
    await store.recordResults([resent!], [answer(resent!, "rejected")], SETTLED_AT);
    expect((await store.rejectedCommands()).map((r) => r.command.commandId)).toEqual([
      command.commandId,
    ]);
  });

  it("pulls again from the start, letting the new server's copies replace the old ones", async () => {
    const { store, orders } = await tillThatSold(2, 2);
    await store.applyChanges(page([change(120, order(orders[0]!, 9, { price: "old" }))]));
    await store.rebaseOntoGeneration(NEW, 2);
    expect(await store.cursor()).toBe("0");
    expect((await store.snapshot("order", orders[0]!))?.snapshot).toMatchObject({ price: "old" });
    await store.applyChanges(page([change(101, order(orders[0]!, 3, { price: "new" }))]));
    expect((await store.snapshot("order", orders[0]!))?.snapshot).toMatchObject({ price: "new" });
  });

  it("drops, once the feed is read, copies the new server never sent and nothing waits on", async () => {
    const { store, orders } = await tillThatSold(3, 3);
    const [kept, lost, resent] = orders as [string, string, string];
    await store.rebaseOntoGeneration(NEW, 2);
    await store.applyChanges(page([change(5, order(kept, 2, { by: "new server" }))]));
    const { changed } = await store.dropCopiesTheServerLost();
    expect(changed).toEqual([{ entity: "order", entityId: lost }]);
    expect(await store.snapshot("order", lost)).toBeNull();
    expect(await store.snapshot("order", kept)).not.toBeNull();
    expect(await store.snapshot("order", resent)).not.toBeNull();
  });

  it("counts the commands the server lacks and the journal no longer holds", async () => {
    const { store } = await tillThatSold(4, 4);
    await store.pruneJournal("2026-10-30T00:00:00.000Z", "2026-10-29T00:00:00.000Z");
    const rebase = await store.rebaseOntoGeneration(NEW, 2);
    expect(rebase).toMatchObject({ resent: 0, unrecoverable: 2 });
    expect((await store.restoreState()).unrecoverable).toBe(2);
  });
});

describe("the first generation a till meets", () => {
  it("is remembered as it is, and a later one is not adopted over it", async () => {
    const store = createSqliteLocalStore(openNodeSqliteDriver(":memory:"));
    expect(await store.serverGeneration()).toBeNull();
    await store.adoptServerGeneration(OLD);
    await store.adoptServerGeneration(NEW);
    expect(await store.serverGeneration()).toBe(OLD);
  });
});
