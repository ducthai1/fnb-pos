import type { ZodType, ZodTypeDef } from "zod";
import { posDeviceConfigSchema } from "./pos-device-config-schema";
import {
  posAvailabilitySchema,
  posCategorySchema,
  posPriceListSchema,
  posStationSchema,
} from "./pos-menu-schemas";
import { posProductSchema } from "./pos-product-schema";

/**
 * The entities of the change feed that carry the menu and the till's settings. Each change
 * holds the whole copy in exactly the shape the bootstrap sends, so a till applies a change
 * by replacing its copy; a null snapshot means the copy is gone (deleted, or taken off the
 * menu). Ids: a product, category, station or price list by its own id, sold-out state by
 * the product's id, settings by the till's device id.
 */
export const POS_FEED_ENTITY = {
  product: "catalog_product",
  category: "catalog_category",
  station: "catalog_station",
  availability: "catalog_availability",
  priceList: "price_list",
  deviceConfig: "device_config",
} as const;

export type PosFeedEntity = (typeof POS_FEED_ENTITY)[keyof typeof POS_FEED_ENTITY];

/** The schema a till parses a non-null snapshot of each entity with. */
export const POS_FEED_SNAPSHOT_SCHEMAS: Readonly<
  Record<PosFeedEntity, ZodType<unknown, ZodTypeDef, unknown>>
> = {
  catalog_product: posProductSchema,
  catalog_category: posCategorySchema,
  catalog_station: posStationSchema,
  catalog_availability: posAvailabilitySchema,
  price_list: posPriceListSchema,
  device_config: posDeviceConfigSchema,
};
