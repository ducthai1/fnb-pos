import type {
  EntitySnapshot,
  SyncChange,
  SyncChangesPage,
  SyncCommandEnvelope,
  SyncCommandResult,
} from "@fnb/contracts";
import { orderCommand, testId } from "../local-store/local-store-test-support";
import { openNodeSqliteDriver } from "../local-store/node-sqlite-driver";
import { createSqliteLocalStore } from "../local-store/sqlite-local-store";
import { type SyncClientOptions, createSyncClient } from "./create-sync-client";
import type { SyncClock } from "./sync-clock";
import { SyncTransportError, type SyncTransport } from "./sync-transport";

type PushAnswer = (batch: readonly SyncCommandEnvelope[]) => SyncCommandResult[];
type PullAnswer = (cursor: string, limit: number) => SyncChangesPage;

const offline = (): never => {
  throw new SyncTransportError("network", null, "offline");
};

/** A transport answering what each test scripts, recording every call it gets. */
export function scriptedTransport() {
  const pushes: SyncCommandEnvelope[][] = [];
  const pulls: { cursor: string; limit: number }[] = [];
  const script: { push: PushAnswer; pull: PullAnswer } = {
    push: offline,
    pull: (cursor) => ({ changes: [], nextCursor: cursor }),
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
  };
  return { transport, pushes, pulls, script };
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

export const order = (
  id: string,
  version: number,
  extra: object = {},
): EntitySnapshot & { id: string } => ({
  id,
  version,
  ...extra,
});

export const answer = (
  command: SyncCommandEnvelope,
  status: "accepted" | "rejected" | "retry",
  extra: { snapshot?: EntitySnapshot; code?: string } = {},
): SyncCommandResult =>
  (status === "rejected"
    ? { commandId: command.commandId, status, code: extra.code ?? "DOMAIN_TEST", ...extra }
    : status === "accepted"
      ? {
          commandId: command.commandId,
          status,
          ...(extra.snapshot === undefined ? {} : { snapshot: extra.snapshot }),
        }
      : { commandId: command.commandId, status }) as SyncCommandResult;

export const change = (seq: number, snapshot: EntitySnapshot & { id: string }): SyncChange => ({
  changeSeq: String(seq),
  entity: "order",
  entityId: snapshot.id,
  snapshot,
});

export const page = (changes: SyncChange[], nextCursor?: string): SyncChangesPage => ({
  changes,
  nextCursor: nextCursor ?? changes.at(-1)?.changeSeq ?? "0",
});

/** A save_draft for `orderId` with the till's expected row at `version`. */
export const draft = (orderId: string, version = 1, extra: object = {}) =>
  orderCommand(orderId, {
    target: { entity: "order", entityId: orderId, optimistic: order(orderId, version, extra) },
  });
