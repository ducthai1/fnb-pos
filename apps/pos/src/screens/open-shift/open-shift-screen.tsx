import { type DenominationCount, countedTotal, formatVnd } from "@fnb/domain";
import { Banknote, RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { NoteCounter, useNoteCount } from "../shift/note-counter";

const T = vi.checkout.openShift;

export interface OpenShiftScreenProps {
  header: ReactNode;
  onOpen(counts: readonly DenominationCount[]): Promise<void>;
}

/**
 * Starts the till's shift on the float in the drawer, counted note by note: each tap adds
 * one note, and the total is the domain's sum of what was counted, never typed by hand.
 */
export function OpenShiftScreen({ header, onOpen }: OpenShiftScreenProps) {
  const notes = useNoteCount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = countedTotal(notes.counts);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      await onOpen(notes.counts);
    } catch {
      setBusy(false);
      setError(T.failed);
    }
  }

  return (
    <ScreenFrame
      title={T.title}
      dock={
        <>
          <p className="pos-total" aria-live="polite">
            {T.total(formatVnd(total))}
          </p>
          <Alert message={error} />
          <div className="pos-actions">
            <button type="button" className="pos-button" onClick={notes.clear}>
              <Icon of={RotateCcw} />
              {T.clear}
            </button>
            <button
              type="button"
              className="pos-button pos-button--primary"
              disabled={busy}
              onClick={open}
            >
              <Icon of={Banknote} />
              {T.open}
            </button>
          </div>
        </>
      }
    >
      {header}
      <p className="pos-hint">{T.hint}</p>
      <NoteCounter counts={notes.counts} onChange={notes.change} />
    </ScreenFrame>
  );
}
