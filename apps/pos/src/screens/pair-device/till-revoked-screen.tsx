import { Unplug } from "lucide-react";
import { useState } from "react";
import { vi } from "../../messages/vi";
import { GateMark } from "../shared/gate-mark";
import { Alert, ScreenFrame } from "../shared/screen-frame";

/** Commands of one kind still on the till, by the name the cashier knows it by. */
export interface WaitingGroup {
  readonly name: string;
  readonly count: number;
}

export interface TillRevokedScreenProps {
  readonly waiting: readonly WaitingGroup[];
  /** Commands the server refused for good and nobody has dealt with yet. */
  readonly needsAttention: number;
  /** Clears the till's data and its pairing; rejects when that could not be done. */
  onPairAgain(): Promise<void>;
}

/**
 * The server says the till was taken out of the shop's devices. Nothing it holds can ever be
 * sent, so the way on is to pair again, which wipes the till's data. What is still unsent is
 * never dropped quietly: it is listed here, and wiping it takes a second, separate press.
 */
export function TillRevokedScreen({ waiting, needsAttention, onPairAgain }: TillRevokedScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const total = waiting.reduce((sum, group) => sum + group.count, 0);
  const holdsSomething = total > 0 || needsAttention > 0;

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
        <div className="pos-gate__note" data-tone={holdsSomething ? "danger" : undefined} role="status">
          {total > 0 ? vi.revoked.waiting(total) : vi.revoked.nothingWaiting}
          {needsAttention > 0 ? <p>{vi.revoked.refusedToo(needsAttention)}</p> : null}
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
        <Alert message={failed ? vi.revoked.failed : null} />
        {confirming ? (
          <>
            <p className="pos-gate__fine-print">{vi.revoked.warning}</p>
            <button
              type="button"
              className="pos-button pos-button--destructive pos-button--block pos-gate__action"
              disabled={busy}
              onClick={() => void pairAgain()}
            >
              {busy ? vi.revoked.clearing : vi.revoked.confirmDelete(total + needsAttention)}
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
          <button
            type="button"
            className="pos-button pos-button--primary pos-button--block pos-gate__action"
            disabled={busy}
            onClick={() => (holdsSomething ? setConfirming(true) : void pairAgain())}
          >
            {busy ? vi.revoked.clearing : vi.revoked.pair}
          </button>
        )}
      </div>
    </ScreenFrame>
  );
}
