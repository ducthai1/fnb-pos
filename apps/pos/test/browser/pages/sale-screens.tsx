import { posProductSchema } from "@fnb/contracts";
import type { ReactElement } from "react";
import { cartView } from "../../../src/features/order/cart-view";
import { OpenShiftScreen } from "../../../src/screens/open-shift/open-shift-screen";
import { ModifierPickerScreen } from "../../../src/screens/sale/modifier-picker-screen";
import { SaleScreen } from "../../../src/screens/sale/sale-screen";
import { TillHeader } from "../../../src/screens/till/till-header";
import { HOSTILE_PRODUCT, hostileTillMenu } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_ORDER } from "../../../src/test-support/hostile-order";

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
  />
);
const profile = { pricesIncludeTax: false, serviceCharge: null };

export const SALE_SCREENS = {
  "open-shift": () => <OpenShiftScreen header={header} onOpen={never} />,
  sale: () => (
    <SaleScreen
      header={header}
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
} satisfies Record<string, () => ReactElement>;
