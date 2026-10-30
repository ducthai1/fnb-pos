import { posProductSchema } from "@fnb/contracts";
import type { ReactElement } from "react";
import { BestSellersContext } from "../../../src/features/menu/use-best-sellers";
import { cartView } from "../../../src/features/order/cart-view";
import { OpenShiftScreen } from "../../../src/screens/open-shift/open-shift-screen";
import { ModifierPickerScreen } from "../../../src/screens/sale/modifier-picker-screen";
import { SaleScreen } from "../../../src/screens/sale/sale-screen";
import { UnpaidOrdersStrip } from "../../../src/screens/sale/unpaid-orders-strip";
import type { StoredOrder } from "../../../src/features/order/stored-order";
import { vnd } from "@fnb/domain";
import { SellingModeSwitch } from "../../../src/screens/till/selling-mode-switch";
import { TillBarNav } from "../../../src/screens/till/till-bar-nav";
import { TillHeader } from "../../../src/screens/till/till-header";
import { TillTools } from "../../../src/screens/till/till-tools";
import { HOSTILE_COMBO } from "../../../src/test-support/combo-menu";
import { HOSTILE_PRODUCT, hostileTillMenu } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_ORDER } from "../../../src/test-support/hostile-order";
import { tid } from "../../../src/test-support/till-fixtures";

// The selling screens with the worst data a shop can enter; see screens-page.tsx.

const menu = hostileTillMenu();
const never = () => new Promise<never>(() => {});
const header = (
  <TillHeader
    branchName={HOSTILE_NAMES.branch}
    staffName={HOSTILE_NAMES.staff}
    status={{ connection: "server_error", pending: 123_456, needsAttention: 9_999 }}
    onOpenNeedsAttention={() => {}}
    onSwitchStaff={() => {}}
    onSignOut={() => {}}
  />
);
/** The selling screen's bar, carrying both selling modes and every tool beside the worst names. */
const sellingHeader = (
  <TillBarNav
    nav={
      <div className="pos-navbar">
        <SellingModeSwitch mode="counter" onChange={() => {}} />
        <TillTools onOpen={() => {}} />
      </div>
    }
  >
    {header}
  </TillBarNav>
);
const profile = { pricesIncludeTax: false, serviceCharge: null };

/** Thirty lines of the worst items: the order column scrolls, the totals stay at its foot. */
const LONG_ORDER = {
  ...HOSTILE_ORDER,
  lines: Array.from({ length: 30 }, (_, index) => ({
    ...HOSTILE_ORDER.lines[index % HOSTILE_ORDER.lines.length]!,
    lineId: tid(0x700 + index),
  })),
};
const adjust = {
  onVoid: () => {},
  onDiscount: () => {},
  onDiscountOrder: () => {},
  onCancelOrder: () => {},
};

export const SALE_SCREENS = {
  "open-shift": () => <OpenShiftScreen header={header} onOpen={never} />,
  sale: () => (
    // The longest name is a best seller too: its tag must not push the tile wider.
    <BestSellersContext value={new Set([HOSTILE_PRODUCT.id])}>
      <SaleScreen
        header={sellingHeader}
        menu={menu}
        now={Date.now()}
        order={HOSTILE_ORDER}
        view={cartView(menu, HOSTILE_ORDER, profile, Date.now())}
        saveFailed
        onPick={() => {}}
        onQuantity={() => {}}
        onRemove={() => {}}
        onServiceType={() => {}}
        onCheckout={() => {}}
      />
    </BestSellersContext>
  ),
  "sale-long-cart": () => (
    <SaleScreen
      header={sellingHeader}
      menu={menu}
      now={Date.now()}
      order={LONG_ORDER}
      view={cartView(menu, LONG_ORDER, profile, Date.now())}
      adjust={adjust}
      saveFailed={false}
      onPick={() => {}}
      onQuantity={() => {}}
      onRemove={() => {}}
      onServiceType={() => {}}
      onCheckout={() => {}}
    />
  ),
  "unpaid-orders-strip": () => (
    <SaleScreen
      header={sellingHeader}
      menu={menu}
      now={Date.now()}
      order={HOSTILE_ORDER}
      view={cartView(menu, HOSTILE_ORDER, profile, Date.now())}
      saveFailed={false}
      notices={
        <UnpaidOrdersStrip
          orders={[
            // The worst case: a huge number, a nine-digit amount and many items.
            {
              order: { orderId: "a", deviceOrderNo: 987_654 } as StoredOrder,
              items: 9_999,
              amountDue: vnd(987_654_321),
            },
            { order: { orderId: "b", deviceOrderNo: 7 } as StoredOrder, items: 1, amountDue: vnd(1) },
          ]}
          onReopen={() => {}}
          onCancel={() => {}}
        />
      }
      onPick={() => {}}
      onQuantity={() => {}}
      onRemove={() => {}}
      onServiceType={() => {}}
      onCheckout={() => {}}
    />
  ),
  "modifier-picker": () => (
    <ModifierPickerScreen
      header={header}
      menu={menu}
      product={posProductSchema.parse(HOSTILE_PRODUCT)}
      now={Date.now()}
      onAdd={() => {}}
      onCancel={() => {}}
    />
  ),
  "combo-picker": () => (
    <ModifierPickerScreen
      header={header}
      menu={menu}
      product={posProductSchema.parse(HOSTILE_COMBO)}
      now={Date.now()}
      onAdd={() => {}}
      onCancel={() => {}}
    />
  ),
} satisfies Record<string, () => ReactElement>;
