import type { PaymentAccount, PaymentIntentSnapshot } from "@fnb/contracts";
import { type Vnd, vnd } from "@fnb/domain";
import { remainderAfterShortTransfers } from "@fnb/domain/payment";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "../features/menu/use-now";
import type { TillPlace } from "../features/order/till-command";
import {
  type DrawnQr,
  cancelQrCommand,
  drawQr,
  handBackExcessCommand,
} from "../features/payment/qr-intent-commands";
import { readStoredShift } from "../features/shift/stored-shift";
import { type QrPhase, qrPhaseOf } from "../features/payment/qr-intent-phase";
import { paidQrOfOrder, qrTenderOf, shortQrsOfOrder } from "../features/payment/settled-qr";
import type { Tender } from "../features/payment/tenders";
import { useQrIntent } from "../features/payment/use-qr-intent";
import { vi } from "../messages/vi";

const Q = vi.qr;

export interface CounterQrInput {
  client: SyncClient;
  place: TillPlace;
  orderId: string;
  /** The shift the sale is paid into: an over transfer's excess leaves its drawer. */
  shiftId: string;
  /** The domain's amount due on the draft as last saved: what the QR asks for. */
  amountDue: Vnd;
  account: PaymentAccount | null;
  /** Records a command after everything already recorded for the order. */
  record(command: LocalCommand): Promise<void>;
  /** Closes the order with the transfer the bank confirmed. */
  onPaid(tenders: readonly Tender[]): Promise<void>;
}

export interface CounterQr {
  readonly drawn: DrawnQr | null;
  /** What the QR on screen asks for: the amount due, less what short QRs of it brought. */
  readonly amount: Vnd;
  readonly phase: QrPhase;
  readonly error: string | null;
  /** A QR command is being recorded: its buttons wait. */
  readonly busy: boolean;
  /** Busy, or the bank paid and the order is closing with it: the drawer cannot be left. */
  readonly locked: boolean;
  /**
   * Draws and registers a QR for the whole amount due (or, after a short transfer, for
   * exactly the rest of it), taking down one still out.
   */
  show(): void;
  /** What short QRs of the order brought, as tenders the rest is then taken in cash beside. */
  shortTenders(): Promise<Tender[]>;
  /** Takes a QR still out down, so a late transfer waits for a person instead of paying twice. */
  leave(): Promise<boolean>;
  retryPay(): void;
  closeWithSettledQr(): Promise<void>;
  /**
   * Closes the order with an over-paid QR at its own amount, then, when `handBack`, hands
   * the excess back from the drawer (one command: the QR marked, the drawer's cash out).
   */
  closeOver(handBack: boolean): Promise<void>;
}

/**
 * A VietQR for the order: drawn and registered when the cashier chooses it, watched through
 * the sync feed, and the order closed the moment the bank's notice paid it exactly.
 */
export function useCounterQr(input: CounterQrInput): CounterQr {
  const { client, place, orderId, shiftId, amountDue, account, record, onPaid } = input;
  const [drawn, setDrawn] = useState<DrawnQr | null>(null);
  const [amount, setAmount] = useState<Vnd>(amountDue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useMemo(
    () =>
      drawn === null ? null : { intentId: drawn.intentId, commandId: drawn.command.commandId },
    [drawn],
  );
  const state = useQrIntent(client, shown);
  const phase = qrPhaseOf(state, useNow(1_000));
  const paying = useRef(false);
  const intent = drawn === null ? null : state.intent;
  const stillOut = intent !== null && intent.status === "pending" ? intent : null;

  const draw = useCallback(
    async (withdraw: PaymentIntentSnapshot | null) => {
      if (account === null) return;
      setBusy(true);
      setError(null);
      try {
        const at = Date.now();
        if (withdraw !== null) await record(cancelQrCommand(place, withdraw, at));
        const short = await shortQrsOfOrder(client, orderId);
        const brought = short.map((intent) => vnd(intent.receivedAmount ?? 0));
        const rest = remainderAfterShortTransfers(amountDue, brought);
        const next = drawQr(place, account, { orderId, amountDue: rest }, at);
        await record(next.command);
        setAmount(rest);
        setDrawn(next);
      } catch (failure) {
        console.error(failure);
        setError(Q.drawFailed);
      } finally {
        setBusy(false);
      }
    },
    [client, record, place, account, orderId, amountDue],
  );

  const pay = useCallback(
    async (paid: PaymentIntentSnapshot) => {
      if (paying.current) return;
      paying.current = true;
      setError(null);
      try {
        const short = await shortQrsOfOrder(client, orderId);
        const beside = short.filter((intent) => intent.id !== paid.id).map(qrTenderOf);
        await onPaid([...beside, qrTenderOf(paid)]);
      } catch (failure) {
        console.error(failure);
        paying.current = false;
        setError(Q.failed);
      }
    },
    [client, orderId, onPaid],
  );

  useEffect(() => {
    if (phase.kind === "paid" && intent !== null) void pay(intent);
  }, [phase.kind, intent, pay]);

  async function leave(): Promise<boolean> {
    setBusy(true);
    try {
      if (stillOut !== null) await record(cancelQrCommand(place, stillOut, Date.now()));
      setDrawn(null);
      setError(null);
      return true;
    } catch (failure) {
      console.error(failure);
      setError(Q.failed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    drawn,
    amount,
    phase,
    error,
    busy,
    locked: busy || (drawn !== null && phase.kind === "paid"),
    show: () => void draw(stillOut),
    shortTenders: async () => (await shortQrsOfOrder(client, orderId)).map(qrTenderOf),
    leave,
    retryPay: () => {
      if (intent !== null) void pay(intent);
    },
    closeOver: async (handBack: boolean) => {
      if (intent === null || intent.status !== "overpaid" || paying.current) return;
      await pay(intent);
      if (!handBack || !paying.current) return;
      try {
        const view = await client.snapshot("shift", shiftId);
        const shift = view === null ? null : readStoredShift(view.snapshot);
        // No shift on the till: the excess stays listed for a manager to refund.
        if (shift !== null) await record(handBackExcessCommand(place, shift, intent, Date.now()));
      } catch (failure) {
        console.error(failure);
      }
    },
    closeWithSettledQr: async () => {
      const paid = await paidQrOfOrder(client, orderId);
      if (paid === null) setError(Q.noSettledQr);
      else await pay(paid);
    },
  };
}
