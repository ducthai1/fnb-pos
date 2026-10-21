import { posProductSchema } from "@fnb/contracts";
import type { ReactElement } from "react";
import { cartView } from "../../../src/features/order/cart-view";
import { ModifierPickerScreen } from "../../../src/screens/sale/modifier-picker-screen";
import { SaleScreen } from "../../../src/screens/sale/sale-screen";
import { TillHeader } from "../../../src/screens/till/till-header";
import { HOSTILE_PRODUCT, hostileTillMenu } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_ORDER } from "../../../src/test-support/hostile-order";
import { PHOTOS_BY_PRODUCT } from "./hostile-photos";

// The selling screens again, with photos of extreme shapes and one that fails to load.

const menu = hostileTillMenu(PHOTOS_BY_PRODUCT);
const header = (
  <TillHeader
    branchName={HOSTILE_NAMES.branch}
    staffName={HOSTILE_NAMES.staff}
    status={{ connection: "online", pending: 0, needsAttention: 0 }}
    onOpenNeedsAttention={() => {}}
    onSwitchStaff={() => {}}
    onSignOut={() => {}}
  />
);
const profile = { pricesIncludeTax: false, serviceCharge: null };

export const PHOTO_SALE_SCREENS = {
  "sale-photos": () => (
    <SaleScreen
      header={header}
      menu={menu}
      now={Date.now()}
      order={HOSTILE_ORDER}
      view={cartView(menu, HOSTILE_ORDER, profile, Date.now())}
      saveFailed={false}
      onPick={() => {}}
      onQuantity={() => {}}
      onRemove={() => {}}
      onServiceType={() => {}}
      onCheckout={() => {}}
    />
  ),
  "modifier-picker-photo": () => (
    <ModifierPickerScreen
      header={header}
      menu={menu}
      product={posProductSchema.parse({
        ...HOSTILE_PRODUCT,
        imageUrl: PHOTOS_BY_PRODUCT[HOSTILE_PRODUCT.id],
      })}
      now={Date.now()}
      onAdd={() => {}}
      onCancel={() => {}}
    />
  ),
} satisfies Record<string, () => ReactElement>;
