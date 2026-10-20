import { MAX_NOTE_LENGTH } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";

const P = vi.sale.picker;
const SEPARATOR = ", ";

const phrasesOf = (note: string) =>
  note
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

/**
 * The note with a quick phrase put in, or taken out when it is already there; what was typed
 * stays as it was. A phrase that would make the note too long is not added.
 */
export function toggleQuickNote(note: string, phrase: string): string {
  const phrases = phrasesOf(note);
  if (phrases.includes(phrase)) return phrases.filter((part) => part !== phrase).join(SEPARATOR);
  const next = [...phrases, phrase].join(SEPARATOR);
  return next.length > MAX_NOTE_LENGTH ? note : next;
}

/** Chips for what customers ask most, so the cashier taps instead of typing. */
export function QuickNotes({ note, onChange }: { note: string; onChange(note: string): void }) {
  const chosen = phrasesOf(note);
  return (
    <ul className="pos-chips" aria-label={P.quickNotesLabel}>
      {P.quickNotes.map((phrase) => (
        <li key={phrase} className="pos-chip-item">
          <button
            type="button"
            className="pos-chip pos-chip--note"
            aria-pressed={chosen.includes(phrase)}
            onClick={() => onChange(toggleQuickNote(note, phrase))}
          >
            {phrase}
          </button>
        </li>
      ))}
    </ul>
  );
}
