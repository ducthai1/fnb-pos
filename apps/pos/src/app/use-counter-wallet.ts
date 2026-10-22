import type { PaymentIntentSnapshot, WalletKey } from "@fnb/contracts";
import type { Vnd } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { failureMessage } from "../features/api/failure-message";
import { newId } from "../features/ids/new-id";
import { useNow } from "../features/menu/use-now";
import { type TillPlace, moneyToWire } from "../features/order/till-command";
import { useTillPermissions } from "../features/permissions/till-permissions-context";
import { cancelQrCommand } from "../features/payment/qr-intent-commands";
import { type QrPhase, qrPhaseOf } from "../features/payment/qr-intent-phase";
import { qrTenderOf } from "../features/payment/settled-qr";
import type { Tender } from "../features/payment/tenders";
import { useQrIntent } from "../features/payment/use-qr-intent";
import { vi } from "../messages/vi";

const W = vi.wallet;
/** Sync passes tried to get the order onto the server before asking for the payment. */
const PUSH_TRIES = 5;

export interface CounterWalletInput {
  client: SyncClient;
  place: TillPlace;
  orderId: string;
  /** The domain's amount due on the draft as last saved: what the server asks the wallet for. */
  amountDue: Vnd;
  record(command: LocalCommand): Promise<void>;
  onPaid(tenders: readonly Tender[]): Promise<void>;
}

/** The wallet payment on screen: what to scan, and the intent as the server answered it. */
export interface ShownWalletPayment {
  readonly wallet: WalletKey;
  readonly qrContent: string;
  readonly answered: PaymentIntentSnapshot;
}

export interface CounterWallet {
  readonly shown: ShownWalletPayment | null;
  readonly phase: QrPhase;
  readonly error: string | null;
  readonly busy: boolean;
  /** Busy, or the wallet paid and the order is closing with it: the drawer cannot be left. */
  readonly locked: boolean;
  /** Asks the server to open a payment of the whole amount due at `wallet`. */
  show(wallet: WalletKey): void;
  /** Takes the payment still open down, so money arriving later waits for a person. */
  leave(): Promise<boolean>;
  retryPay(): void;
}

const nameOf = (wallet: WalletKey) => W.names[wallet] ?? wallet;

/**
 * An e-wallet payment for the order, at the counter. Unlike the VietQR, the server opens it
 * (the wallet must be asked), so the till first syncs the order up, then asks; the wallet's
 * notice (or the server asking the wallet) settles the intent, the change feed brings it,
 * and the order closes with it exactly as with a paid VietQR.
 */
export function useCounterWallet(input: CounterWalletInput): CounterWallet {
  const { client, place, orderId, amountDue, record, onPaid } = input;
  const { openWalletPayment } = useTillPermissions();
  const [shown, setShown] = useState<ShownWalletPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const watched = useMemo(
    () => (shown === null ? null : { intentId: shown.answered.id, commandId: "" }),
    [shown],
  );
  const state = useQrIntent(client, watched);
  const intent = shown === null ? null : (state.intent ?? shown.answered);
  const now = useNow(1_000);
  const phase = qrPhaseOf({ intent, refusal: null }, now);
  const paying = useRef(false);
  const stillOpen = intent !== null && intent.status === "pending" ? intent : null;

  const open = useCallback(
    async (wallet: WalletKey) => {
      if (openWalletPayment === undefined) return;
      setBusy(true);
      setError(null);
      try {
        for (let tries = 0; tries < PUSH_TRIES && (await client.pendingCount()) > 0; tries++) {
          await client.syncOnce().catch(() => undefined);
        }
        if ((await client.pendingCount()) > 0) return setError(W.needsServer(nameOf(wallet)));
        const body = { intentId: newId(), orderId, wallet, amount: moneyToWire(amountDue) };
        const result = await openWalletPayment(body);
        if (!result.ok) {
          return setError(
            result.status === null ? W.offline(nameOf(wallet)) : failureMessage(result),
          );
        }
        paying.current = false;
        setShown({ wallet, qrContent: result.value.qrContent, answered: result.value.intent });
      } finally {
        setBusy(false);
      }
    },
    [client, openWalletPayment, orderId, amountDue],
  );

  const pay = useCallback(
    async (paid: PaymentIntentSnapshot) => {
      if (paying.current) return;
      paying.current = true;
      setError(null);
      try {
        await onPaid([qrTenderOf(paid)]);
      } catch (failure) {
        console.error(failure);
        paying.current = false;
        setError(vi.qr.failed);
      }
    },
    [onPaid],
  );

  useEffect(() => {
    if (phase.kind === "paid" && intent !== null) void pay(intent);
  }, [phase.kind, intent, pay]);

  async function leave(): Promise<boolean> {
    setBusy(true);
    try {
      if (stillOpen !== null) await record(cancelQrCommand(place, stillOpen, Date.now()));
      setShown(null);
      setError(null);
      return true;
    } catch (failure) {
      console.error(failure);
      setError(vi.qr.failed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    shown,
    phase,
    error,
    busy,
    locked: busy || (shown !== null && phase.kind === "paid"),
    show: (wallet) => {
      void (async () => {
        if (stillOpen !== null && !(await leave())) return;
        await open(wallet);
      })();
    },
    leave,
    retryPay: () => {
      if (intent !== null) void pay(intent);
    },
  };
}
