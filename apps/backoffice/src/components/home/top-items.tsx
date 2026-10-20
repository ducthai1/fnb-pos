import { quantityText, vndText } from "../../lib/format/business-day";
import type { DayItem } from "../../lib/reports/day-figures";
import { vi } from "../../messages/vi";

const T = vi.home;

/** The goods sold most today, ranked, with units and what they brought after discounts. */
export function TopItems({ items }: { items: readonly DayItem[] }) {
  if (items.length === 0) return <p className="bo-empty">{T.topEmpty}</p>;
  return (
    <ol className="bo-top-items">
      {items.map((item, index) => (
        <li key={`${index}-${item.name}`} className="bo-top-items__row">
          <span className="bo-top-items__rank" aria-hidden="true">
            {index + 1}
          </span>
          <span className="bo-top-items__name bo-wrap">{item.name}</span>
          <span className="bo-top-items__units">{T.units(quantityText(item.quantity))}</span>
          <span className="bo-top-items__amount" data-amount={item.net}>
            {vndText(item.net)}
          </span>
        </li>
      ))}
    </ol>
  );
}
