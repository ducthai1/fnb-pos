import type { PosProduct } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { type ReactNode, useState } from "react";
import type { TillMenu } from "../features/menu/till-menu";
import { cartView } from "../features/order/cart-view";
import {
  type CartLine,
  addCartLine,
  removeCartLine,
  replaceCartLine,
  setLineQuantity,
  setServiceType,
} from "../features/order/counter-order";
import { openingFromStored } from "../features/order/order-opening";
import {
  type UnpaidCounterOrder,
  useUnpaidCounterOrders,
} from "../features/order/unpaid-counter-orders";
import type { PricedCounterOrder } from "../features/order/price-counter-order";
import { businessDateAt, type TillPlace } from "../features/order/till-command";
import type { CounterSession } from "../features/order/use-counter-order";
import type { PrinterPort } from "../features/printing/printer-port";
import { vi } from "../messages/vi";
import { ModifierPickerScreen } from "../screens/sale/modifier-picker-screen";
import { SaleScreen } from "../screens/sale/sale-screen";
import { UnpaidOrdersStrip } from "../screens/sale/unpaid-orders-strip";
import { ScreenFrame } from "../screens/shared/screen-frame";
import { UnderLayer } from "../screens/shared/under-layer";
import { TillBarNav } from "../screens/till/till-bar-nav";
import { CounterCheckout } from "./counter-checkout";
import { LineEntryFlow, type PendingEntry } from "./line-entry-flow";
import { type ChosenLine, chosenLine, retyped, tapped } from "./line-entry-steps";
import { type AdjustStep, OrderAdjustmentFlow, adjustmentsFor } from "./order-adjustment-flow";

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
  session: CounterSession;
  /** Counter or floor, shown on the selling screen only (not mid-checkout). */
  modeSwitch?: ReactNode;
}

type Phase =
  | { readonly kind: "selling" }
  | { readonly kind: "picking"; readonly product: PosProduct }
  | { readonly kind: "entering"; readonly pending: PendingEntry }
  | { readonly kind: "adjusting"; readonly step: AdjustStep }
  | { readonly kind: "checkout"; readonly priced: PricedCounterOrder };

/** One customer after another at the counter: ring up, take the money, print, start again. */
export function CounterSale(props: CounterSaleProps) {
  const { menu, now, header, session } = props;
  const [phase, setPhase] = useState<Phase>({ kind: "selling" });
  const [wholeScreen, setWholeScreen] = useState(false);
  const { order, chargeProfile } = session;
  // What a reload left unpaid is never reopened on its own: the cashier chooses.
  const unpaid = useUnpaidCounterOrders(
    props.client,
    props.place.deviceId,
    businessDateAt(props.place, now),
    order?.orderId ?? null,
  );
  const reopen = (left: UnpaidCounterOrder) => session.reopen(openingFromStored(menu, left.order));
  /** A chosen line goes on the order, or waits in the drawer for its price or weight. */
  const take = (chosen: ChosenLine) => {
    if (chosen.kind === "enter") return setPhase({ kind: "entering", pending: chosen.pending });
    session.update((draft) => addCartLine(draft, chosen.line));
    setPhase({ kind: "selling" });
  };
  const entered = (pending: PendingEntry, line: CartLine) => {
    session.update((draft) =>
      pending.editing ? replaceCartLine(draft, line) : addCartLine(draft, line),
    );
    setPhase({ kind: "selling" });
  };

  if (order === null || chargeProfile === null) {
    return (
      <ScreenFrame title={vi.sales.title}>
        {header}
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  if (phase.kind === "adjusting") {
    return (
      <OrderAdjustmentFlow
        step={phase.step}
        session={session}
        client={props.client}
        menu={menu}
        place={props.place}
        header={header}
        onDone={(outcome) => {
          if (outcome.kind === "cancelled") session.startNew();
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
        onAdd={(line) => take(chosenLine(phase.product, line))}
      />
    );
  }
  const checkout = phase.kind === "checkout" ? phase.priced : null;
  const entering = phase.kind === "entering" ? phase.pending : null;
  return (
    <>
      <UnderLayer
        covered={checkout !== null || entering !== null}
        gone={checkout !== null && wholeScreen}
      >
        <SaleScreen
          header={<TillBarNav nav={props.modeSwitch}>{header}</TillBarNav>}
          menu={menu}
          now={now}
          order={order}
          view={cartView(menu, order, chargeProfile, now, session.kept, session.commandLines)}
          kept={session.kept}
          commandLines={session.commandLines}
          adjust={adjustmentsFor((step) => setPhase({ kind: "adjusting", step }))}
          saveFailed={session.saveFailed}
          notices={
            <UnpaidOrdersStrip
              orders={unpaid}
              onReopen={reopen}
              onCancel={(left) => {
                // Cancelling goes through the cancel screen of the order, with its rules.
                reopen(left);
                setPhase({ kind: "adjusting", step: { kind: "cancel" } });
              }}
            />
          }
          onPick={(product) => {
            const chosen = tapped(product);
            if (chosen === "pick") setPhase({ kind: "picking", product });
            else take(chosen);
          }}
          onEntry={(lineId) => {
            const pending = retyped(menu, order, lineId);
            if (pending !== null) setPhase({ kind: "entering", pending });
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
      </UnderLayer>
      {entering === null ? null : (
        <LineEntryFlow
          menu={menu}
          now={now}
          orderId={order.orderId}
          pending={entering}
          onCancel={() => setPhase({ kind: "selling" })}
          onDone={(line) => entered(entering, line)}
        />
      )}
      {checkout === null ? null : (
        <CounterCheckout
          {...props}
          session={session}
          order={order}
          priced={checkout}
          onBackToSale={() => setPhase({ kind: "selling" })}
          onWholeScreen={setWholeScreen}
          onNextOrder={() => {
            session.startNew();
            setPhase({ kind: "selling" });
          }}
        />
      )}
    </>
  );
}
