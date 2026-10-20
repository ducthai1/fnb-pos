import { type SyncTransport, SyncTransportError, createSyncClient } from "@fnb/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREDENTIAL, draftCommand, memoryStore } from "../../test-support/fake-pos-server";
import { type BackgroundSync, startBackgroundSync } from "./background-sync-loop";

const OLD = "0192f5a4-0000-7000-8000-0000000000c1";
const NEW = "0192f5a4-0000-7000-8000-0000000000c2";

/** A server that took every command under OLD, then came back from a backup as NEW. */
function restorableServer() {
  const state = { generation: OLD, pushes: "accepted" as "accepted" | "down", lastDeviceSeq: 0 };
  const transport: SyncTransport = {
    async pushCommands(batch) {
      if (state.pushes === "down") throw new SyncTransportError("network", null, "offline");
      return batch.map((command) => ({ commandId: command.commandId, status: "accepted" }));
    },
    async pullChanges(cursor) {
      return { changes: [], nextCursor: cursor, serverGeneration: state.generation };
    },
    async deviceState() {
      return { serverGeneration: state.generation, lastDeviceSeq: state.lastDeviceSeq };
    },
  };
  return { state, transport };
}

let running: BackgroundSync | null = null;
afterEach(() => running?.stop());

describe("the till's background sync after the server was restored", () => {
  it("counts the commands it sends again until the server has them all", async () => {
    const server = restorableServer();
    const client = createSyncClient({
      store: memoryStore(),
      transport: server.transport,
      deviceId: CREDENTIAL.deviceId,
      clock: { now: () => 0, sleep: async () => {} },
    });
    running = startBackgroundSync({ client, idleMs: 5 });
    const sync = running;
    await client.enqueue(draftCommand());
    await client.enqueue(draftCommand());
    await vi.waitFor(() =>
      expect(sync.current()).toMatchObject({ connection: "online", pending: 0 }),
    );
    expect(sync.current().restore).toEqual({ resending: 0, unrecoverable: 0 });

    server.state.pushes = "down";
    server.state.generation = NEW;
    await vi.waitFor(() =>
      expect(sync.current().restore).toEqual({ resending: 2, unrecoverable: 0 }),
    );
    server.state.pushes = "accepted";
    await vi.waitFor(() =>
      expect(sync.current()).toMatchObject({ pending: 0, restore: { resending: 0 } }),
    );
  });
});
