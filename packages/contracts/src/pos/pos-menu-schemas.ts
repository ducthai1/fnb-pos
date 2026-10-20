import type { PriceListItem } from "@fnb/domain";
import { z } from "zod";
import {
  channelKeySchema,
  countSchema,
  idSchema,
  instantSchema,
  nameSchema,
} from "../catalog/catalog-schema-parts";
import { priceListScopeSchema } from "../catalog/price-list-document-schema";
import { moneySchema } from "../primitives/money-schema";
import { rateSchema } from "../primitives/rate-schema";
import { feedVersionSchema } from "./pos-feed-version-schema";

// Moments travel as ISO text like everywhere on the API; the domain compares epoch ms.
const epochOrNull = instantSchema
  .nullable()
  .transform((instant) => (instant === null ? null : Date.parse(instant)));

export const posCategorySchema = z
  .object({
    id: idSchema,
    version: feedVersionSchema,
    brandId: idSchema,
    name: nameSchema,
    sortOrder: countSchema,
  })
  .strict();

/** A kitchen or bar station of the till's own branch. */
export const posStationSchema = z
  .object({ id: idSchema, version: feedVersionSchema, branchId: idSchema, name: nameSchema })
  .strict();

const priceListEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed_price"), price: moneySchema }).strict(),
  z
    .object({
      kind: z.literal("percent_off"),
      rate: rateSchema,
      rounding: z.enum(["down", "up", "half-up", "half-even"]),
    })
    .strict(),
]);

const priceListItemSchema = z
  .object({
    id: idSchema,
    scope: priceListScopeSchema,
    branchId: idSchema.nullable(),
    channelKey: channelKeySchema.nullable(),
    validFrom: epochOrNull,
    validTo: epochOrNull,
    daysOfWeek: z.array(countSchema).nullable(),
    timeWindow: z.object({ startMinute: countSchema, endMinute: countSchema }).strict().nullable(),
    effect: priceListEffectSchema,
    priority: countSchema,
  })
  .strict()
  .transform((item): PriceListItem => item);

/**
 * A price list of the brand with the items that can apply at the till's branch: those for
 * every branch and those for this one. Which item wins at a moment is the domain's choice.
 */
export const posPriceListSchema = z
  .object({
    id: idSchema,
    version: feedVersionSchema,
    brandId: idSchema,
    name: nameSchema,
    items: z.array(priceListItemSchema),
  })
  .strict();

/**
 * What is sold out ("86") of one product at the till's branch: an entry without a channel
 * covers every channel; one without an end lasts until someone puts the product back. An
 * empty list means the product is on sale again. The till compares the end with its clock.
 */
export const posAvailabilitySchema = z
  .object({
    productId: idSchema,
    version: feedVersionSchema,
    entries: z.array(
      z.object({ channelKey: channelKeySchema.nullable(), unavailableUntil: epochOrNull }).strict(),
    ),
  })
  .strict();

export type PosCategory = z.output<typeof posCategorySchema>;
export type PosStation = z.output<typeof posStationSchema>;
export type PosPriceList = z.output<typeof posPriceListSchema>;
export type PosAvailability = z.output<typeof posAvailabilitySchema>;
export type PosCategoryWire = z.input<typeof posCategorySchema>;
export type PosStationWire = z.input<typeof posStationSchema>;
export type PosPriceListWire = z.input<typeof posPriceListSchema>;
export type PosAvailabilityWire = z.input<typeof posAvailabilitySchema>;
