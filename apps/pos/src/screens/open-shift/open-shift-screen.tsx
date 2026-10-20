import { type DenominationCount, VND_DENOMINATIONS, countedTotal, formatVnd } from "@fnb/domain";
import { type ReactNode, useState } from "react";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";

const T = vi.checkout.openShift;
/** Largest note first: the float is mostly counted in big notes. */
const NOTES = [...VND_DENOMINATIONS].reverse();

export interface OpenShiftScreenProps {
  header: ReactNode;
  onOpen(counts: readonly DenominationCount[]): Promise<void>;
}

/**
 * Starts the till's shift on the float in the drawer, counted note by note: each tap adds
 * one note, and the total is the domain's sum of what was counted, never typed by hand.
 */
export function OpenShiftScreen({ header, onOpen }: OpenShiftScreenProps) {
  const [pieces, setPieces] = useState<ReadonlyMap<bigint, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counts: DenominationCount[] = NOTES.map((denomination) => ({
    denomination,
    pieces: pieces.get(denomination) ?? 0,
  }));
  const total = countedTotal(counts);
  const change = (denomination: bigint, by: number) =>
    setPieces((before) => {
      const next = new Map(before);
      next.set(denomination, Math.max(0, (before.get(denomination) ?? 0) + by));
      return next;
    });

  async function open() {
    setBusy(true);
    setError(null);
    try {
      await onOpen(counts);
    } catch {
      setBusy(false);
      setError(T.failed);
    }
  }

  return (
    <ScreenFrame title={T.title}>
      {header}
      <p className="pos-hint">{T.hint}</p>
      <ul className="pos-notes">
        {counts.map(({ denomination, pieces: count }) => (
          <li key={String(denomination)} className="pos-note-row">
            <button
              type="button"
              className="pos-button pos-note-row__add"
              onClick={() => change(denomination, 1)}
            >
              {T.addNote(formatVnd(denomination))}
            </button>
            <span className="pos-note-row__count" aria-label={T.noteCount(formatVnd(denomination))}>
              {count}
            </span>
            <button
              type="button"
              className="pos-button"
              aria-label={T.removeNote(formatVnd(denomination))}
              disabled={count === 0}
              onClick={() => change(denomination, -1)}
            >
              −
            </button>
          </li>
        ))}
      </ul>
      <p className="pos-total" aria-live="polite">
        {T.total(formatVnd(total))}
      </p>
      <Alert message={error} />
      <div className="pos-actions">
        <button type="button" className="pos-button" onClick={() => setPieces(new Map())}>
          {T.clear}
        </button>
        <button
          type="button"
          className="pos-button pos-button--primary"
          disabled={busy}
          onClick={open}
        >
          {T.open}
        </button>
      </div>
    </ScreenFrame>
  );
}
