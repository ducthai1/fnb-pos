import { MEASURE_UNITS } from "@fnb/domain";
import { z } from "zod";
import {
  amountSchema,
  countSchema,
  idSchema,
  nameSchema,
  versionSchema,
} from "./catalog-schema-parts";
import { productImageKeySchema } from "./product-image-schemas";

const variantSchema = z
  .object({ id: idSchema, name: nameSchema, price: amountSchema.nullable().default(null) })
  .strict();

const optionSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    priceDelta: amountSchema.default(0),
    maxQuantity: countSchema.nullable().default(null),
  })
  .strict();

const variantRuleSchema = z
  .object({
    minSelect: countSchema.optional(),
    maxSelect: countSchema.optional(),
    hidden: z.boolean().optional(),
  })
  .strict();

const modifierGroupSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    minSelect: countSchema,
    maxSelect: countSchema,
    allowDuplicates: z.boolean().default(false),
    options: z.array(optionSchema).max(100),
    /** Keyed by variant id, as in the domain: one rule per variant by construction. */
    variantRules: z.record(idSchema, variantRuleSchema).default({}),
  })
  .strict();

const comboSchema = z
  .object({
    slots: z
      .array(
        z
          .object({
            id: idSchema,
            name: nameSchema,
            minSelect: countSchema,
            maxSelect: countSchema,
            options: z
              .array(
                z
                  .object({
                    productId: idSchema,
                    variantId: idSchema.nullable().default(null),
                    upcharge: amountSchema.default(0),
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

/** One product with everything that shapes how it is sold, saved and read as a whole. */
export const productDocumentSchema = z
  .object({
    version: versionSchema,
    brandId: idSchema,
    categoryId: idSchema.nullable().default(null),
    kind: z.enum(["prepared_item", "prepared_drink", "retail_item", "combo", "service"]),
    name: nameSchema,
    basePrice: amountSchema.nullable(),
    pricingMode: z.enum(["fixed", "open_price", "weighed"]),
    /**
     * What a weighed product's price is per; the domain requires it on a weighed product
     * and refuses it on any other, so a body that leaves it out saves only unweighed ones.
     */
    measureUnit: z.enum(MEASURE_UNITS).nullable().default(null),
    taxRateBp: countSchema.default(0),
    stationId: idSchema.nullable().default(null),
    trackStock: z.boolean().default(false),
    earnsPoints: z.boolean().default(true),
    printCupLabel: z.boolean().default(false),
    /**
     * The photo, as an upload named it; null takes it off. Left out, the stored one stays:
     * a client that does not know about photos (an older backoffice, the Excel import)
     * saves a product without wiping its photo.
     */
    imageKey: productImageKeySchema.nullable().optional(),
    variants: z.array(variantSchema).max(50).default([]),
    modifierGroups: z.array(modifierGroupSchema).max(30).default([]),
    combo: comboSchema.nullable().default(null),
  })
  .strict();

export type ProductDocumentInput = z.infer<typeof productDocumentSchema>;
