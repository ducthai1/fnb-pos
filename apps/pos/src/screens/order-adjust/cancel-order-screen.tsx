import { type ReactNode, useState } from "react";
import {
  CANCEL_REASONS,
  type ChosenReason,
  type ReasonCode,
  chosenReason,
} from "../../features/order-adjust/reason-codes";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { useLeaveThen } from "../shared/use-leave-motion";
import { ReasonPicker } from "./reason-picker";

const T = vi.adjust.cancel;

/** "Hủy đơn": a draft nobody will pay for, with why. */
export function CancelOrderScreen(props: {
  header: ReactNode;
  orderNo: number;
  onConfirm(reason: ChosenReason): Promise<string | null>;
  onBack(): void;
}) {
  // Back plays the step's leaving movement before the flow closes it.
  const { leaving, leave } = useLeaveThen(props.onBack, "--t-exit");
  const [code, setCode] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState("");
  const reason = chosenReason(code, note);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ScreenFrame
      enter="sheet"
      leaving={leaving}
      title={T.title(props.orderNo)}
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
      <ReasonPicker
        reasons={CANCEL_REASONS}
        chosen={code}
        onChoose={setCode}
        note={note}
        onNote={setNote}
      />
    </ScreenFrame>
  );
}
