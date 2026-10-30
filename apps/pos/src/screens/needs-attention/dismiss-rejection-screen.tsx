import { useState } from "react";
import {
  type ChosenReason,
  type ReasonCode,
  chosenReason,
} from "../../features/order-adjust/reason-codes";
import { refusalSentence, vi } from "../../messages/vi";
import { ReasonPicker } from "../order-adjust/reason-picker";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { useLeaveThen } from "../shared/use-leave-motion";

const T = vi.needsAttention.dismissal;

/**
 * Setting aside a command the server refused: why, in the shop's own list of reasons. A
 * command with money or a kitchen ticket in it only goes with the staff member's words about
 * what became of it, so the confirm button waits for them whichever reason is picked.
 */
export function DismissRejectionScreen(props: {
  commandType: string;
  code: string;
  reasons: readonly ReasonCode[];
  /** The command moved money or told the kitchen to make food. */
  needsWords: boolean;
  onConfirm(reason: ChosenReason): Promise<string | null>;
  onBack(): void;
}) {
  const { leaving, leave } = useLeaveThen(props.onBack, "--t-exit");
  const [code, setCode] = useState<ReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = chosenReason(code, note);
  const said = note.trim();
  const reason: ChosenReason | null =
    code === null
      ? null
      : props.needsWords
        ? said.length > 0 && said.length <= 120
          ? { code, note: said }
          : null
        : picked;
  return (
    <ScreenFrame
      enter="sheet"
      leaving={leaving}
      title={T.title}
      dock={
        <>
          <Alert message={error} />
          <div className="pos-actions pos-actions--split">
            <button type="button" className="pos-button" onClick={leave}>
              {T.back}
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
      <p className="pos-rejected__sentence">{refusalSentence(props.commandType, props.code)}</p>
      <p className="pos-hint">{T.hint}</p>
      {props.needsWords ? <p className="pos-hint pos-hint--warn">{T.risky}</p> : null}
      <ReasonPicker
        reasons={props.reasons}
        chosen={code}
        onChoose={setCode}
        note={note}
        onNote={setNote}
        {...(props.needsWords ? { noteAlways: true } : {})}
      />
    </ScreenFrame>
  );
}
