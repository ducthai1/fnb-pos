import { type ReactNode, useState } from "react";
import {
  CANCEL_REASONS,
  type ChosenReason,
  TABLE_EMPTIED_REASON,
  type ReasonCode,
  chosenReason,
} from "../../features/order-adjust/reason-codes";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { useLeaveThen } from "../shared/use-leave-motion";
import { ReasonPicker } from "./reason-picker";

const T = vi.adjust.cancel;
const R = vi.adjust.release;

/**
 * "Hủy đơn": a draft nobody will pay for, with why. With `release` (the table's name) it is
 * "Trả bàn": an order with nothing on it, closed with its one fixed reason and no questions.
 */
export function CancelOrderScreen(props: {
  header: ReactNode;
  orderNo: number;
  release?: string;
  onConfirm(reason: ChosenReason): Promise<string | null>;
  onBack(): void;
}) {
  // Back plays the step's leaving movement before the flow closes it.
  const { leaving, leave } = useLeaveThen(props.onBack, "--t-exit");
  const [code, setCode] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState("");
  const releasing = props.release !== undefined;
  const reason = releasing
    ? ({ code: TABLE_EMPTIED_REASON, note: null } as const)
    : chosenReason(code, note);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ScreenFrame
      enter="sheet"
      leaving={leaving}
      title={releasing ? R.title(props.release ?? "") : T.title(props.orderNo)}
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
              {releasing ? R.confirm : T.confirm}
            </button>
          </div>
        </>
      }
    >
      {props.header}
      <p className="pos-hint">{releasing ? R.hint : T.hint}</p>
      {releasing ? null : (
        <ReasonPicker
          reasons={CANCEL_REASONS}
          chosen={code}
          onChoose={setCode}
          note={note}
          onNote={setNote}
        />
      )}
    </ScreenFrame>
  );
}
