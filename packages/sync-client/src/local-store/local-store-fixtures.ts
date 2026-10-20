import type {
  EntitySnapshot,
  SyncChange,
  SyncChangesPage,
  SyncCommandEnvelope,
  SyncCommandResult,
} from "@fnb/contracts";
import type { LocalCommand } from "./local-store";
import type { SqliteDriver } from "./sqlite-driver";

// Test data with no Node import: the same fixtures build commands for the store under
// Vitest and inside a browser page, where the store runs in a Worker.

/**
 * The driver, except that a statement matching `failWhen` throws once `armed` is set: the
 * way a full disk or a crash in the middle of a write looks to the store.
 */
export function faultyDriver(inner: SqliteDriver, failWhen: (sql: string) => boolean) {
  const control = { armed: false };
  const check = (sql: string) => {
    if (control.armed && failWhen(sql)) throw new Error(`injected failure on: ${sql}`);
  };
  const driver: SqliteDriver = {
    exec: (sql) => inner.exec(sql),
    run: (sql, params) => (check(sql), inner.run(sql, params)),
    all: (sql, params) => (check(sql), inner.all(sql, params)),
    close: () => inner.close(),
  };
  return { driver, control };
}

let counter = 0;
const hex = (n: number, width: number) => n.toString(16).padStart(width, "0");

/** A well-formed lowercase uuid, unique within the test run. */
export function testId(): string {
  counter += 1;
  return `0199f000-0000-7000-8000-${hex(counter, 12)}`;
}

/** An order command as a POS would record it, with its expected order row. */
export function orderCommand(orderId: string, overrides: Partial<LocalCommand> = {}): LocalCommand {
  return {
    commandId: testId(),
    type: "order.save_draft",
    payload: { orderId },
    businessDate: "2026-10-20",
    domainVersion: "0.1.0",
    createdAt: "2026-10-20T03:00:00.000Z",
    target: { entity: "order", entityId: orderId, optimistic: { id: orderId, version: 1 } },
    ...overrides,
  };
}

/** The code a store call was refused with, "no-error" when it went through. */
export const codeOf = async (work: Promise<unknown>): Promise<string> =>
  work.then(
    () => "no-error",
    (error: { code?: string }) => error.code ?? "no-code",
  );

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
