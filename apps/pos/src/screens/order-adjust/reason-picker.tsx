import { useId } from "react";
import {
  REASON_NOTE_MAX_LENGTH,
  type ReasonCode,
  needsNote,
} from "../../features/order-adjust/reason-codes";
import { vi } from "../../messages/vi";

const A = vi.adjust;

/**
 * One reason from the shop's list, chosen by tapping it; the chosen one reads as pressed.
 * "Lý do khác" opens a note the staff member must fill (1–120 characters) before the screen's
 * confirm button works: a reason nobody can read says nothing in the reports.
 */
export function ReasonPicker(props: {
  reasons: readonly ReasonCode[];
  chosen: ReasonCode | null;
  onChoose(reason: ReasonCode): void;
  note: string;
  onNote(note: string): void;
}) {
  const written = props.note.trim().length;
  const hintId = useId();
  return (
    <fieldset className="pos-group">
      <legend className="pos-group__legend">{A.reason}</legend>
      <ul className="pos-choices">
        {props.reasons.map((reason) => (
          <li key={reason}>
            <button
              type="button"
              className="pos-button pos-wrap"
              aria-pressed={props.chosen === reason}
              onClick={() => props.onChoose(reason)}
            >
              {vi.reasons[reason]}
            </button>
          </li>
        ))}
      </ul>
      {needsNote(props.chosen) ? (
        <>
          <label className="pos-field">
            <span className="pos-field__label">{A.reasonNote}</span>
            <textarea
              className="pos-input pos-note"
              placeholder={A.reasonNoteHint}
              maxLength={REASON_NOTE_MAX_LENGTH}
              required
              aria-invalid={written === 0}
              aria-describedby={hintId}
              value={props.note}
              onChange={(event) => props.onNote(event.target.value)}
            />
          </label>
          <p id={hintId} className="pos-hint" data-reason-note-length={written}>
            {written === 0
              ? A.reasonNoteRequired
              : A.reasonNoteCount(written, REASON_NOTE_MAX_LENGTH)}
          </p>
        </>
      ) : null}
    </fieldset>
  );
}
