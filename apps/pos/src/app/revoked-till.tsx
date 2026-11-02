import { DEVICE_UNAUTHENTICATED_CODE, type SyncCommandEnvelope } from "@fnb/contracts";
import { formatVnd, vnd } from "@fnb/domain";
import {
  type FlushOutcome,
  type LocalStore,
  type SyncTransport,
  flushOutboxUnderGrant,
} from "@fnb/sync-client";
import { useCallback, useEffect, useState } from "react";
import { commandNameOf } from "../messages/vi-sync-errors";
import { refusalSentence, vi } from "../messages/vi";
import {
  type RefusedItem,
  TillRevokedScreen,
  type WaitingGroup,
} from "../screens/pair-device/till-revoked-screen";
import type { DeviceCredentialStore } from "../shell-bridge/device-credential-store";

/** More than any till holds; the screen counts what is there, it does not page. */
const READ_LIMIT = 10_000;

interface Held {
  readonly waiting: readonly WaitingGroup[];
  readonly refused: readonly RefusedItem[];
}

/** The money a payment or a refund carried, written out; null for any other command. */
function amountOf(command: SyncCommandEnvelope): string | null {
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

async function whatTheTillHolds(store: LocalStore): Promise<Held> {
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

/** What the till says when a flush stopped short; null when the outbox went up whole. */
function flushFailure(outcome: FlushOutcome): string | null {
  if (outcome.kind === "done") return null;
  const { error } = outcome;
  if (error.kind === "network") return vi.revoked.flush.offline;
  if (error.status === 426) return vi.revoked.flush.tooOld;
  if (error.status === 409) return vi.revoked.flush.notRevoked;
  if (error.status === 401 && error.code !== DEVICE_UNAUTHENTICATED_CODE) {
    return vi.revoked.flush.invalid;
  }
  return vi.revoked.flush.failed;
}

/**
 * A till the server no longer knows. It reads what the till still holds and shows it before
 * anything is cleared. A manager's code sends the unsent commands up once (what the server
 * refuses is listed with why); only the cashier's own press wipes the database and the
 * pairing, and the pairing is cleared last so that a failure in between leaves a till that
 * finds out it is revoked again on its next sync, and not a till half emptied.
 */
export function RevokedTill(props: {
  store: LocalStore;
  credentials: DeviceCredentialStore;
  /** How the till reaches the server under a flush grant; none, and it cannot send. */
  transport?: SyncTransport;
  onUnpaired(): void;
}) {
  const { store, credentials, transport, onUnpaired } = props;
  const [held, setHeld] = useState<Held | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void whatTheTillHolds(store).then((read) => live && setHeld(read));
    return () => {
      live = false;
    };
  }, [store]);
  const onFlush = useCallback(
    async (code: string) => {
      if (transport === undefined) return vi.revoked.flush.failed;
      const outcome = await flushOutboxUnderGrant(store, transport, code, () =>
        new Date().toISOString(),
      );
      setSent((before) => (before ?? 0) + outcome.accepted);
      setHeld(await whatTheTillHolds(store));
      return flushFailure(outcome);
    },
    [store, transport],
  );
  if (held === null) return null;
  return (
    <TillRevokedScreen
      waiting={held.waiting}
      refused={held.refused}
      sent={sent}
      {...(transport?.flushUnderGrant === undefined ? {} : { onFlush })}
      onPairAgain={async () => {
        await store.wipe();
        await credentials.clear();
        onUnpaired();
      }}
    />
  );
}
