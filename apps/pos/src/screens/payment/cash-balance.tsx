import { ZERO_VND, compareVnd, formatVnd } from "@fnb/domain";
import { Banknote, X } from "lucide-react";
import type { Settlement, Tender } from "../../features/payment/tenders";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const T = vi.checkout.payment;

/**
 * The cash taken so far, each piece removable, then what is still owed and the change to
 * hand back, the change in big green type once there is some. The domain did the sums.
 */
export function CashBalance({
  tenders,
  settlement,
  onRemove,
}: {
  tenders: readonly Tender[];
  settlement: Settlement;
  onRemove(index: number): void;
}) {
  const owed = compareVnd(settlement.remaining, ZERO_VND) > 0;
  return (
    <section className="pos-pay-balance" aria-label={T.summary}>
      {tenders.length === 0 ? null : (
        <ul className="pos-list pos-tenders">
          {tenders.map((tender, index) => {
            const method = vi.checkout.methods[tender.method];
            return (
              <li key={index} className="pos-tender">
                <Icon of={Banknote} />
                <span className="pos-tender__text pos-wrap">
                  {method} {formatVnd(tender.amount)}
                </span>
                <button
                  type="button"
                  className="pos-button pos-button--quiet pos-button--sm"
                  aria-label={T.removeTender(method, formatVnd(tender.amount))}
                  onClick={() => onRemove(index)}
                >
                  <Icon of={X} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <dl className="pos-balance">
        <div className="pos-balance__row" data-owed={owed}>
          <dt>{T.remaining}</dt>
          <dd data-remaining={String(settlement.remaining)}>{formatVnd(settlement.remaining)}</dd>
        </div>
        <div
          className="pos-balance__row pos-balance__row--change"
          data-has-change={compareVnd(settlement.change, ZERO_VND) > 0}
        >
          <dt>{T.change}</dt>
          <dd data-change={String(settlement.change)}>{formatVnd(settlement.change)}</dd>
        </div>
      </dl>
    </section>
  );
}
