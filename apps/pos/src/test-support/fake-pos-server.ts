import type { SyncCommandEnvelope } from "@fnb/contracts";
import {
  type LocalCommand,
  type LocalStore,
  type SyncTransport,
  SyncTransportError,
  createSqliteLocalStore,
} from "@fnb/sync-client";
import { openNodeSqliteDriver } from "@fnb/sync-client/node-sqlite";
import type { PosDependencies } from "../app/pos-dependencies";
import type { ApiFailure } from "../features/api/api-result";
import type { BootstrapSnapshot, BootstrapSource } from "../features/bootstrap/bootstrap-source";
import { NO_MENU_COPIES, buildTillMenu } from "../features/menu/till-menu";
import { type PrinterPort, previewOnlyPrinter } from "../features/printing/printer-port";
import { CREDENTIAL } from "./credential";
import { type FakeFloorPlan, fakeFloorSource } from "./fake-floor";
import { fakeApiState, fakePosApi, refusal } from "./fake-pos-api";
import { fakeServerRows } from "./fake-server-rows";
import type {
  DeviceCredential,
  DeviceCredentialStore,
} from "../shell-bridge/device-credential-store";

export { CREDENTIAL, refusal };

/** The till's real store, in memory: the screens are tested, not the database. */
export const memoryStore = (): LocalStore =>
  createSqliteLocalStore(openNodeSqliteDriver(":memory:"));

export function memoryCredentials(initial: DeviceCredential | null = null) {
  let saved = initial;
  const store: DeviceCredentialStore = {
    load: async () => saved,
    save: async (credential) => {
      saved = credential;
    },
    clear: async () => {
      saved = null;
    },
  };
  return { store, saved: () => saved };
}

let commandCount = 0;

const orderIdOf = (command: SyncCommandEnvelope) =>
  String((command.payload as Record<string, unknown>).orderId);

/** A draft the till recorded, as the sale screen will record one. */
export function draftCommand(): LocalCommand {
  commandCount += 1;
  const orderId = `0199f000-0000-7000-8000-${commandCount.toString(16).padStart(12, "0")}`;
  return {
    commandId: `0199f000-0000-7000-9000-${commandCount.toString(16).padStart(12, "0")}`,
    type: "order.save_draft",
    payload: { orderId },
    businessDate: "2026-10-20",
    domainVersion: "0.1.0",
    createdAt: "2026-10-20T03:00:00.000Z",
    target: { entity: "order", entityId: orderId, optimistic: { id: orderId, version: 1 } },
  };
}

/**
 * The API as the till sees it, scripted per test and recording every call. `online` false:
 * nothing answers (navigator.onLine would still say true). `refuseCommandsWith`: every
 * pushed command is refused for good with that code.
 */
