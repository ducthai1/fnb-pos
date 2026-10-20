import {
  POS_FEED_ENTITY,
  type PosFeedEntity,
  posAvailabilitySchema,
  posCategorySchema,
  posDeviceConfigSchema,
  posPriceListSchema,
  posProductSchema,
  posStationSchema,
} from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { type MenuCopies, type MenuCopyShapes, removedKey } from "./till-menu";

interface CopyParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const PARSERS: { readonly [E in PosFeedEntity]: CopyParser<MenuCopyShapes[E]> } = {
  catalog_product: posProductSchema,
  catalog_category: posCategorySchema,
  catalog_station: posStationSchema,
  catalog_availability: posAvailabilitySchema,
  price_list: posPriceListSchema,
  device_config: posDeviceConfigSchema,
};

const MENU_ENTITIES: ReadonlySet<string> = new Set(Object.values(POS_FEED_ENTITY));

export const isMenuEntity = (entity: string): entity is PosFeedEntity => MENU_ENTITIES.has(entity);

/** The rows read, and the key of every row the database shows, readable or not. */
export interface ReadMenuCopies {
  readonly copies: MenuCopies;
  readonly shown: ReadonlySet<string>;
}

async function copiesOf<E extends PosFeedEntity>(
  client: Pick<SyncClient, "snapshots">,
  entity: E,
  shown: Set<string>,
): Promise<Map<string, MenuCopyShapes[E]>> {
  const copies = new Map<string, MenuCopyShapes[E]>();
  for (const view of await client.snapshots(entity)) {
    shown.add(removedKey(entity, view.entityId));
    // A copy this till cannot read (a newer server's shape) is skipped, not fatal: the till
    // keeps selling from the bootstrap's copy of that row.
    const parsed = PARSERS[entity].safeParse(view.snapshot);
    if (parsed.success) copies.set(view.entityId, parsed.data);
  }
  return copies;
}

/** The menu rows the till's database holds from the change feed, parsed by the contract. */
export async function readMenuCopies(
  client: Pick<SyncClient, "snapshots">,
): Promise<ReadMenuCopies> {
  const shown = new Set<string>();
  const copies: MenuCopies = {
    catalog_product: await copiesOf(client, "catalog_product", shown),
    catalog_category: await copiesOf(client, "catalog_category", shown),
    catalog_station: await copiesOf(client, "catalog_station", shown),
    catalog_availability: await copiesOf(client, "catalog_availability", shown),
    price_list: await copiesOf(client, "price_list", shown),
    device_config: await copiesOf(client, "device_config", shown),
  };
  return { copies, shown };
}
