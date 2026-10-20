import { type DenominationCount, VND_DENOMINATIONS, formatVnd } from "@fnb/domain";
import { useState } from "react";
import { Minus } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const T = vi.checkout.openShift;
/** Largest note first: a drawer is mostly counted in big notes. */
const NOTES = [...VND_DENOMINATIONS].reverse();

/**
 * Roughly the colour each Vietnamese note is printed in, as a stripe on its row, so a
 * cashier finds the 200.000 by colour while counting; the amount is always written too.
 */
const NOTE_TONE: ReadonlyMap<bigint, number> = new Map([
  [500_000n, 6],
  [200_000n, 7],
  [100_000n, 1],
  [50_000n, 5],
  [20_000n, 2],
  [10_000n, 3],
  [5_000n, 4],
  [1_000n, 8],
]);

/** The count so far, note by note, and a way to change it; the total is the domain's sum. */
export function useNoteCount() {
  const [pieces, setPieces] = useState<ReadonlyMap<bigint, number>>(new Map());
  const counts: DenominationCount[] = NOTES.map((denomination) => ({
    denomination,
    pieces: pieces.get(denomination) ?? 0,
  }));
  const change = (denomination: bigint, by: number) =>
    setPieces((before) => {
      const next = new Map(before);
      next.set(denomination, Math.max(0, (before.get(denomination) ?? 0) + by));
      return next;
    });
  return { counts, change, clear: () => setPieces(new Map()) };
}

/** One row per note: each tap adds one, never typed by hand. */
export function NoteCounter(props: {
  counts: readonly DenominationCount[];
  onChange(denomination: bigint, by: number): void;
}) {
  return (
    <ul className="pos-notes">
      {props.counts.map(({ denomination, pieces }) => (
        <li
          key={String(denomination)}
          className="pos-note-row"
          data-tone={NOTE_TONE.get(denomination) ?? 0}
        >
          <button
            type="button"
            className="pos-button pos-note-row__add"
            onClick={() => props.onChange(denomination, 1)}
          >
            {T.addNote(formatVnd(denomination))}
          </button>
          <span className="pos-note-row__count" aria-label={T.noteCount(formatVnd(denomination))}>
            {pieces}
          </span>
          <button
            type="button"
            className="pos-button"
            aria-label={T.removeNote(formatVnd(denomination))}
            disabled={pieces === 0}
            onClick={() => props.onChange(denomination, -1)}
          >
            <Icon of={Minus} />
          </button>
        </li>
      ))}
    </ul>
  );
}
