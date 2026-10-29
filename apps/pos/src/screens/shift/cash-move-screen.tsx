import { type Vnd, formatVnd } from "@fnb/domain";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Wallet } from "lucide-react";
import { type ReactNode, useState } from "react";
import { typedAmount } from "../../features/payment/cash-suggestions";
import { vi } from "../../messages/vi";
import { CashKeypad } from "../payment/cash-keypad";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { ShiftPanel } from "./shift-panel";

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
    <ScreenFrame
      title={C.title}
      width="split"
      dock={
        <>
          {valid ? (
            <p
              className="pos-total"
              data-expected-after={String(props.expectedAfter(kind, amount))}
            >
              {C.expectedAfter(formatVnd(props.expectedAfter(kind, amount)))}
            </p>
          ) : null}
          <Alert message={error} />
          <div className="pos-actions pos-actions--split">
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
        </>
      }
    >
      {props.header}
      {props.notice ? (
        <p className="pos-notice" role="status">
          {props.notice}
        </p>
      ) : null}
      <div className="pos-split">
        <ShiftPanel icon={Wallet} title={C.kindTitle}>
          <div className="pos-segmented pos-segmented--kind" role="group" aria-label={C.title}>
            {(["in", "out"] as const).map((each) => (
              <button
                key={each}
                type="button"
                className="pos-button pos-tab"
                data-kind={each}
                aria-pressed={kind === each}
                onClick={() => setKind(each)}
              >
                <Icon of={each === "in" ? ArrowDownToLine : ArrowUpFromLine} size={22} />
                {each === "in" ? C.in : C.out}
              </button>
            ))}
          </div>
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
        </ShiftPanel>
        <div className="pos-split__side">
          <ShiftPanel icon={Banknote} title={C.amountTitle}>
            <label className="pos-field">
              <span className="pos-field__label">{C.amount}</span>
              <input
                className="pos-input pos-input--amount"
                inputMode="numeric"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </label>
            <CashKeypad typed={typed} onChange={setTyped} />
            {typed !== "" && !valid ? <Alert message={C.unreadable} /> : null}
          </ShiftPanel>
        </div>
      </div>
    </ScreenFrame>
  );
}
