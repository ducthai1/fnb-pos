import { formatVnd } from "@fnb/domain";
import { ChevronDown } from "lucide-react";
import type { CartView } from "../../features/order/cart-view";
import type { CartLine } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

/**
 * On a phone the order sits under the whole menu: this bar at the foot of the menu says how
 * many items it holds and what it comes to (the domain's total), and takes the cashier to it.
 * A tablet shows the order beside the menu, so the bar is hidden there.
 */
export function CartPeek({ lines, view }: { lines: readonly CartLine[]; view: CartView }) {
  if (lines.length === 0 || view.kind !== "priced") return null;
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <button
      type="button"
      className="pos-cart-peek"
      onClick={() => document.querySelector(".pos-cart")?.scrollIntoView({ block: "start" })}
    >
      {vi.sale.peek(count, formatVnd(view.priced.totals.amountDue))}
      <Icon of={ChevronDown} />
    </button>
  );
}
