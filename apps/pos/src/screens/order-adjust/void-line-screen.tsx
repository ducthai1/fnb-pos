import { formatGrams } from "@fnb/domain";
import { type ReactNode, useState } from "react";
import {
  type ChosenReason,
  type ReasonCode,
  VOID_REASONS,
  chosenReason,
} from "../../features/order-adjust/reason-codes";
import { vi } from "../../messages/vi";
import { QuantityStepper } from "../sale/quantity-stepper";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { useLeaveThen } from "../shared/use-leave-motion";
import { ReasonPicker } from "./reason-picker";

const T = vi.adjust.void;

export interface VoidLineScreenProps {
  header: ReactNode;
  itemName: string;
  /** Grams of the weighing when the item is sold by weight: cancelled whole, no count. */
  weighedGrams?: number;
  /** Units still on the order (not cancelled yet). */
  remaining: number;
  /** Units of those the kitchen has. */
  sentUnits: number;
  /** Records the void; answers why it did not, or null once recorded (or nobody approved). */
  onConfirm(units: number, reason: ChosenReason): Promise<string | null>;
  onBack(): void;
  /** The step's work is done and it is playing its leaving movement before the flow moves on. */
  closing?: boolean;
}

/** "Hủy món": how many, and why. Units the kitchen has are cancelled last, with a ticket. */
export function VoidLineScreen(props: VoidLineScreenProps) {
  // Back plays the step's leaving movement before the flow closes it.
  const { leaving, leave } = useLeaveThen(props.onBack, "--t-exit");
  const [units, setUnits] = useState(1);
  const [code, setCode] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState("");
  const reason = chosenReason(code, note);
  const weighed = props.weighedGrams;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (reason === null) return;
    setBusy(true);
    setError(null);
    const refused = await props.onConfirm(units, reason);
    setBusy(false);
    setError(refused);
  }

  return (
    <ScreenFrame
      enter="sheet"
      leaving={leaving || props.closing === true}
      title={T.title}
      dock={
        <>
          <Alert message={error} />
          <div className="pos-actions pos-actions--split">
            <button type="button" className="pos-button" onClick={leave}>
              {vi.adjust.back}
            </button>
            <button
              type="button"
              className="pos-button pos-button--destructive"
              disabled={busy || reason === null || props.remaining < 1}
              onClick={() => void confirm()}
            >
              {weighed === undefined ? T.confirm(units) : T.confirmWeighed(formatGrams(weighed))}
            </button>
          </div>
        </>
      }
    >
      {props.header}
      <section className="pos-card pos-approval" aria-label={T.title}>
        <p className="pos-approval__what pos-wrap">{props.itemName}</p>
        <p className="pos-hint">
          {weighed === undefined ? T.left(props.remaining) : T.leftWeighed(formatGrams(weighed))}
        </p>
        {props.sentUnits > 0 ? (
          <>
            <p className="pos-hint">
              {weighed === undefined
                ? T.sent(props.sentUnits)
                : T.sentWeighed(formatGrams(weighed))}
            </p>
            <p className="pos-hint">{T.afterSentNote}</p>
          </>
        ) : null}
      </section>
      {weighed === undefined ? (
        <QuantityStepper
          label={T.units}
          name={props.itemName}
          value={units}
          max={Math.max(1, props.remaining)}
          onChange={setUnits}
        />
      ) : null}
      <ReasonPicker
        reasons={VOID_REASONS}
        chosen={code}
        onChoose={setCode}
        note={note}
        onNote={setNote}
      />
    </ScreenFrame>
  );
}
