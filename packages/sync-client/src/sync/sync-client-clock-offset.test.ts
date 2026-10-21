import { SYNC_CLOCK_ERROR_CODES } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { testId } from "../local-store/local-store-test-support";
import { answer, draft, scriptedTill, virtualClock } from "./sync-client-test-support";

const MINUTE = 60_000;
const SERVER_NOW = Date.parse("2026-10-20T03:00:00.000Z");

/** A till whose own clock reads `aheadMs` past the server's. */
function tillAhead(aheadMs: number) {
  const time = virtualClock(SERVER_NOW + aheadMs);
  return { ...scriptedTill({ clock: time.clock }), time };
}

const tillsReading = (time: { clock: { now(): number } }) =>
  new Date(time.clock.now()).toISOString();

describe("a till dating its commands by the server's clock", () => {
  it("learns the offset from a pull, against the middle of the round trip", async () => {
    const { client, server, time } = tillAhead(5 * MINUTE);
    server.script.pull = (cursor) => {
      time.advance(2_000);
      return { changes: [], nextCursor: cursor, serverTimeMs: SERVER_NOW + 1_000 };
    };
    expect(await client.clockOffset()).toBeNull();
    await client.syncOnce();
    expect(await client.clockOffset()).toBe(-5 * MINUTE);
  });

  it("stamps a command recorded after that as the till's time plus the offset", async () => {
    const { client, server, time } = tillAhead(5 * MINUTE);
    server.script.pull = (cursor) => ({
      changes: [],
      nextCursor: cursor,
      serverTimeMs: SERVER_NOW,
    });
    await client.syncOnce();
    const recorded = await client.enqueue({ ...draft(testId()), createdAt: tillsReading(time) });
    expect(recorded.createdAt).toBe("2026-10-20T03:00:00.000Z");
    server.script.push = (batch) => batch.map((command) => answer(command, "accepted"));
    await client.syncOnce();
    expect(server.pushes[0]?.[0]?.createdAt).toBe("2026-10-20T03:00:00.000Z");
  });

  it("keeps using the last offset while offline", async () => {
    const { client, server, time } = tillAhead(3 * MINUTE);
    server.script.pull = (cursor) => ({
      changes: [],
      nextCursor: cursor,
      serverTimeMs: SERVER_NOW,
    });
    await client.syncOnce();
    server.script.pull = () => {
      throw new Error("offline");
    };
    time.advance(10 * MINUTE);
    const recorded = await client.enqueue({ ...draft(testId()), createdAt: tillsReading(time) });
    expect(recorded.createdAt).toBe("2026-10-20T03:10:00.000Z");
  });

  it("dates a command the server sent back again, once, and sends it under the same id", async () => {
    const { client, server, time } = tillAhead(5 * MINUTE);
    const sent = await client.enqueue({ ...draft(testId()), createdAt: tillsReading(time) });
    expect(sent.createdAt).toBe("2026-10-20T03:05:00.000Z");
    const sendBack = (batch: Parameters<typeof server.script.push>[0]) => ({
      results: batch.map((command) => ({
        commandId: command.commandId,
        status: "retry" as const,
        code: SYNC_CLOCK_ERROR_CODES.deviceClockAhead,
      })),
      serverTimeMs: SERVER_NOW,
    });
    server.script.push = sendBack;
    const first = await client.syncOnce();
    expect(first).toMatchObject({ retried: 1, pending: 1, failure: null });
    // Sent back a second time: dated from the till's own reading again, not shifted twice.
    await client.syncOnce();
    server.script.push = (batch) => batch.map((command) => answer(command, "accepted"));
    const last = await client.syncOnce();
    expect(last.accepted).toEqual([sent.commandId]);
    expect(server.pushes.map((batch) => batch.map((c) => [c.commandId, c.deviceSeq]))).toEqual([
      [[sent.commandId, 1]],
      [[sent.commandId, 1]],
      [[sent.commandId, 1]],
    ]);
    expect(server.pushes.map((batch) => batch[0]?.createdAt)).toEqual([
      "2026-10-20T03:05:00.000Z",
      "2026-10-20T03:00:00.000Z",
      "2026-10-20T03:00:00.000Z",
    ]);
    expect(await client.rejectedCommands()).toEqual([]);
  });
});
