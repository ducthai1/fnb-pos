import {
  type ClosingAssessment,
  type DenominationCount,
  type ShiftCashSummary,
  type Vnd,
  countedTotal,
  formatVnd,
  negateVnd,
} from "@fnb/domain";
import { type ReactNode, useState } from "react";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { NoteCounter, useNoteCount } from "./note-counter";

const T = vi.closeShift;
const F = T.figures;

export interface CloseShiftScreenProps {
  header: ReactNode;
  /** The drawer's book as the till rebuilt it. */
  figures: ShiftCashSummary;
  /** The domain's assessment of a count against the book and the shop's tolerance. */
  assess(counted: Vnd): ClosingAssessment;
  /** Why closing is asked again (the server saw a difference the till did not). */
  notice: string | null;
  onConfirm(
    counts: readonly DenominationCount[],
    assessment: ClosingAssessment,
  ): Promise<string | null>;
  onBack(): void;
}

function differenceSentence(difference: Vnd): string {
  if (difference === 0n) return T.noDifference;
  return difference < 0n
    ? T.short(formatVnd(negateVnd(difference)))
    : T.over(formatVnd(difference));
}

/** The drawer counted note by note against what it should hold, then the shift closed. */
export function CloseShiftScreen(props: CloseShiftScreenProps) {
  const notes = useNoteCount();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const assessment = props.assess(countedTotal(notes.counts));
  const { figures } = props;
  const rows: [string, Vnd, string?][] = [
    [F.opening, figures.openingCash],
    [F.sales, figures.cashSales],
    [F.refunds, negateVnd(figures.cashRefunds)],
    [F.cashIn, figures.cashIn],
    [F.cashOut, negateVnd(figures.cashOut)],
    [F.expected, assessment.expectedCash, "expected"],
    [F.counted, assessment.countedCash, "counted"],
    [F.difference, assessment.difference, "difference"],
  ];
  return (
    <ScreenFrame
      title={T.title}
      dock={
        <>
          <p className="pos-total pos-wrap" aria-live="polite">
            {differenceSentence(assessment.difference)}
          </p>
          <Alert message={error} />
          <div className="pos-actions">
            <button type="button" className="pos-button" onClick={props.onBack}>
              {T.back}
            </button>
            <button
              type="button"
              className="pos-button pos-button--primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void props.onConfirm(notes.counts, assessment).then((refused) => {
                  setBusy(false);
                  setError(refused);
                });
              }}
            >
              {T.confirm}
            </button>
          </div>
        </>
      }
    >
      {props.header}
      <Alert message={props.notice} />
      <p className="pos-hint">{T.hint}</p>
      <NoteCounter counts={notes.counts} onChange={notes.change} />
      <dl className="pos-figures pos-card">
        {rows.map(([label, amount, key]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt className={key === undefined ? undefined : "pos-figures__strong"}>{label}</dt>
            <dd
              className={key === undefined ? undefined : "pos-figures__strong"}
              {...(key === undefined ? {} : { [`data-${key}`]: String(amount) })}
            >
              {formatVnd(amount)}
            </dd>
          </div>
        ))}
      </dl>
      {assessment.needsAcceptance ? <p className="pos-hint">{T.needsApproval}</p> : null}
      <p className="pos-hint">{T.estimateNote}</p>
    </ScreenFrame>
  );
}
