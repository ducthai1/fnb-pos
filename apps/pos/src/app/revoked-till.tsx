import type { LocalStore } from "@fnb/sync-client";
import { useEffect, useState } from "react";
import { commandNameOf } from "../messages/vi-sync-errors";
import {
  TillRevokedScreen,
  type WaitingGroup,
} from "../screens/pair-device/till-revoked-screen";
import type { DeviceCredentialStore } from "../shell-bridge/device-credential-store";

/** More than any till holds; the screen counts what is there, it does not page. */
const READ_LIMIT = 10_000;

interface Held {
  readonly waiting: readonly WaitingGroup[];
  readonly needsAttention: number;
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
    needsAttention: refused.length,
  };
}

/**
 * A till the server no longer knows. It reads what the till still holds and shows it before
 * anything is cleared; only the cashier's own press wipes the database and the pairing, and
 * the pairing is cleared last so that a failure in between leaves a till that finds out it is
 * revoked again on its next sync, and not a till half emptied.
 */
export function RevokedTill(props: {
  store: LocalStore;
  credentials: DeviceCredentialStore;
  onUnpaired(): void;
}) {
  const { store, credentials, onUnpaired } = props;
  const [held, setHeld] = useState<Held | null>(null);
  useEffect(() => {
    let live = true;
    void whatTheTillHolds(store).then((read) => live && setHeld(read));
    return () => {
      live = false;
    };
  }, [store]);
  if (held === null) return null;
  return (
    <TillRevokedScreen
      waiting={held.waiting}
      needsAttention={held.needsAttention}
      onPairAgain={async () => {
        await store.wipe();
        await credentials.clear();
        onUnpaired();
      }}
    />
  );
}
