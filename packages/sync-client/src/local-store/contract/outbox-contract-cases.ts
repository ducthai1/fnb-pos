import { syncCommandEnvelopeSchema } from "@fnb/contracts";
import { SYNC_CLIENT_ERROR_CODES } from "../../sync-client-error";
import type { LocalStore } from "../local-store";
import { codeOf, orderCommand, testId } from "../local-store-fixtures";
import { assertEqual, assertRejects } from "./contract-assert";
import type { LocalStoreContractGroup } from "./local-store-contract-harness";

const seqsOf = async (store: LocalStore) =>
  (await store.pendingCommands(1_000)).map((command) => command.deviceSeq);

export const OUTBOX_CONTRACT: LocalStoreContractGroup = {
  name: "recording a command in the outbox",
  cases: [
    {
      name: "numbers commands 1, 2, 3 in commit order and hands them back as contract envelopes",
      async run(harness) {
        const { store } = await harness.open();
        const orderId = testId();
        for (let i = 0; i < 3; i += 1) await store.enqueue(orderCommand(orderId));
        const pending = await store.pendingCommands(10);
        assertEqual(
          pending.map((command) => command.deviceSeq),
          [1, 2, 3],
          "device_seq",
        );
        for (const command of pending) {
          assertEqual(syncCommandEnvelopeSchema.safeParse(command).success, true, "envelope");
        }
        assertEqual(await store.pendingCount(), 3, "pending count");
        assertEqual(await store.pendingCommands(2), pending.slice(0, 2), "first two");
      },
    },
    {
      name: "writes the till's expected row with the command and reports it changed",
      async run(harness) {
        const { store } = await harness.open();
        const orderId = testId();
        const recorded = await store.enqueue(
          orderCommand(orderId, {
            target: { entity: "order", entityId: orderId, optimistic: { id: orderId, version: 1 } },
          }),
        );
        assertEqual(recorded.changed, [{ entity: "order", entityId: orderId }], "changed");
        assertEqual(
          await store.snapshot("order", orderId),
          {
            entity: "order",
            entityId: orderId,
            snapshot: { id: orderId, version: 1 },
            source: "optimistic",
            serverVersion: null,
          },
          "view",
        );
        assertEqual(await store.snapshot("order", testId()), null, "unknown row");
      },
    },
    {
      name: "keeps neither the command nor the row when the write fails halfway, and skips no number",
      async run(harness) {
        const db = await harness.open({ fault: { includes: "'optimistic'" } });
        const { store } = db;
        const orderId = testId();
        await store.enqueue(orderCommand(orderId));
        await db.setFaultArmed(true);
        const lost = testId();
        await assertRejects(store.enqueue(orderCommand(lost)), /injected failure/);
        await db.setFaultArmed(false);
        assertEqual(await store.snapshot("order", lost), null, "row of the failed write");
        assertEqual(await store.pendingCount(), 1, "pending count");
        await store.enqueue(orderCommand(orderId));
        assertEqual(await seqsOf(store), [1, 2], "device_seq");
      },
    },
    {
      name: "refuses a command the server would refuse, without using up a number",
      async run(harness) {
        const { store } = await harness.open();
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
          assertEqual(
            await codeOf(store.enqueue(command)),
            SYNC_CLIENT_ERROR_CODES.invalidCommand,
            "code",
          );
        }
        assertEqual(await codeOf(store.enqueue(orderCommand(orderId))), "no-error", "valid one");
        assertEqual(await seqsOf(store), [1], "device_seq");
      },
    },
    {
      name: "refuses a second command with the same id, without using up a number",
      async run(harness) {
        const { store } = await harness.open();
        const first = orderCommand(testId());
        await store.enqueue(first);
        assertEqual(
          await codeOf(store.enqueue({ ...orderCommand(testId()), commandId: first.commandId })),
          SYNC_CLIENT_ERROR_CODES.commandIdTaken,
          "code",
        );
        await store.enqueue(orderCommand(testId()));
        assertEqual(await seqsOf(store), [1, 2], "device_seq");
      },
    },
    {
      name: "never hands the number of a deleted newest command out again",
      async run(harness) {
        const db = await harness.open();
        await db.store.enqueue(orderCommand(testId()));
        await db.store.enqueue(orderCommand(testId()));
        await db.querySql("DELETE FROM outbox WHERE device_seq = 2");
        const next = await db.store.enqueue(orderCommand(testId()));
        assertEqual(next.command.deviceSeq, 3, "device_seq");
      },
    },
  ],
};

