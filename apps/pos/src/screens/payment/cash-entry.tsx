import { type Vnd, formatVnd } from "@fnb/domain";
import { Banknote } from "lucide-react";
import { useState } from "react";
import { cashSuggestions, typedAmount } from "../../features/payment/cash-suggestions";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { CashKeypad } from "./cash-keypad";

const T = vi.checkout.payment;

/**
 * Quick keys for the notes customers hand over (the exact amount, then rounded up to each
 * note), and any other amount typed on the field or on the keys under it.
 */
export function CashEntry({
  remaining,
  onTake,
  onUnreadable,
}: {
  remaining: Vnd;
  onTake(amount: Vnd): void;
  onUnreadable(): void;
}) {
  const [typed, setTyped] = useState("");
  const preview = typed === "" ? null : typedAmount(typed);
  return (
    <section className="pos-card pos-cash" aria-label={T.cash}>
      <h2 className="pos-card__title">
        <Icon of={Banknote} size={22} />
        {T.cash}
      </h2>
      <div className="pos-quick-cash">
        {cashSuggestions(remaining).map((amount) => (
          <button
            key={String(amount)}
            type="button"
            className="pos-quick-cash__key"
            onClick={() => onTake(amount)}
          >
            <span className="pos-quick-cash__hint">{T.quickCashHint}</span>{" "}
            <span className="pos-quick-cash__amount">{formatVnd(amount)}</span>
          </button>
        ))}
      </div>
      <form
        className="pos-cash__typed"
        onSubmit={(event) => {
          event.preventDefault();
          const amount = typedAmount(typed);
          if (amount === null) return onUnreadable();
          setTyped("");
          onTake(amount);
        }}
      >
        <input
          className="pos-input pos-cash__input"
          inputMode="numeric"
          aria-label={T.cashTyped}
          placeholder={T.cashTyped}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        <button type="submit" className="pos-button pos-button--primary">
          {T.addCash}
        </button>
      </form>
      <p className="pos-cash__preview" aria-live="polite">
        {preview === null ? "" : T.typedPreview(formatVnd(preview))}
      </p>
      <CashKeypad typed={typed} onChange={setTyped} />
    </section>
  );
}
