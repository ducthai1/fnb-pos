import { SYNC_CLOCK_ERROR_CODES, type SyncCommandEnvelope } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { orderCommand, testId } from "../local-store/local-store-fixtures";
import { openNodeSqliteDriver } from "../local-store/node-sqlite-driver";
import { createSqliteLocalStore } from "../local-store/sqlite-local-store";
import { flushOutboxUnderGrant } from "./flush-outbox-under-grant";
import { answer, scriptedTransport } from "./sync-client-test-support";
import { SyncTransportError } from "./sync-transport";

const NOW = () => "2026-10-20T04:00:00.000Z";

async function tillHolding(count: number) {
  const store = createSqliteLocalStore(openNodeSqliteDriver(":memory:"));
  for (let i = 0; i < count; i++) await store.enqueue(orderCommand(testId()));
  return store;
}

/** A transport serving flushes with `answer`, recording each batch and its `final` flag. */
function flushingTransport(
  reply: (batch: readonly SyncCommandEnvelope[], call: number) => unknown,
) {
  const { transport } = scriptedTransport();
  const calls: { code: string; size: number; final: boolean; seqs: number[] }[] = [];
  transport.flushUnderGrant = async (code, batch, final) => {
    calls.push({ code, size: batch.length, final, seqs: batch.map((c) => c.deviceSeq) });
    return reply(batch, calls.length) as never;
  };
  return { transport, calls };
}

const allAccepted = (batch: readonly SyncCommandEnvelope[]) => ({
  results: batch.map((c) => answer(c, "accepted")),
});

describe("flushing a revoked till's outbox under a grant", () => {
  it("sends it oldest first in batches, final only on the one that empties it", async () => {
    const store = await tillHolding(250);
    const { transport, calls } = flushingTransport(allAccepted);
    const outcome = await flushOutboxUnderGrant(store, transport, "ABCD2345", NOW);
    expect(outcome).toEqual({ kind: "done", accepted: 250, rejected: 0 });
    expect(calls.map((c) => [c.size, c.final])).toEqual([
      [100, false],
      [100, false],
      [50, true],
    ]);
    expect(calls.flatMap((c) => c.seqs)).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
    expect(await store.pendingCount()).toBe(0);
  });

  it("puts a refusal on the refused list, where the till shows it, never dropping it", async () => {
    const store = await tillHolding(3);
    const { transport } = flushingTransport((batch) => ({
      results: batch.map((c, i) =>
        i === 1 ? answer(c, "rejected", { code: "SYNC_ORDER_VERSION_STALE" }) : answer(c, "accepted"),
      ),
    }));
    expect(await flushOutboxUnderGrant(store, transport, "ABCD2345", NOW)).toEqual({
      kind: "done",
      accepted: 2,
      rejected: 1,
    });
    const refused = await store.rejectedCommands();
    expect(refused.map((r) => [r.command.deviceSeq, r.code])).toEqual([
      [2, "SYNC_ORDER_VERSION_STALE"],
    ]);
  });

  it("stops where the network cut it off, and the same code finishes the rest", async () => {
    const store = await tillHolding(150);
    let down = true;
    const { transport, calls } = flushingTransport((batch, call) => {
      if (call === 2 && down) throw new SyncTransportError("network", null, "dropped");
      return allAccepted(batch);
    });
    const cut = await flushOutboxUnderGrant(store, transport, "ABCD2345", NOW);
    expect(cut).toMatchObject({ kind: "failed", accepted: 100, rejected: 0 });
    expect(cut.kind === "failed" && cut.error.kind).toBe("network");
    expect(await store.pendingCount()).toBe(50);
    down = false;
    expect(await flushOutboxUnderGrant(store, transport, "ABCD2345", NOW)).toEqual({
      kind: "done",
      accepted: 50,
      rejected: 0,
    });
    expect(calls.map((c) => c.final)).toEqual([false, true, true]);
  });

  it("stops at once on a spent code, saying what the server said", async () => {
    const store = await tillHolding(2);
    const { transport } = flushingTransport(() => {
      throw new SyncTransportError("http", 401, "answered 401", "API_DEVICE_FLUSH_GRANT_INVALID");
    });
    const outcome = await flushOutboxUnderGrant(store, transport, "ABCD2345", NOW);
    expect(outcome.kind === "failed" && outcome.error.code).toBe("API_DEVICE_FLUSH_GRANT_INVALID");
    expect(await store.pendingCount()).toBe(2);
  });

  it("dates its commands again once by the server's clock, and does not spin after", async () => {
    const store = await tillHolding(1);
    const serverTimeMs = Date.parse("2026-10-20T02:59:00.000Z");
    const ahead = (batch: readonly SyncCommandEnvelope[]) => ({
      serverTimeMs,
      results: batch.map((c) => ({
        commandId: c.commandId,
        status: "retry" as const,
        code: SYNC_CLOCK_ERROR_CODES.deviceClockAhead,
      })),
    });
    const { transport, calls } = flushingTransport((batch, call) =>
      call === 1 ? ahead(batch) : allAccepted(batch),
    );
    expect(await flushOutboxUnderGrant(store, transport, "ABCD2345", NOW)).toMatchObject({
      kind: "done",
      accepted: 1,
    });
    expect(calls).toHaveLength(2);

    const stuck = await tillHolding(1);
    const spinning = flushingTransport((batch) => ({
      results: batch.map((c) => answer(c, "retry")),
    }));
    const outcome = await flushOutboxUnderGrant(stuck, spinning.transport, "ABCD2345", NOW);
    expect(outcome.kind).toBe("failed");
    expect(spinning.calls).toHaveLength(2);
    expect(await stuck.pendingCount()).toBe(1);
  });

  it("says it cannot when the transport serves no flush", async () => {
    const store = await tillHolding(1);
    const { transport } = scriptedTransport();
    expect((await flushOutboxUnderGrant(store, transport, "ABCD2345", NOW)).kind).toBe("failed");
    expect(await store.pendingCount()).toBe(1);
  });
});
