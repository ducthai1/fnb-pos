import type {
  PosAvailability,
  PosCategory,
  PosDeviceConfig,
  PosFeedEntity,
  PosPriceList,
  PosProduct,
  PosStation,
} from "@fnb/contracts";
import { type PriceListItem, measureUnitOf } from "@fnb/domain";
import type { CallNumbering } from "../order/device-order-number";
import type { BootstrapSnapshot } from "../bootstrap/bootstrap-source";

/** The copy each menu entity of the change feed carries, in its parsed (domain) form. */
export interface MenuCopyShapes {
  catalog_product: PosProduct;
  catalog_category: PosCategory;
  catalog_station: PosStation;
  catalog_availability: PosAvailability;
  price_list: PosPriceList;
  device_config: PosDeviceConfig;
}

/** What the till's own database holds of each menu entity, by entity id. */
export type MenuCopies = { readonly [E in PosFeedEntity]: ReadonlyMap<string, MenuCopyShapes[E]> };

export const NO_MENU_COPIES: MenuCopies = {
  catalog_product: new Map(),
  catalog_category: new Map(),
  catalog_station: new Map(),
  catalog_availability: new Map(),
  price_list: new Map(),
  device_config: new Map(),
};

/** The key of a row the feed deleted (or took off the menu) since the till started. */
export const removedKey = (entity: string, entityId: string) => `${entity}:${entityId}`;

/** The menu as the till sells from it right now. */
export interface TillMenu {
  readonly branch: BootstrapSnapshot["branch"];
  /** How this till numbers the calls of its drinks; null from a server that does not say. */
  readonly callNumbering: CallNumbering | null;
  readonly shopName: string;
  readonly categories: readonly PosCategory[];
  /** What the counter can sell, by name; see sellableOnCounter. */
  readonly products: readonly PosProduct[];
  readonly productsById: ReadonlyMap<string, PosProduct>;
  readonly stations: ReadonlyMap<string, PosStation>;
  /** Every price list item of the brand that can apply here, in id order like the server. */
  readonly priceItems: readonly PriceListItem[];
  readonly availability: ReadonlyMap<string, PosAvailability>;
  readonly config: PosDeviceConfig;
}

/**
 * A combo is sold with its slots, so one without any (a copy stored before combos could be
 * set up) waits for a newer copy. An open-price product is sold at the price the cashier
 * types, a weighed one at what it weighs; a weighed product whose copy names no unit (stored
 * before units existed) cannot say what its price is per, so it waits for a newer copy.
 */
export function sellableOnCounter(product: PosProduct): boolean {
  if (product.kind === "combo") return (product.combo?.slots.length ?? 0) > 0;
  return product.pricingMode !== "weighed" || measureUnitOf(product) !== null;
}

/**
 * Each row in its newest copy: the bootstrap's, unless the feed brought a strictly newer
 * version (both are feed positions), and gone once the feed deleted it.
 */
function newest<T extends { readonly version: number }>(
  entity: PosFeedEntity,
  base: readonly T[],
  copies: ReadonlyMap<string, T>,
  removed: ReadonlySet<string>,
  idOf: (row: T) => string,
): T[] {
  const rows = new Map(base.map((row) => [idOf(row), row]));
  for (const [id, copy] of copies) {
    const known = rows.get(id);
    if (known === undefined || copy.version > known.version) rows.set(id, copy);
  }
  for (const id of rows.keys()) if (removed.has(removedKey(entity, id))) rows.delete(id);
  return [...rows.values()];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "vi");

export function buildTillMenu(
  bootstrap: BootstrapSnapshot,
  copies: MenuCopies,
  removed: ReadonlySet<string>,
): TillMenu {
  const { menu } = bootstrap;
  const byId = (row: { id: string }) => row.id;
  const products = newest("catalog_product", menu.products, copies.catalog_product, removed, byId);
  const categories = newest(
    "catalog_category",
    menu.categories,
    copies.catalog_category,
    removed,
    byId,
  ).sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b));
  const stations = newest("catalog_station", menu.stations, copies.catalog_station, removed, byId);
  const priceLists = newest("price_list", menu.priceLists, copies.price_list, removed, byId);
  const availability = newest(
    "catalog_availability",
    menu.availability,
    copies.catalog_availability,
    removed,
    (row) => row.productId,
  );
  const ownConfig = copies.device_config.get(bootstrap.config.id);
  return {
    branch: bootstrap.branch,
    callNumbering: bootstrap.callNumbering ?? null,
    shopName: bootstrap.brand.name,
    categories,
    products: products.filter(sellableOnCounter).sort(byName),
    productsById: new Map(products.map((product) => [product.id, product])),
    stations: new Map(stations.map((station) => [station.id, station])),
    priceItems: priceLists
      .flatMap((list) => list.items)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    availability: new Map(availability.map((row) => [row.productId, row])),
    config:
      ownConfig !== undefined && ownConfig.version > bootstrap.config.version
        ? ownConfig
        : bootstrap.config,
  };
}
