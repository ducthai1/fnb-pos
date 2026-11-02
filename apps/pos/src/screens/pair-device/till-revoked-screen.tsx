import { Unplug } from "lucide-react";
import { useState } from "react";
import { vi } from "../../messages/vi";
import { GateMark } from "../shared/gate-mark";
import { Presence } from "../shared/presence";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { RevokedFlushPanel } from "./revoked-flush-panel";

/** Commands of one kind still on the till, by the name the cashier knows it by. */
export interface WaitingGroup {
  readonly name: string;
  readonly count: number;
}

/** A command the server refused for good, as the manager needs it to write it down. */
export interface RefusedItem {
  readonly id: string;
  readonly name: string;
  /** Why the server refused it, as the till says it. */
  readonly sentence: string;
  /** The money it moved, already written out, for a payment or a refund. */
  readonly amount: string | null;
}

export interface TillRevokedScreenProps {
  readonly waiting: readonly WaitingGroup[];
  /** Commands the server refused for good and nobody has dealt with yet. */
  readonly refused: readonly RefusedItem[];
  /** How many commands the server took under a flush grant on this screen, once one ran. */
  readonly sent?: number | null;
  /** Sends the unsent commands under a manager's code; absent when the till cannot. */
  onFlush?(code: string): Promise<string | null>;
  /** Clears the till's data and its pairing; rejects when that could not be done. */
  onPairAgain(): Promise<void>;
}

/**
 * The server says the till was taken out of the shop's devices. What it still holds can go
 * up once, under a code a manager issues for this very till; whatever the server does not
 * take is listed with the reason, for the manager to write down. Pairing again wipes the
 * till, and with something still on it that takes a second, separate press.
 */
export function TillRevokedScreen(props: TillRevokedScreenProps) {
  const { waiting, refused, sent = null, onFlush, onPairAgain } = props;
  const [confirming, setConfirming] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const total = waiting.reduce((sum, group) => sum + group.count, 0);
  const holdsSomething = total > 0 || refused.length > 0;
  const canFlush = onFlush !== undefined && total > 0;
  const showFlush = flushing && canFlush;

  async function pairAgain() {
    setBusy(true);
    setFailed(false);
    try {
      await onPairAgain();
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <ScreenFrame
      title={vi.revoked.title}
      stage="narrow"
      stageMark={<GateMark of={Unplug} tone="danger" />}
    >
      <div className="pos-gate__body" data-till-revoked>
        <p className="pos-gate__lead">{vi.revoked.hint}</p>
        {sent !== null ? (
          <p className="pos-gate__note" data-tone="ok" role="status">
            {sent > 0 ? vi.revoked.flush.sent(sent) : vi.revoked.flush.nothingSent}
          </p>
        ) : null}
        <div className="pos-gate__note" data-tone={holdsSomething ? "danger" : undefined} role="status">
          {total > 0 ? vi.revoked.waiting(total) : vi.revoked.nothingWaiting}
        </div>
        {total > 0 ? (
          <section className="pos-gate__list-block" aria-label={vi.revoked.waitingList}>
            <ul className="pos-gate__list">
              {waiting.map((group) => (
                <li key={group.name}>
                  <span>{group.name}</span>
                  <strong>{group.count}</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {refused.length > 0 ? (
          <section className="pos-gate__list-block" aria-label={vi.revoked.refusedList}>
            <p className="pos-gate__fine-print">{vi.revoked.refusedTitle(refused.length)}</p>
            <ul className="pos-gate__list pos-gate__list--refused">
              {refused.map((item) => (
                <li key={item.id} data-refused-command={item.id}>
                  <span>
                    <b>{item.name}</b>
                    <small>{item.sentence}</small>
                  </span>
                  {item.amount === null ? null : <strong>{item.amount}</strong>}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Alert message={failed ? vi.revoked.failed : null} />
        <Presence>
          {showFlush ? (
            <RevokedFlushPanel waiting={total} onFlush={onFlush} onBack={() => setFlushing(false)} />
          ) : null}
        </Presence>
        {showFlush ? null : confirming ? (
          <>
            <p className="pos-gate__fine-print">{vi.revoked.warning}</p>
            <button
              type="button"
              className="pos-button pos-button--destructive pos-button--block pos-gate__action"
              disabled={busy}
              onClick={() => void pairAgain()}
            >
              {busy ? vi.revoked.clearing : vi.revoked.confirmDelete(total + refused.length)}
            </button>
            <button
              type="button"
              className="pos-button pos-button--block"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {vi.revoked.back}
            </button>
          </>
        ) : (
          <>
            {canFlush ? (
              <button
                type="button"
                className="pos-button pos-button--primary pos-button--block pos-gate__action"
                disabled={busy}
                onClick={() => setFlushing(true)}
              >
                {vi.revoked.flush.open(total)}
              </button>
            ) : null}
            <button
              type="button"
              className={
                canFlush
                  ? "pos-button pos-button--block"
                  : "pos-button pos-button--primary pos-button--block pos-gate__action"
              }
              disabled={busy}
              onClick={() => (holdsSomething ? setConfirming(true) : void pairAgain())}
            >
              {busy ? vi.revoked.clearing : vi.revoked.pair}
            </button>
          </>
        )}
      </div>
    </ScreenFrame>
  );
}
