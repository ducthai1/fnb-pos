import { type Vnd, formatVnd } from "@fnb/domain";
import { useState } from "react";
import { cashSuggestions, typedAmount } from "../../features/payment/cash-suggestions";
import { vi } from "../../messages/vi";

const T = vi.checkout.payment;

/** Quick keys for the notes customers hand over, and a field for any other amount. */
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
  return (
    <section className="pos-card pos-cash" aria-label={T.cash}>
      <div className="pos-quick-cash">
        {cashSuggestions(remaining).map((amount) => (
          <button
            key={String(amount)}
            type="button"
            className="pos-button"
            onClick={() => onTake(amount)}
          >
            {T.quickCash(formatVnd(amount))}
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
          className="pos-input"
          inputMode="numeric"
          aria-label={T.cashTyped}
          placeholder={T.cashTyped}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        <button type="submit" className="pos-button">
          {T.addCash}
        </button>
      </form>
    </section>
  );
}
