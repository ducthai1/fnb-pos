import type { PosProduct } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useState } from "react";
import type { TillMenu } from "../features/menu/till-menu";
import { cartView } from "../features/order/cart-view";
import {
  addCartLine,
  removeCartLine,
  setLineQuantity,
  setServiceType,
} from "../features/order/counter-order";
import type { TillPlace } from "../features/order/till-command";
import { useCounterOrder } from "../features/order/use-counter-order";
import { newId } from "../features/ids/new-id";
import type { CartLine } from "../features/order/counter-order";
import { vi } from "../messages/vi";
import { ModifierPickerScreen } from "../screens/sale/modifier-picker-screen";
import { SaleScreen } from "../screens/sale/sale-screen";
import { ScreenFrame } from "../screens/shared/screen-frame";

export interface CounterSaleProps {
  client: SyncClient;
  place: TillPlace;
  menu: TillMenu;
  now: number;
  header: ReactNode;
  shiftId: string;
}

const plainLine = (product: PosProduct): CartLine => ({
  lineId: newId(),
  productId: product.id,
  variantId: null,
  modifiers: [],
  quantity: 1,
  note: null,
});

/** One customer after another at the counter: ring up, take the money, start again. */
export function CounterSale({ client, place, menu, now, header }: CounterSaleProps) {
  const session = useCounterOrder(client, place, menu);
  const [picking, setPicking] = useState<PosProduct | null>(null);
  const { order, chargeProfile } = session;
  if (order === null || chargeProfile === null) {
    return (
      <ScreenFrame title={vi.sales.title}>
        {header}
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  if (picking !== null) {
    return (
      <ModifierPickerScreen
        header={header}
        menu={menu}
        product={picking}
        now={now}
        onCancel={() => setPicking(null)}
        onAdd={(line) => {
          session.update((draft) => addCartLine(draft, line));
          setPicking(null);
        }}
      />
    );
  }
  return (
    <SaleScreen
      header={header}
      menu={menu}
      now={now}
      order={order}
      view={cartView(menu, order, chargeProfile, now)}
      saveFailed={session.saveFailed}
      onPick={(product) => {
        // Nothing to choose: one tap rings it up, as a cashier expects of a bottle of water.
        if (product.variants.length === 0 && product.modifierGroups.length === 0) {
          session.update((draft) => addCartLine(draft, plainLine(product)));
        } else setPicking(product);
      }}
      onQuantity={(lineId, quantity) =>
        session.update((draft) => setLineQuantity(draft, lineId, quantity))
      }
      onRemove={(lineId) => session.update((draft) => removeCartLine(draft, lineId))}
      onServiceType={(serviceType, tableTag) =>
        session.update((draft) => setServiceType(draft, serviceType, tableTag))
      }
      onCheckout={() => void session.saveAt(Date.now())}
    />
  );
}
