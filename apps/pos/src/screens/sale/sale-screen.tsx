import type { PosProduct } from "@fnb/contracts";
import type { ReactNode } from "react";
import type { TillMenu } from "../../features/menu/till-menu";
import type { CartView } from "../../features/order/cart-view";
import type { CounterOrder } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { type CartPanelProps, CartPanel } from "./cart-panel";
import { CartPeek } from "./cart-peek";
import { MenuPanel } from "./menu-panel";
import { unitsByProduct } from "./product-mark";

export interface SaleScreenProps extends Omit<CartPanelProps, "order" | "view"> {
  header: ReactNode;
  menu: TillMenu;
  now: number;
  order: CounterOrder;
  view: CartView;
  saveFailed: boolean;
  /** Orders left unpaid, or anything else to tell the cashier before selling on. */
  notices?: ReactNode;
  onPick(product: PosProduct): void;
}

/** The counter: the menu beside the order on a tablet, the order under it on a phone. */
export function SaleScreen({
  header,
  menu,
  now,
  order,
  view,
  saveFailed,
  notices,
  onPick,
  ...cart
}: SaleScreenProps) {
  return (
    <ScreenFrame title={vi.sales.title} wide titleHidden>
      {header}
      {saveFailed ? <Alert message={vi.sale.saveFailed} /> : null}
      {notices}
      <div className="pos-sale">
        <div className="pos-sale__menu">
          <MenuPanel
            menu={menu}
            now={now}
            inCart={unitsByProduct(order.lines)}
            orderId={order.orderId}
            onPick={onPick}
          />
          <CartPeek lines={order.lines} view={view} />
        </div>
        <CartPanel order={order} view={view} {...cart} />
      </div>
    </ScreenFrame>
  );
}
