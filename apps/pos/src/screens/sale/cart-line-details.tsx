import {
  type OrderLine,
  QUANTITY_SCALE,
  formatVnd,
  negateQuantity,
  negateVnd,
  quantityToDecimalString,
} from "@fnb/domain";
import { MessageSquareText } from "lucide-react";
import type { ReactNode } from "react";
import { discountAmountOf } from "../../features/order-adjust/describe-discount";
import type { CartLine } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const C = vi.adjust.cart;

/**
 * What sits under an item's name in small type: its options (the tree the bill and the bar
 * ticket print), its note, its discount, what was cancelled of it, where the kitchen is.
 */
export function CartLineDetails(props: {
  line: CartLine;
  priced: readonly OrderLine[];
  priceOf(lineId: string): string;
  badge?: ReactNode;
}) {
  const { line, priced, priceOf } = props;
  const under = priced.filter((candidate) => candidate.parentLineId === line.lineId);
  const children = under.filter((candidate) => candidate.lineType !== "discount");
  const discounts = under.filter((candidate) => candidate.lineType === "discount");
  const cancels = priced.filter((candidate) => candidate.reversesLineId === line.lineId);
  return (
    <>
      {children.length === 0 ? null : (
        <ul className="pos-cart-line__children">
          {children.map((child) => {
            // A combo's pick carries its own options (sugar, ice), written after its name.
            const own = priced.filter((candidate) => candidate.parentLineId === child.id);
            return (
              <li key={child.id} className="pos-wrap" data-line-type={child.lineType}>
                + {child.nameSnapshot}
                {child.quantity === QUANTITY_SCALE
                  ? ""
                  : ` ×${quantityToDecimalString(child.quantity)}`}
                {own.length === 0
                  ? ""
                  : ` · ${own.map((option) => option.nameSnapshot).join(", ")}`}
              </li>
            );
          })}
        </ul>
      )}
      {line.note === null ? null : (
        <p className="pos-cart-line__note pos-wrap">
          <Icon of={MessageSquareText} size={14} />
          <span>
            {vi.sale.note}: {line.note}
          </span>
        </p>
      )}
      {discounts.length === 0 ? null : (
        <p className="pos-cart-line__sub" data-line-discount={line.lineId}>
          <span>{C.lineDiscount}</span>
          <span>{formatVnd(negateVnd(discountAmountOf(discounts)))}</span>
        </p>
      )}
      {cancels.map((cancel) => (
        <p key={cancel.id} className="pos-cart-line__sub">
          <span>{C.voided(Number(negateQuantity(cancel.quantity) / QUANTITY_SCALE))}</span>
          <span>{priceOf(cancel.id)}</span>
        </p>
      ))}
      {props.badge}
    </>
  );
}
