import { type ReactNode, useState } from "react";
import { type ReasonCode, VOID_REASONS } from "../../features/order-adjust/reason-codes";
import { vi } from "../../messages/vi";
import { QuantityStepper } from "../sale/quantity-stepper";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { ReasonPicker } from "./reason-picker";

const T = vi.adjust.void;

export interface VoidLineScreenProps {
  header: ReactNode;
  itemName: string;
  /** Units still on the order (not cancelled yet). */
  remaining: number;
  /** Units of those the kitchen has. */
  sentUnits: number;
  /** Records the void; answers why it did not, or null once recorded (or nobody approved). */
  onConfirm(units: number, reasonCode: ReasonCode): Promise<string | null>;
  onBack(): void;
}

/** "Hủy món": how many, and why. Units the kitchen has are cancelled last, with a ticket. */
export function VoidLineScreen(props: VoidLineScreenProps) {
  const [units, setUnits] = useState(1);
  const [reason, setReason] = useState<ReasonCode | null>(null);
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
      title={T.title}
      dock={
        <>
          <Alert message={error} />
          <div className="pos-actions pos-actions--split">
            <button type="button" className="pos-button" onClick={props.onBack}>
              {vi.adjust.back}
            </button>
            <button
              type="button"
              className="pos-button pos-button--destructive"
              disabled={busy || reason === null || props.remaining < 1}
              onClick={() => void confirm()}
            >
              {T.confirm(units)}
            </button>
          </div>
        </>
      }
    >
      {props.header}
      <section className="pos-card pos-approval" aria-label={T.title}>
        <p className="pos-approval__what pos-wrap">{props.itemName}</p>
        <p className="pos-hint">{T.left(props.remaining)}</p>
        {props.sentUnits > 0 ? (
          <>
            <p className="pos-hint">{T.sent(props.sentUnits)}</p>
            <p className="pos-hint">{T.afterSentNote}</p>
          </>
        ) : null}
      </section>
      <QuantityStepper
        label={T.units}
        name={props.itemName}
        value={units}
        max={Math.max(1, props.remaining)}
        onChange={setUnits}
      />
      <ReasonPicker reasons={VOID_REASONS} chosen={reason} onChoose={setReason} />
    </ScreenFrame>
  );
}