export function fakeServer(snapshot: BootstrapSnapshot) {
  const apiState = fakeApiState();
  const state = {
    ...apiState,
    bootstrapFailure: null as ApiFailure | null,
    floorPlan: { areas: [], tables: [] } as FakeFloorPlan,
    floorFailure: null as ApiFailure | null,
    refuseCommandsWith: null as string | null,
    /** Commands of a type refused for good with a code, the others answered as usual. */
    refuseTypes: new Map<string, string>(),
    /** The branch's change feed: change n has changeSeq n, the cursor is how many were read. */
    feed: [] as { entity: string; entityId: string; snapshot: Record<string, unknown> | null }[],
    pushed: [] as SyncCommandEnvelope[],
    /** Pushes fail as if the network dropped, while signing in still answers. */
    pushesHeld: false,
    /** The staff credential each batch was pushed with, and the commands in it. */
    pushedWith: [] as { token: string | null; commands: SyncCommandEnvelope[] }[],
    calls: {
      ...apiState.calls,
      bootstrap: 0,
      floor: 0,
      pulls: 0,
      pushedCommands: 0,
    },
  };
  const unreachable = () => refusal(null, null);
  const tableName = (id: string) => state.floorPlan.tables.find((t) => t.id === id)?.name ?? "";
  const menu = buildTillMenu(snapshot, NO_MENU_COPIES, new Set());
  const announce = (entity: string, row: Record<string, unknown>) => {
    state.feed.push({ entity, entityId: String(row.id), snapshot: row });
  };
  const rows = fakeServerRows(CREDENTIAL.deviceId, CREDENTIAL.branchId, menu, tableName, announce);
  const floor = fakeFloorSource(state, rows.rows, state.calls);

  // The calls outside sync read the same state the tests script.
  const api = fakePosApi(state);

  const bootstrap: BootstrapSource = {
    async load() {
      state.calls.bootstrap += 1;
      if (!state.online) return unreachable();
      return state.bootstrapFailure ?? { ok: true, value: snapshot };
    },
  };

  const transport: SyncTransport = {
    async pushCommands(batch) {
      if (!state.online) throw new SyncTransportError("network", null, "offline");
      state.calls.pushedCommands += batch.length;
      state.pushed.push(...batch);
      return batch.map((command) => {
        const code =
          state.refuseCommandsWith ??
          state.refuseTypes.get(command.type) ??
          rows.refusalOf(command) ??
          null;
        // A draft refused over a newer order carries that order, as the server sends it.
        const over = code === "SYNC_ORDER_VERSION_STALE" ? rows.rows.get(orderIdOf(command)) : null;
        if (code !== null && over != null)
          return { commandId: command.commandId, status: "rejected" as const, code, snapshot: over };
        if (code !== null)
          return { commandId: command.commandId, status: "rejected" as const, code };
        const snapshot = rows.answer(command);
        return snapshot === undefined
          ? { commandId: command.commandId, status: "accepted" as const }
          : { commandId: command.commandId, status: "accepted" as const, snapshot };
      });
    },
    // The fake names no generation, so a till never asks it for its device state.
    deviceState: () => Promise.reject(new SyncTransportError("http", 404, "not served")),
    async pullChanges(cursor) {
      if (!state.online) throw new SyncTransportError("network", null, "offline");
      state.calls.pulls += 1;
      const read = Number(cursor);
      const changes = state.feed
        .slice(read)
        .map((change, index) => ({ changeSeq: String(read + index + 1), ...change }));
      return { changes, nextCursor: String(Math.max(read, state.feed.length)) };
    },
  };

  return {
    state,
    api,
    bootstrap,
    floor,
    transport,
    rows: rows.rows,
    /** The row the server would answer a command with, as if another till had sent it. */
    answer: rows.answer,
    qr: rows.qr,
  };
}

/** The POS wired to the fake server, an in-memory store and saved credentials. */
export function fakeDependencies(
  server: ReturnType<typeof fakeServer>,
  options: {
    store?: Promise<LocalStore>;
    credentials?: DeviceCredentialStore;
    printer?: PrinterPort;
  } = {},
): PosDependencies {
  return {
    store: options.store ?? Promise.resolve(memoryStore()),
    credentials: options.credentials ?? memoryCredentials().store,
    api: server.api,
    bootstrap: server.bootstrap,
    floor: server.floor,
    // A push with a staff session the server no longer knows is refused 401, as the API does.
    transportFor: (_credential, staffToken) => ({
      pullChanges: (cursor, limit) => server.transport.pullChanges(cursor, limit),
      deviceState: () => server.transport.deviceState(),
      async pushCommands(batch) {
        const token = staffToken();
        if (server.state.pushesHeld) throw new SyncTransportError("network", null, "held");
        if (server.state.online) server.state.pushedWith.push({ token, commands: [...batch] });
        if (server.state.online && token !== null && server.state.expiredTokens.has(token)) {
          throw new SyncTransportError("http", 401, "answered 401");
        }
        return server.transport.pushCommands(batch);
      },
    }),
    syncIdleMs: 20,
    printer: options.printer ?? previewOnlyPrinter,
    reload: () => {},
  };
}
