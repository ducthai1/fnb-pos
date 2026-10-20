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
import { needsNoChoice, plainLine } from "../features/order/plain-cart-line";
import type { PricedCounterOrder } from "../features/order/price-counter-order";
import type { TillPlace } from "../features/order/till-command";
import type { CounterOrderSession } from "../features/order/use-counter-order";
import type { PrinterPort } from "../features/printing/printer-port";
import { vi } from "../messages/vi";
import { ModifierPickerScreen } from "../screens/sale/modifier-picker-screen";
import { SaleScreen } from "../screens/sale/sale-screen";
import { ScreenFrame } from "../screens/shared/screen-frame";
import { CounterCheckout } from "./counter-checkout";

export interface CounterSaleProps {
  client: SyncClient;
  place: TillPlace;
  menu: TillMenu;
  now: number;
  header: ReactNode;
  shiftId: string;
  cashierName: string;
  printer: PrinterPort;
  /** The counter's order, kept by the parent so switching to the floor and back keeps it. */
  session: CounterOrderSession;
  /** Counter or floor, shown on the selling screen only (not mid-checkout). */
  modeSwitch?: ReactNode;
}

type Phase =
  | { readonly kind: "selling" }
  | { readonly kind: "picking"; readonly product: PosProduct }
  | { readonly kind: "checkout"; readonly priced: PricedCounterOrder };

/** One customer after another at the counter: ring up, take the money, print, start again. */
export function CounterSale(props: CounterSaleProps) {
  const { menu, now, header, session } = props;
  const [phase, setPhase] = useState<Phase>({ kind: "selling" });
  const { order, chargeProfile } = session;

  if (order === null || chargeProfile === null) {
    return (
      <ScreenFrame title={vi.sales.title}>
        {header}
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  if (phase.kind === "checkout") {
    return (
      <CounterCheckout
        {...props}
        session={session}
        order={order}
        priced={phase.priced}
        onBackToSale={() => setPhase({ kind: "selling" })}
        onNextOrder={() => {
          session.startNew();
          setPhase({ kind: "selling" });
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
      header={
        <>
          {header}
          {props.modeSwitch}
        </>
      }
      menu={menu}
      now={now}
      order={order}
      view={cartView(menu, order, chargeProfile, now)}
      saveFailed={session.saveFailed}
      onPick={(product) => {
        if (needsNoChoice(product)) {
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
        if (priced !== null) setPhase({ kind: "checkout", priced });
      }}
    />
  );
}
