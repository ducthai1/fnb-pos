import type { SyncCommandEnvelope } from "@fnb/contracts";
import { formatVnd, vnd } from "@fnb/domain";
import type { LocalStore } from "@fnb/sync-client";
import { commandNameOf } from "../messages/vi-sync-errors";
import { refusalSentence } from "../messages/vi";

/** More than any till holds; the screen counts what is there, it does not page. */
const READ_LIMIT = 10_000;

/** What a revoked till holds: commands still waiting, by kind, and those the server refused. */
export interface Held {
  readonly waiting: readonly { readonly name: string; readonly count: number }[];
  readonly refused: readonly {
    readonly id: string;
    readonly name: string;
    readonly sentence: string;
    /** The money it moved, already written out, for a payment or a refund. */
    readonly amount: string | null;
  }[];
}

/** The money a payment or a refund carried, written out; null for any other command. */
export function amountOf(command: SyncCommandEnvelope): string | null {
  const payload = (command.payload as { payments?: unknown; payouts?: unknown } | null) ?? {};
  const rows = Array.isArray(payload.payments)
    ? payload.payments
    : Array.isArray(payload.payouts)
      ? payload.payouts
      : null;
  if (rows === null) return null;
  let total = 0;
  for (const row of rows) {
    const amount = (row as { amount?: unknown } | null)?.amount;
    if (typeof amount === "number" && Number.isSafeInteger(amount)) total += amount;
  }
  return formatVnd(vnd(total));
}

export async function whatTheTillHolds(store: LocalStore): Promise<Held> {
  const [pending, refused] = await Promise.all([
    store.pendingCommands(READ_LIMIT),
    store.rejectedCommands(),
  ]);
  const counts = new Map<string, number>();
  for (const command of pending) {
    const name = commandNameOf(command.type);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    waiting: [...counts].map(([name, count]) => ({ name, count })),
    refused: refused.map((rejected) => ({
      id: rejected.command.commandId,
      name: commandNameOf(rejected.command.type),
      sentence: refusalSentence(rejected.command.type, rejected.code),
      amount: amountOf(rejected.command),
    })),
  };
}
