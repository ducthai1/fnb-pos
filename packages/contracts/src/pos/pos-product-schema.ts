import type { ModifierGroupVariantRule } from "@fnb/domain";
import { z } from "zod";
import { countSchema, idSchema, nameSchema } from "../catalog/catalog-schema-parts";
import { productImageUrlSchema } from "../catalog/product-image-schemas";
import { moneySchema } from "../primitives/money-schema";
import { rateSchema } from "../primitives/rate-schema";
import { feedVersionSchema } from "./pos-feed-version-schema";

/*
 * A product as a till sells it. Amounts arrive as whole đồng and leave the parse as the
 * domain's Vnd, so the parsed object is the domain's Product (plus what the till needs to
 * route and label it) and goes straight into pricing without another mapping layer.
 */

// The domain keeps "unset" as an absent key, not as undefined: exactOptionalPropertyTypes
// would otherwise refuse the parse as a ModifierGroupVariantRule.
const variantRuleSchema = z
  .object({
    minSelect: countSchema.optional(),
    maxSelect: countSchema.optional(),
    hidden: z.boolean().optional(),
  })
  .strict()
  .transform((rule): ModifierGroupVariantRule => ({
    ...(rule.minSelect === undefined ? {} : { minSelect: rule.minSelect }),
    ...(rule.maxSelect === undefined ? {} : { maxSelect: rule.maxSelect }),
    ...(rule.hidden === undefined ? {} : { hidden: rule.hidden }),
  }));

const modifierGroupSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    minSelect: countSchema,
    maxSelect: countSchema,
    allowDuplicates: z.boolean(),
    options: z.array(
      z
        .object({
          id: idSchema,
          name: nameSchema,
          priceDelta: moneySchema,
          maxQuantity: countSchema.nullable(),
        })
        .strict(),
    ),
    variantRules: z.record(idSchema, variantRuleSchema),
  })
  .strict();

const comboSlotSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    minSelect: countSchema,
    maxSelect: countSchema,
    options: z.array(
      z
        .object({ productId: idSchema, variantId: idSchema.nullable(), upcharge: moneySchema })
        .strict(),
    ),
  })
  .strict();

/** One live product of the brand, its shared modifier groups written out in full. */
export const posProductSchema = z
  .object({
    id: idSchema,
    version: feedVersionSchema,
    brandId: idSchema,
    categoryId: idSchema.nullable(),
    /** Where the kitchen ticket goes; a station belongs to one branch. */
    stationId: idSchema.nullable(),
    kind: z.enum(["prepared_item", "prepared_drink", "retail_item", "combo", "service"]),
    name: nameSchema,
    basePrice: moneySchema.nullable(),
    pricingMode: z.enum(["fixed", "open_price", "weighed"]),
    taxRate: rateSchema,
    trackStock: z.boolean(),
    earnsPoints: z.boolean(),
    printCupLabel: z.boolean(),
    /**
     * The photo's address under the API; absent when the product has none. Optional so a
     * copy stored by a till before photos existed still reads, and the server leaves the key
     * out for a product without one.
     */
    imageUrl: productImageUrlSchema.optional(),
    variants: z.array(
      z.object({ id: idSchema, name: nameSchema, price: moneySchema.nullable() }).strict(),
    ),
    modifierGroups: z.array(modifierGroupSchema),
    combo: z
      .object({ slots: z.array(comboSlotSchema) })
      .strict()
      .nullable(),
  })
  .strict();

export type PosProduct = z.output<typeof posProductSchema>;
/** What the server sends for a product. */
export type PosProductWire = z.input<typeof posProductSchema>;
