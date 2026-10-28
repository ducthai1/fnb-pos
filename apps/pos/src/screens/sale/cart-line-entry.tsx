import { type MeasureUnit, type OrderLine, ZERO_VND, formatGrams, formatVnd } from "@fnb/domain";
import { PencilLine, Weight } from "lucide-react";
import type { CartLine } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const S = vi.sale;
const E = vi.sale.entry;

/**
 * Under an item's name, what the cashier typed for it: "353 g × 200.000 ₫/kg" for a weighing,
 * "Giá nhập · 150.000 ₫" for a typed price. While the line can still change it is a button
 * that weighs it again or types the price again; once held it is only read.
 */
export function CartLineEntry(props: {
  line: CartLine;
  name: string;
  /** The item line as the domain priced it: its price per unit is the menu's or the typed one. */
  item: OrderLine | undefined;
  unit: MeasureUnit | null;
  onEntry?: (() => void) | undefined;
}) {
  const { line, item, unit } = props;
  const weighed = line.grams !== undefined;
  if (!weighed && line.enteredPrice === undefined) return null;
  const text = weighed
    ? E.weighed(
        formatGrams(line.grams ?? 0),
        unit === null || item === undefined
          ? ""
          : S.pricePer(formatVnd(item.unitPrice), S.units[unit]),
      )
    : `${E.typedBadge} · ${formatVnd(line.enteredPrice ?? item?.unitPrice ?? ZERO_VND)}`;
  const icon = <Icon of={weighed ? Weight : PencilLine} size={14} />;
  const data = weighed ? { "data-weighed": line.grams } : { "data-typed-price": String(line.enteredPrice) };
  if (props.onEntry === undefined) {
    return (
      <p className="pos-cart-line__entry pos-wrap" {...data}>
        {icon}
        <span>{text}</span>
      </p>
    );
  }
  return (
    <button
      type="button"
      className="pos-cart-line__entry pos-cart-line__entry--edit pos-wrap"
      aria-label={weighed ? E.reweigh(props.name) : E.changePrice(props.name)}
      onClick={props.onEntry}
      {...data}
    >
      {icon}
      <span>{text}</span>
    </button>
  );
}
