import type { PosProductWire } from "@fnb/contracts";
import { ROLE_TEMPLATES } from "@fnb/domain";
import { fakeServer } from "./fake-pos-server";
import { LAN } from "./signed-in-till";
import { MINH, staffAsCashierAndManager } from "./approval-cafe";
import { MENU, tid, tillBootstrap, tillBootstrapWire } from "./till-fixtures";

export const TYPED_MENU = {
  cake: tid(0x150),
  beans: tid(0x151),
  strawberries: tid(0x152),
} as const;

const item = (wire: Partial<PosProductWire> & Pick<PosProductWire, "id" | "name">) =>
  ({
    version: 10,
    brandId: MENU.brand,
    categoryId: MENU.food,
    stationId: MENU.bar,
    kind: "prepared_item",
    basePrice: null,
    pricingMode: "fixed",
    taxRate: 800,
    trackStock: false,
    earnsPoints: true,
    printCupLabel: false,
    variants: [],
    modifierGroups: [],
    combo: null,
    ...wire,
  }) satisfies PosProductWire;

/** A cake priced when it is ordered; 250.000 đ is only what it usually costs. */
export const BIRTHDAY_CAKE = item({
  id: TYPED_MENU.cake,
  name: "Bánh kem theo yêu cầu",
  pricingMode: "open_price",
  basePrice: 250_000,
});

/** Coffee beans at 32.000 đ per 100 g. */
export const BEANS = item({
  id: TYPED_MENU.beans,
  name: "Cà phê hạt Robusta",
  kind: "retail_item",
  pricingMode: "weighed",
  measureUnit: "100g",
  basePrice: 32_000,
});

/** Strawberries at 200.000 đ a kilogram. */
export const STRAWBERRIES = item({
  id: TYPED_MENU.strawberries,
  name: "Dâu tây Đà Lạt",
  kind: "retail_item",
  pricingMode: "weighed",
  measureUnit: "kg",
  basePrice: 200_000,
});

/** The café with a cake priced when ordered and two products sold by weight. */
export function typedAndWeighedBootstrap(staff = [LAN, MINH]) {
  const wire = tillBootstrapWire({ staff });
  return tillBootstrap({
    staff,
    menu: { ...wire.menu, products: [...wire.menu.products, BIRTHDAY_CAKE, BEANS, STRAWBERRIES] },
  });
}

/** Lan at the counter as a cashier (who may type prices alone), Minh to approve. */
export const typedAndWeighedCafe = () => {
  const server = fakeServer(typedAndWeighedBootstrap());
  server.state.pins.set(LAN.id, "4826");
  return staffAsCashierAndManager(server);
};

/** The same café with Lan as a waiter: she may not type a price without Minh. */
export function typedAndWeighedCafeWithWaiter() {
  const server = typedAndWeighedCafe();
  server.state.grants.set(LAN.id, [...ROLE_TEMPLATES.waiter.grants]);
  return server;
}
