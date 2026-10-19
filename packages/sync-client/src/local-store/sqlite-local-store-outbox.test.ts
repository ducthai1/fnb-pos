import { syncCommandEnvelopeSchema } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { SYNC_CLIENT_ERROR_CODES } from "../sync-client-error";
import type { LocalStore } from "./local-store";
import { faultyDriver, orderCommand, testId } from "./local-store-test-support";
import { openNodeSqliteDriver } from "./node-sqlite-driver";
import { createSqliteLocalStore } from "./sqlite-local-store";

const memoryStore = () => createSqliteLocalStore(openNodeSqliteDriver(":memory:"));

const codeOf = async (work: Promise<unknown>) =>
  work.then(
    () => "no-error",
    (error: { code?: string }) => error.code ?? "no-code",
  );

const seqsOf = async (store: LocalStore) =>
  (await store.pendingCommands(1_000)).map((command) => command.deviceSeq);

describe("recording a command in the outbox", () => {
  it("numbers commands 1, 2, 3 in commit order and hands them back as contract envelopes", async () => {
    const store = memoryStore();
    const orderId = testId();
    for (let i = 0; i < 3; i += 1) await store.enqueue(orderCommand(orderId));
    const pending = await store.pendingCommands(10);
    expect(pending.map((command) => command.deviceSeq)).toEqual([1, 2, 3]);
    for (const command of pending) {
      expect(syncCommandEnvelopeSchema.safeParse(command).success).toBe(true);
    }
    expect(await store.pendingCount()).toBe(3);
    expect(await store.pendingCommands(2)).toEqual(pending.slice(0, 2));
  });

  it("writes the till's expected row with the command and reports it changed", async () => {
    const store = memoryStore();
    const orderId = testId();
    const recorded = await store.enqueue(
      orderCommand(orderId, {
        target: { entity: "order", entityId: orderId, optimistic: { id: orderId, version: 1 } },
      }),
    );
    expect(recorded.changed).toEqual([{ entity: "order", entityId: orderId }]);
    expect(await store.snapshot("order", orderId)).toEqual({
      entity: "order",
      entityId: orderId,
      snapshot: { id: orderId, version: 1 },
      source: "optimistic",
      serverVersion: null,
    });
    expect(await store.snapshot("order", testId())).toBeNull();
  });

  it("keeps neither the command nor the row when the write fails halfway, and skips no number", async () => {
    const { driver, control } = faultyDriver(openNodeSqliteDriver(":memory:"), (sql) =>
      sql.includes("'optimistic'"),
    );
    const store = createSqliteLocalStore(driver);
    const orderId = testId();
    await store.enqueue(orderCommand(orderId));
    control.armed = true;
    const lost = testId();
    await expect(store.enqueue(orderCommand(lost))).rejects.toThrow(/injected failure/);
    control.armed = false;
    expect(await store.snapshot("order", lost)).toBeNull();
    expect(await store.pendingCount()).toBe(1);
    await store.enqueue(orderCommand(orderId));
    expect(await seqsOf(store)).toEqual([1, 2]);
  });

  it("refuses a command the server would refuse, without using up a number", async () => {
    const store = memoryStore();
    const orderId = testId();
    const malformed = [
      orderCommand(orderId, { commandId: "NOT-A-UUID" }),
      orderCommand(orderId, { businessDate: "2026-13-01" }),
      orderCommand(orderId, { type: "Order Save" }),
      { ...orderCommand(orderId), deviceId: testId() },
      orderCommand(orderId, {
        target: { entity: "Order", entityId: orderId, optimistic: { id: orderId } },
      }),
    ];
    for (const command of malformed) {
      expect(await codeOf(store.enqueue(command))).toBe(SYNC_CLIENT_ERROR_CODES.invalidCommand);
    }
    expect(await codeOf(store.enqueue(orderCommand(orderId)))).toBe("no-error");
    expect(await seqsOf(store)).toEqual([1]);
  });

  it("refuses a second command with the same id, without using up a number", async () => {
    const store = memoryStore();
    const first = orderCommand(testId());
    await store.enqueue(first);
    expect(
      await codeOf(store.enqueue({ ...orderCommand(testId()), commandId: first.commandId })),
    ).toBe(SYNC_CLIENT_ERROR_CODES.commandIdTaken);
    await store.enqueue(orderCommand(testId()));
    expect(await seqsOf(store)).toEqual([1, 2]);
  });

  it("never hands the number of a deleted newest command out again", async () => {
    const driver = openNodeSqliteDriver(":memory:");
    const store = createSqliteLocalStore(driver);
    await store.enqueue(orderCommand(testId()));
    await store.enqueue(orderCommand(testId()));
    driver.run("DELETE FROM outbox WHERE device_seq = 2");
    const next = await store.enqueue(orderCommand(testId()));
    expect(next.command.deviceSeq).toBe(3);
  });
});

describe("binding the database to one till", () => {
  it("binds on first use and accepts the same till again", async () => {
    const store = memoryStore();
    const deviceId = testId();
    await store.bindDevice(deviceId);
    expect(await codeOf(store.bindDevice(deviceId))).toBe("no-error");
  });

  it("refuses another till's database, whose numbers would collide on the server", async () => {
    const store = memoryStore();
    await store.bindDevice(testId());
    expect(await codeOf(store.bindDevice(testId()))).toBe(SYNC_CLIENT_ERROR_CODES.deviceMismatch);
  });
});
