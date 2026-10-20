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
import type { PosApi } from "../features/api/pos-api";
import type { BootstrapSnapshot, BootstrapSource } from "../features/bootstrap/bootstrap-source";
import type {
  DeviceCredential,
  DeviceCredentialStore,
} from "../shell-bridge/device-credential-store";

export const CREDENTIAL: DeviceCredential = {
  deviceId: "0199f000-0000-7000-8000-00000000d001",
  branchId: "0199f000-0000-7000-8000-00000000b001",
  deviceToken: "0199f000-0000-7000-8000-00000000a001.secret",
};

export const refusal = (
  status: number | null,
  code: string | null,
  body?: unknown,
): ApiFailure => ({
  ok: false,
  status,
  code,
  body: body ?? (code === null ? null : { code }),
});

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
  const state = {
    online: true,
    pairingCode: "ABCDEFGH",
    pins: new Map<string, string>(),
    bootstrapFailure: null as ApiFailure | null,
    refuseCommandsWith: null as string | null,
    /** The branch's change feed: change n has changeSeq n, the cursor is how many were read. */
    feed: [] as { entity: string; entityId: string; snapshot: Record<string, unknown> | null }[],
    pushed: [] as SyncCommandEnvelope[],
    calls: {
      pair: [] as { code: string; deviceName: string }[],
      signIn: [] as { staffId: string; pin: string; deviceToken: string }[],
      bootstrap: 0,
      pulls: 0,
      pushedCommands: 0,
    },
  };
  const unreachable = () => refusal(null, null);

  const api: PosApi = {
    async pairDevice(input) {
      state.calls.pair.push(input);
      if (!state.online) return unreachable();
      if (input.code !== state.pairingCode) return refusal(401, "API_DEVICE_PAIRING_CODE_INVALID");
      return { ok: true, value: CREDENTIAL };
    },
    async startStaffSession(credential, input) {
      state.calls.signIn.push({ ...input, deviceToken: credential.deviceToken });
      if (!state.online) return unreachable();
      if (state.pins.get(input.staffId) !== input.pin) return refusal(401, "API_STAFF_PIN_INVALID");
      const session = { staffId: input.staffId, token: `staff-${input.staffId}` };
      return { ok: true, value: { ...session, expiresAt: "2026-10-20T15:00:00.000Z" } };
    },
  };

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
      const code = state.refuseCommandsWith;
      return batch.map((command) =>
        code === null
          ? { commandId: command.commandId, status: "accepted" as const }
          : { commandId: command.commandId, status: "rejected" as const, code },
      );
    },
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

  return { state, api, bootstrap, transport };
}

/** The POS wired to the fake server, an in-memory store and saved credentials. */
export function fakeDependencies(
  server: ReturnType<typeof fakeServer>,
  options: { store?: Promise<LocalStore>; credentials?: DeviceCredentialStore } = {},
): PosDependencies {
  return {
    store: options.store ?? Promise.resolve(memoryStore()),
    credentials: options.credentials ?? memoryCredentials().store,
    api: server.api,
    bootstrap: server.bootstrap,
    transportFor: () => server.transport,
    syncIdleMs: 20,
    reload: () => {},
  };
}
