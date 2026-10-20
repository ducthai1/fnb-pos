import type { PosProduct } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useState } from "react";
import { newId } from "../features/ids/new-id";
import type { TillMenu } from "../features/menu/till-menu";
import { cartView } from "../features/order/cart-view";
import {
  type CartLine,
  addCartLine,
  removeCartLine,
  setLineQuantity,
  setServiceType,
} from "../features/order/counter-order";
import type { PricedCounterOrder } from "../features/order/price-counter-order";
import type { TillPlace } from "../features/order/till-command";
import { useCounterOrder } from "../features/order/use-counter-order";
import { paySale } from "../features/payment/pay-sale";
import type { PaidSale } from "../features/printing/paid-sale";
import { type PrintedSlip, printSaleSlips } from "../features/printing/print-sale-slips";
import type { PrinterPort } from "../features/printing/printer-port";
import { vi } from "../messages/vi";
import { PaymentScreen } from "../screens/payment/payment-screen";
import { SaleDoneScreen } from "../screens/payment/sale-done-screen";
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
  cashierName: string;
  printer: PrinterPort;
}

type Phase =
  | { readonly kind: "selling" }
  | { readonly kind: "picking"; readonly product: PosProduct }
  | { readonly kind: "paying"; readonly priced: PricedCounterOrder }
  | {
      readonly kind: "done";
      readonly sale: PaidSale;
      readonly slips: readonly PrintedSlip[] | null;
    };

const plainLine = (product: PosProduct): CartLine => ({
  lineId: newId(),
  productId: product.id,
  variantId: null,
  modifiers: [],
  quantity: 1,
  note: null,
});

/** One customer after another at the counter: ring up, take the money, print, start again. */
export function CounterSale(props: CounterSaleProps) {
  const { client, place, menu, now, header } = props;
  const session = useCounterOrder(client, place, menu);
  const [phase, setPhase] = useState<Phase>({ kind: "selling" });
  const { order, chargeProfile } = session;

  if (phase.kind === "done") {
    return (
      <SaleDoneScreen
        header={header}
        sale={phase.sale}
        slips={phase.slips}
        onNextOrder={() => {
          session.startNew();
          setPhase({ kind: "selling" });
        }}
      />
    );
  }
  if (order === null || chargeProfile === null) {
    return (
      <ScreenFrame title={vi.sales.title}>
        {header}
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  if (phase.kind === "paying") {
    return (
      <PaymentScreen
        header={header}
        amountDue={phase.priced.totals.amountDue}
        onBack={() => setPhase({ kind: "selling" })}
        onPaid={async (tenders) => {
          const sale = await paySale({
            ...props,
            session,
            order,
            priced: phase.priced,
            tenders,
            at: Date.now(),
          });
          setPhase({ kind: "done", sale, slips: null });
          const slips = await printSaleSlips({
            ...props,
            sale,
            record: session.record,
            now: Date.now,
          }).catch((error: unknown) => {
            console.error(error);
            return [];
          });
          setPhase((shown) =>
            shown.kind === "done" && shown.sale === sale ? { ...shown, slips } : shown,
          );
        }}
      />
    );
  }
  if (phase.kind === "picking") {
    return (
      <ModifierPickerScreen
        header={header}
        menu={menu}
        product={phase.product}
        now={now}
        onCancel={() => setPhase({ kind: "selling" })}
        onAdd={(line) => {
          session.update((draft) => addCartLine(draft, line));
          setPhase({ kind: "selling" });
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
        } else setPhase({ kind: "picking", product });
      }}
      onQuantity={(lineId, quantity) =>
        session.update((draft) => setLineQuantity(draft, lineId, quantity))
      }
      onRemove={(lineId) => session.update((draft) => removeCartLine(draft, lineId))}
      onServiceType={(serviceType, tableTag) =>
        session.update((draft) => setServiceType(draft, serviceType, tableTag))
      }
      onCheckout={async () => {
        const priced = await session.saveAt(Date.now());
        if (priced !== null) setPhase({ kind: "paying", priced });
      }}
    />
  );
}