export const DEVICE_BINDING_CONTRACT: LocalStoreContractGroup = {
  name: "binding the database to one till",
  cases: [
    {
      name: "binds on first use and accepts the same till again",
      async run(harness) {
        const { store } = await harness.open();
        const deviceId = testId();
        await store.bindDevice(deviceId);
        assertEqual(await codeOf(store.bindDevice(deviceId)), "no-error", "code");
      },
    },
    {
      name: "dates commands by the kept clock offset, and a sent-back one again from the till's reading",
      async run(harness) {
        const { store } = await harness.open();
        const orderId = testId();
        const tillsReading = "2026-10-20T03:05:00.000Z";
        assertEqual(await store.clockOffset(), null, "no offset before any answer");
        const first = await store.enqueue(orderCommand(orderId, { createdAt: tillsReading }));
        assertEqual(first.command.createdAt, tillsReading, "dated by the till before it knows");
        await store.saveClockOffset(-5 * 60_000);
        assertEqual(await store.clockOffset(), -5 * 60_000, "kept offset");
        const second = await store.enqueue(orderCommand(orderId, { createdAt: tillsReading }));
        assertEqual(second.command.createdAt, "2026-10-20T03:00:00.000Z", "dated by the server");
        // Sent back twice: dated from the till's own reading each time, never shifted twice.
        for (let time = 0; time < 2; time += 1) {
          assertEqual(await store.retimePending(1, "2026-10-20T03:10:00.000Z"), 2, "retimed");
          assertEqual(
            (await store.pendingCommands(10)).map((command) => command.createdAt),
            ["2026-10-20T03:00:00.000Z", "2026-10-20T03:00:00.000Z"],
            "dated again",
          );
        }
        await store.retimePending(2, "2026-10-20T02:59:00.000Z");
        assertEqual(
          (await store.pendingCommands(10)).map((command) => command.createdAt),
          ["2026-10-20T03:00:00.000Z", "2026-10-20T02:59:00.000Z"],
          "never after the server's clock, earlier ones untouched",
        );
      },
    },
    {
      name: "forgets everything on a wipe and numbers its next command 1, for another device",
      async run(harness) {
        const { store } = await harness.open();
        await store.bindDevice(testId());
        const orderId = testId();
        await store.enqueue(orderCommand(orderId));
        await store.enqueue(orderCommand(orderId));
        await store.saveClockOffset(60_000);
        assertEqual((await store.pendingCommands(10)).length, 2, "two waiting");
        await store.wipe();
        assertEqual(await store.pendingCount(), 0, "nothing waiting");
        assertEqual(await store.cursor(), "0", "feed starts again");
        assertEqual(await store.clockOffset(), null, "no clock offset");
        assertEqual((await store.rejectedCommands()).length, 0, "nothing refused");
        assertEqual(await store.snapshot("order", orderId), null, "no copies");
        await store.bindDevice(testId());
        const next = await store.enqueue(orderCommand(testId()));
        assertEqual(next.command.deviceSeq, 1, "numbers start again");
      },
    },
    {
      name: "refuses another till's database, whose numbers would collide on the server",
      async run(harness) {
        const { store } = await harness.open();
        await store.bindDevice(testId());
        assertEqual(
          await codeOf(store.bindDevice(testId())),
          SYNC_CLIENT_ERROR_CODES.deviceMismatch,
          "code",
        );
      },
    },
  ],
};
