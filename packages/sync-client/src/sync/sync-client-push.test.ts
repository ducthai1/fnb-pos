import { describe, expect, it } from "vitest";
import { testId } from "../local-store/local-store-test-support";
import { SYNC_CLIENT_ERROR_CODES } from "../sync-client-error";
import { answer, draft, order, scriptedTill } from "./sync-client-test-support";

describe("pushing the outbox", () => {
  it("accepted: shows the server's row once none of the till's own commands on it wait", async () => {
    const { client, server } = scriptedTill();
    const orderId = testId();
    await client.enqueue(draft(orderId, 1, { lines: ["till price"] }));
    expect((await client.snapshot("order", orderId))?.source).toBe("optimistic");
    server.script.push = (batch) =>
      batch.map((c) =>
        answer(c, "accepted", { snapshot: order(orderId, 1, { lines: ["server"] }) }),
      );
    const report = await client.syncOnce();
    expect(report).toMatchObject({ rejected: [], retried: 0, pending: 0, failure: null });
    expect(report.accepted).toHaveLength(1);
    expect(await client.snapshot("order", orderId)).toMatchObject({
      source: "server",
      serverVersion: 1,
      snapshot: { lines: ["server"] },
    });
  });

  it("keeps showing the till's expectation while a later command on the row still waits", async () => {
    const { client, server } = scriptedTill({ batchSize: 1 });
    const orderId = testId();
    await client.enqueue(draft(orderId, 1));
    await client.enqueue(draft(orderId, 2, { status: "paid" }));
    server.script.push = (batch) =>
      batch.map((c) => answer(c, "accepted", { snapshot: order(orderId, 1) }));
    await client.syncOnce();
    expect(await client.snapshot("order", orderId)).toMatchObject({
      source: "optimistic",
      serverVersion: 1,
      snapshot: { status: "paid" },
    });
  });

  it("rejected: kept for the needs-attention screen, the server's row replaces the till's", async () => {
    const { client, server } = scriptedTill();
    const orderId = testId();
    const paid = await client.enqueue(draft(orderId, 3, { status: "paid" }));
    server.script.push = (batch) =>
      batch.map((c) =>
        answer(c, "rejected", {
          code: "DOMAIN_ORDER_TOTAL_MISMATCH",
          snapshot: order(orderId, 2, { status: "draft" }),
        }),
      );
    const report = await client.syncOnce();
    expect(report.rejected).toEqual([paid.commandId]);
    expect(await client.snapshot("order", orderId)).toMatchObject({
      source: "server",
      snapshot: { status: "draft" },
    });
    expect(await client.rejectedCommands()).toEqual([
      {
        entity: "order",
        entityId: orderId,
        command: paid,
        code: "DOMAIN_ORDER_TOTAL_MISMATCH",
        serverSnapshot: order(orderId, 2, { status: "draft" }),
      },
    ]);
  });

  it("rejected without a row: a new order the server never stored disappears", async () => {
    const { client, server } = scriptedTill();
    const orderId = testId();
    await client.enqueue(draft(orderId));
    server.script.push = (batch) => batch.map((c) => answer(c, "rejected"));
    await client.syncOnce();
    expect(await client.snapshot("order", orderId)).toBeNull();
    expect(await client.rejectedCommands()).toHaveLength(1);
  });

  it("rejected with the server's row while a later command waits: the expectation restarts from it", async () => {
    const { client, server } = scriptedTill({ batchSize: 1 });
    const orderId = testId();
    await client.enqueue(draft(orderId, 3, { lines: 2 }));
    await client.enqueue(draft(orderId, 4, { lines: 3 }));
    server.script.push = (batch) =>
      batch.map((c) => answer(c, "rejected", { snapshot: order(orderId, 2, { lines: 1 }) }));
    await client.syncOnce();
    expect(await client.snapshot("order", orderId)).toMatchObject({
      source: "optimistic",
      snapshot: { lines: 1 },
    });
  });

  it("retry: the commands stay pending and go again from the oldest, after a backoff", async () => {
    const { client, server, time } = scriptedTill();
    const orderId = testId();
    await client.enqueue(draft(orderId));
    await client.enqueue(draft(orderId, 2));
    server.script.push = (batch) => batch.map((c) => answer(c, "retry"));
    const first = await client.syncOnce();
    expect(first).toMatchObject({ retried: 2, pending: 2, accepted: [] });
    expect(first.failure).toEqual({ stage: "push", kind: "out_of_order" });
    server.script.push = (batch) => batch.map((c) => answer(c, "accepted"));
    const second = await client.syncOnce();
    expect(second).toMatchObject({ pending: 0, failure: null });
    expect(server.pushes.map((batch) => batch.map((c) => c.deviceSeq))).toEqual([
      [1, 2],
      [1, 2],
    ]);
    expect(time.sleeps).toHaveLength(1);
  });

  it("refuses answers for commands outside the batch or twice for one, settling none of them", async () => {
    const { client, server } = scriptedTill({ batchSize: 1 });
    await client.enqueue(draft(testId()));
    const notSent = await client.enqueue(draft(testId()));
    const unexpected = [
      (batch: readonly (typeof notSent)[]) => [
        ...batch.map((c) => answer(c, "accepted")),
        answer(notSent, "accepted"),
      ],
      (batch: readonly (typeof notSent)[]) =>
        [...batch, ...batch].map((c) => answer(c, "accepted")),
      (batch: readonly (typeof notSent)[]) => [
        answer({ ...batch[0]!, commandId: testId() }, "accepted"),
      ],
    ];
    for (const script of unexpected) {
      server.script.push = script;
      const report = await client.syncOnce();
      expect(report.failure).toEqual({
        stage: "push",
        kind: "protocol",
        code: SYNC_CLIENT_ERROR_CODES.unexpectedResult,
      });
      expect(report.pending).toBe(2);
    }
  });

  it("has one batch in flight: a second pass asked for meanwhile is the same pass", async () => {
    const { client, server } = scriptedTill({ batchSize: 2 });
    for (let i = 0; i < 3; i += 1) await client.enqueue(draft(testId()));
    server.script.push = (batch) => batch.map((c) => answer(c, "accepted"));
    const [a, b] = await Promise.all([client.syncOnce(), client.syncOnce()]);
    expect(a).toBe(b);
    expect(server.pushes.map((batch) => batch.map((c) => c.deviceSeq))).toEqual([[1, 2]]);
    await client.syncOnce();
    expect(server.pushes.map((batch) => batch.map((c) => c.deviceSeq))).toEqual([[1, 2], [3]]);
  });
});

describe("pushing the commands of two staff sessions", () => {
  it("sends each session's run of commands in a batch of its own, in device_seq order", async () => {
    const { client, server } = scriptedTill();
    const [lan, minh] = [testId(), testId()];
    const by = (session: string | undefined) => ({ ...draft(testId()), staffSessionId: session });
    const sent = [];
    for (const session of [lan, lan, minh, undefined, lan]) {
      sent.push(await client.enqueue(by(session)));
    }
    server.script.push = (batch) => batch.map((c) => answer(c, "accepted"));
    for (let pass = 0; pass < 4; pass += 1) await client.syncOnce();
    expect(server.pushes.map((batch) => batch.map((command) => command.deviceSeq))).toEqual([
      [1, 2],
      [3],
      [4],
      [5],
    ]);
    expect(server.pushes.map((batch) => batch[0]?.staffSessionId)).toEqual([
      lan,
      minh,
      undefined,
      lan,
    ]);
    expect(await client.pendingCount()).toBe(0);
    expect(sent.map((command) => command.deviceSeq)).toEqual([1, 2, 3, 4, 5]);
  });
});
