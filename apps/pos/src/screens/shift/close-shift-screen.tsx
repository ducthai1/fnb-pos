import {
  type ClosingAssessment,
  type DenominationCount,
  type ShiftCashSummary,
  type Vnd,
  ZERO_VND,
  compareVnd,
  countedTotal,
  formatVnd,
  negateVnd,
} from "@fnb/domain";
import { Banknote, Scale } from "lucide-react";
import { type ReactNode, useState } from "react";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { NoteCounter, useNoteCount } from "./note-counter";
import { ShiftPanel } from "./shift-panel";

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
      width="split"
      dock={
        <>
          <p
            className="pos-total pos-wrap"
            aria-live="polite"
            data-difference-sign={compareVnd(assessment.difference, ZERO_VND)}
          >
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
      <div className="pos-split">
        <ShiftPanel icon={Banknote} title={T.countTitle} hint={T.hint}>
          <NoteCounter counts={notes.counts} onChange={notes.change} />
        </ShiftPanel>
        <div className="pos-split__side">
          <ShiftPanel icon={Scale} title={T.figuresTitle}>
            <dl className="pos-figures">
              {rows.map(([label, amount, key]) => (
                <div
                  key={label}
                  className="pos-figures__row"
                  data-strong={key === undefined ? undefined : ""}
                  data-sign={key === "difference" ? compareVnd(amount, ZERO_VND) : undefined}
                >
                  <dt>{label}</dt>
                  <dd {...(key === undefined ? {} : { [`data-${key}`]: String(amount) })}>
                    {formatVnd(amount)}
                  </dd>
                </div>
              ))}
            </dl>
            {assessment.needsAcceptance ? <p className="pos-hint">{T.needsApproval}</p> : null}
            <p className="pos-hint">{T.estimateNote}</p>
          </ShiftPanel>
        </div>
      </div>
    </ScreenFrame>
  );
}
