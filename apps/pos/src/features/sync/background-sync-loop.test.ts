import { type SyncTransport, SyncTransportError, createSyncClient } from "@fnb/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREDENTIAL, draftCommand, memoryStore } from "../../test-support/fake-pos-server";
import { type BackgroundSync, startBackgroundSync } from "./background-sync-loop";

type Link = "up" | "down" | "erroring";

/** A server that is up, unreachable, or answering 500; counts the pulls it serves. */
function serverLink() {
  const state = { link: "up" as Link, pulls: 0 };
  const fail = () => {
    if (state.link === "down") throw new SyncTransportError("network", null, "offline");
    if (state.link === "erroring") throw new SyncTransportError("http", 500, "boom");
  };
  const transport: SyncTransport = {
    async pushCommands(batch) {
      fail();
      return batch.map((command) => ({
        commandId: command.commandId,
        status: "accepted" as const,
      }));
    },
    async pullChanges(cursor) {
      fail();
      state.pulls += 1;
      return { changes: [], nextCursor: cursor };
    },
    // This server names no generation, so the till never asks for its device state.
    deviceState: () => Promise.reject(new SyncTransportError("http", 404, "not served")),
  };
  return { state, transport };
}

let running: BackgroundSync | null = null;
afterEach(() => running?.stop());

/** The loop on a real client and store; backoff waits pass at once on a virtual clock. */
function startLoop(idleMs: number, sleep: (ms: number) => Promise<void> = async () => {}) {
  const server = serverLink();
  const client = createSyncClient({
    store: memoryStore(),
    transport: server.transport,
    deviceId: CREDENTIAL.deviceId,
    clock: { now: () => 0, sleep },
  });
  running = startBackgroundSync({ client, idleMs });
  return { server, client, sync: running };
}

describe("the till's background sync", () => {
  it("reports online once a pass got through, offline when nothing answers, and online again", async () => {
    const { server, sync } = startLoop(5);
    expect(sync.current().connection).toBe("checking");
    await vi.waitFor(() => expect(sync.current().connection).toBe("online"));
    server.state.link = "down";
    await vi.waitFor(() => expect(sync.current().connection).toBe("offline"));
    server.state.link = "up";
    await vi.waitFor(() => expect(sync.current().connection).toBe("online"));
  });

  it("tells a server answering with an error apart from one that does not answer", async () => {
    const { server, sync } = startLoop(5);
    server.state.link = "erroring";
    await vi.waitFor(() => expect(sync.current().connection).toBe("server_error"));
  });

  it("counts a command as soon as it is recorded, and settles it on the next pass", async () => {
    const { server, client, sync } = startLoop(60_000);
    await vi.waitFor(() => expect(sync.current().connection).toBe("online"));
    server.state.link = "down";
    await client.enqueue(draftCommand());
    await vi.waitFor(() =>
      expect(sync.current()).toMatchObject({ connection: "offline", pending: 1 }),
    );
    server.state.link = "up";
    sync.nudge();
    await vi.waitFor(() =>
      expect(sync.current()).toMatchObject({ connection: "online", pending: 0 }),
    );
  });

  it("counts a sale recorded while a pass waits out its backoff, without waiting for that pass", async () => {
    let sleeping = 0;
    const backoff = () => new Promise<void>(() => void (sleeping += 1));
    const { server, client, sync } = startLoop(5, backoff);
    server.state.link = "down";
    await vi.waitFor(() => expect(sleeping).toBe(1));
    expect(sync.current()).toMatchObject({ connection: "offline", pending: 0 });
    await client.enqueue(draftCommand());
    await vi.waitFor(() => expect(sync.current().pending).toBe(1));
  });

  it("runs the next pass at once when nudged instead of after the idle wait", async () => {
    const { server, sync } = startLoop(60_000);
    await vi.waitFor(() => expect(server.state.pulls).toBe(1));
    sync.nudge();
    await vi.waitFor(() => expect(server.state.pulls).toBe(2));
  });

  it("waits the idle time between passes when not nudged", async () => {
    const { server } = startLoop(60_000);
    await vi.waitFor(() => expect(server.state.pulls).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.state.pulls).toBe(1);
  });

  it("stops passing and publishing once stopped", async () => {
    const { server, sync } = startLoop(5);
    await vi.waitFor(() => expect(server.state.pulls).toBeGreaterThan(0));
    const heard: number[] = [];
    sync.subscribe(() => void heard.push(1));
    sync.stop();
    const pullsAtStop = server.state.pulls;
    sync.nudge();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(server.state.pulls).toBeLessThanOrEqual(pullsAtStop + 1);
    expect(heard).toEqual([]);
  });
});
