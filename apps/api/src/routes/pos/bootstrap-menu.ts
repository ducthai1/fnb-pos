import type { PosBootstrapWire } from "@fnb/contracts";
import type pg from "pg";
import {
  readPosAvailability,
  readPosCategories,
  readPosPriceLists,
  readPosStations,
} from "../../catalog/pos-menu-snapshots";
import { readPosProducts } from "../../catalog/pos-product-snapshots";

export interface BootstrapPlace {
  brandId: string;
  branchId: string;
}

/**
 * The brand's whole menu as a till of `branchId` sells it, every copy stamped with
 * `version`: the shared catalog of the brand, the stations and sold-out state of the
 * branch, and the price list items that can apply there.
 */
export async function readBootstrapMenu(
  client: pg.PoolClient,
  place: BootstrapPlace,
  now: Date,
  version: number,
): Promise<PosBootstrapWire["menu"]> {
  const stamp = <T extends object>(copies: T[]) => copies.map((copy) => ({ ...copy, version }));
  return {
    categories: stamp(await readPosCategories(client, { ownerId: place.brandId })),
    stations: stamp(await readPosStations(client, { ownerId: place.branchId })),
    products: stamp(await readPosProducts(client, { brandId: place.brandId })),
    priceLists: stamp(await readPosPriceLists(client, place.branchId, { ownerId: place.brandId })),
    availability: stamp(await readPosAvailability(client, place.branchId, now)),
  };
}
