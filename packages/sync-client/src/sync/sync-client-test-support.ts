import type { SyncCommandEnvelope, SyncCommandResult, SyncDeviceState } from "@fnb/contracts";
import { testId } from "../local-store/local-store-fixtures";
import { openNodeSqliteDriver } from "../local-store/node-sqlite-driver";
import { createSqliteLocalStore } from "../local-store/sqlite-local-store";
import { type SyncClientOptions, createSyncClient } from "./create-sync-client";
import type { SyncClock } from "./sync-clock";
import { type PulledChanges, SyncTransportError, type SyncTransport } from "./sync-transport";

export { answer, change, draft, order, page } from "../local-store/local-store-fixtures";

type PushAnswer = (batch: readonly SyncCommandEnvelope[]) => SyncCommandResult[];
type PullAnswer = (cursor: string, limit: number) => PulledChanges;
type DeviceStateAnswer = () => SyncDeviceState;

const offline = (): never => {
  throw new SyncTransportError("network", null, "offline");
};

/** A transport answering what each test scripts, recording every call it gets. */
export function scriptedTransport() {
  const pushes: SyncCommandEnvelope[][] = [];
  const pulls: { cursor: string; limit: number }[] = [];
  let deviceStates = 0;
  const script: { push: PushAnswer; pull: PullAnswer; deviceState: DeviceStateAnswer } = {
    push: offline,
    pull: (cursor) => ({ changes: [], nextCursor: cursor }),
    deviceState: offline,
  };
  const transport: SyncTransport = {
    pushCommands: async (batch) => {
      pushes.push([...batch]);
      return script.push(batch);
    },
    pullChanges: async (cursor, limit) => {
      pulls.push({ cursor, limit });
      return script.pull(cursor, limit);
    },
    deviceState: async () => {
      deviceStates += 1;
      return script.deviceState();
    },
  };
  return { transport, pushes, pulls, script, deviceStatesAsked: () => deviceStates };
}

/** A clock whose sleep moves time on at once, recording how long each wait was. */
export function virtualClock(start = 1_000_000) {
  let now = start;
  const sleeps: number[] = [];
  const clock: SyncClock = {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  };
  return { clock, sleeps, advance: (ms: number) => (now += ms) };
}

/** A client on an in-memory store with a scripted server and a virtual clock. */
export function scriptedTill(overrides: Partial<SyncClientOptions> = {}) {
  const store = createSqliteLocalStore(openNodeSqliteDriver(":memory:"));
  const server = scriptedTransport();
  const time = virtualClock();
  const client = createSyncClient({
    store,
    transport: server.transport,
    deviceId: testId(),
    clock: time.clock,
    random: () => 1,
    ...overrides,
  });
  return { store, server, time, client };
}
