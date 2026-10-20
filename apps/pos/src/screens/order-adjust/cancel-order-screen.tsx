import { type ReactNode, useState } from "react";
import { CANCEL_REASONS, type ReasonCode } from "../../features/order-adjust/reason-codes";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { ReasonPicker } from "./reason-picker";

const T = vi.adjust.cancel;

/** "Hủy đơn": a draft nobody will pay for, with why. */
export function CancelOrderScreen(props: {
  header: ReactNode;
  orderNo: number;
  onConfirm(reasonCode: ReasonCode): Promise<string | null>;
  onBack(): void;
}) {
  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ScreenFrame
      title={T.title(props.orderNo)}
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
              disabled={busy || reason === null}
              onClick={() => {
                if (reason === null) return;
                setBusy(true);
                void props.onConfirm(reason).then((refused) => {
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
      <p className="pos-hint">{T.hint}</p>
      <ReasonPicker reasons={CANCEL_REASONS} chosen={reason} onChoose={setReason} />
    </ScreenFrame>
  );
}
