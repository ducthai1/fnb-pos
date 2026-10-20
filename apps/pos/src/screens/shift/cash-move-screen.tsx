import { type Vnd, formatVnd } from "@fnb/domain";
import { type ReactNode, useState } from "react";
import { typedAmount } from "../../features/payment/cash-suggestions";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";

const C = vi.cash;
/** The contract's own limit on a reason. */
const MAX_REASON = 200;

export interface CashMoveScreenProps {
  header: ReactNode;
  /** What was just recorded, said once. */
  notice?: string | null;
  /** What the drawer should hold after the move, by the domain; null while none is typed. */
  expectedAfter(kind: "in" | "out", amount: Vnd): Vnd;
  onConfirm(kind: "in" | "out", amount: Vnd, reason: string): Promise<string | null>;
  onBack(): void;
}

/** Cash put into or taken out of the drawer outside a sale, how much and why. */
export function CashMoveScreen(props: CashMoveScreenProps) {
  const [kind, setKind] = useState<"in" | "out">("out");
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = typedAmount(typed);
  const valid = amount !== null && amount > 0n;
  const said = reason.trim();
  return (
    <ScreenFrame title={C.title}>
      {props.header}
      {props.notice ? (
        <p className="pos-notice" role="status">
          {props.notice}
        </p>
      ) : null}
      <div className="pos-tabs" role="group" aria-label={C.title}>
        {(["in", "out"] as const).map((each) => (
          <button
            key={each}
            type="button"
            className="pos-button pos-tab"
            aria-pressed={kind === each}
            onClick={() => setKind(each)}
          >
            {each === "in" ? C.in : C.out}
          </button>
        ))}
      </div>
      <label className="pos-field">
        <span className="pos-field__label">{C.amount}</span>
        <input
          className="pos-input"
          inputMode="numeric"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      {typed !== "" && !valid ? <Alert message={C.unreadable} /> : null}
      <label className="pos-field">
        <span className="pos-field__label">{C.reason}</span>
        <textarea
          className="pos-input pos-note"
          placeholder={C.reasonHint}
          maxLength={MAX_REASON}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {valid ? (
        <p className="pos-total" data-expected-after={String(props.expectedAfter(kind, amount))}>
          {C.expectedAfter(formatVnd(props.expectedAfter(kind, amount)))}
        </p>
      ) : null}
      <Alert message={error} />
      <div className="pos-actions">
        <button type="button" className="pos-button" onClick={props.onBack}>
          {C.back}
        </button>
        <button
          type="button"
          className="pos-button pos-button--primary"
          disabled={busy || !valid || said === ""}
          onClick={() => {
            if (!valid) return;
            setBusy(true);
            void props.onConfirm(kind, amount, said).then((refused) => {
              setBusy(false);
              setError(refused);
            });
          }}
        >
          {valid ? C.confirm(kind, formatVnd(amount)) : C.confirm(kind, "")}
        </button>
      </div>
    </ScreenFrame>
  );
}
