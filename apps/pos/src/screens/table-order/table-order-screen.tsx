import type { PosProduct } from "@fnb/contracts";
import type { ReactNode } from "react";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";
import { CartPeek } from "../sale/cart-peek";
import { MenuPanel } from "../sale/menu-panel";
import { unitsByProduct } from "../sale/product-mark";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { TableCart, type TableCartProps } from "./table-cart";

export interface TableOrderScreenProps extends TableCartProps {
  header: ReactNode;
  menu: TillMenu;
  now: number;
  saveFailed: boolean;
  /** Sentences about the order (a refusal, a pre-bill now out of date), above the menu. */
  notices?: ReactNode;
  onPick(product: PosProduct): void;
}

/** Ordering at a table: the menu beside the table's order, as at the counter. */
export function TableOrderScreen({
  header,
  menu,
  now,
  saveFailed,
  notices,
  onPick,
  ...cart
}: TableOrderScreenProps) {
  return (
    <ScreenFrame title={vi.tables.order.title(cart.order.table?.name ?? "")} wide>
      {header}
      {saveFailed ? <Alert message={vi.sale.saveFailed} /> : null}
      {notices}
      <div className="pos-sale">
        <div className="pos-sale__menu">
          <MenuPanel
            menu={menu}
            now={now}
            inCart={unitsByProduct(cart.order.lines)}
            orderId={cart.order.orderId}
            onPick={onPick}
          />
          <CartPeek lines={cart.order.lines} view={cart.view} />
        </div>
        <TableCart {...cart} />
      </div>
    </ScreenFrame>
  );
}
