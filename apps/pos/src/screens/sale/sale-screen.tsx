import type { PosProduct } from "@fnb/contracts";
import type { ReactNode } from "react";
import type { TillMenu } from "../../features/menu/till-menu";
import type { CartView } from "../../features/order/cart-view";
import type { CounterOrder } from "../../features/order/counter-order";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { type CartPanelProps, CartPanel } from "./cart-panel";
import { MenuPanel } from "./menu-panel";

export interface SaleScreenProps extends Omit<CartPanelProps, "order" | "view"> {
  header: ReactNode;
  menu: TillMenu;
  now: number;
  order: CounterOrder;
  view: CartView;
  saveFailed: boolean;
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
  onPick,
  ...cart
}: SaleScreenProps) {
  return (
    <ScreenFrame title={vi.sales.title} wide>
      {header}
      {saveFailed ? <Alert message={vi.sale.saveFailed} /> : null}
      <div className="pos-sale">
        <MenuPanel menu={menu} now={now} onPick={onPick} />
        <CartPanel order={order} view={view} {...cart} />
      </div>
    </ScreenFrame>
  );
}
