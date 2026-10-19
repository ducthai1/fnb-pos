import { z } from "zod";
import {
  amountSchema,
  channelKeySchema,
  countSchema,
  idSchema,
  instantSchema,
  nameSchema,
  versionSchema,
} from "./catalog-schema-parts";

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("variant"), variantId: idSchema }).strict(),
  z.object({ kind: z.literal("product"), productId: idSchema }).strict(),
  z.object({ kind: z.literal("category"), categoryId: idSchema }).strict(),
  z.object({ kind: z.literal("global") }).strict(),
]);

const effectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed_price"), price: amountSchema }).strict(),
  z
    .object({
      kind: z.literal("percent_off"),
      rateBp: countSchema,
      rounding: z.enum(["down", "up", "half-up", "half-even"]),
    })
    .strict(),
]);

const itemSchema = z
  .object({
    id: idSchema,
    scope: scopeSchema,
    branchId: idSchema.nullable().default(null),
    channelKey: channelKeySchema.nullable().default(null),
    validFrom: instantSchema.nullable().default(null),
    validTo: instantSchema.nullable().default(null),
    daysOfWeek: z.array(countSchema).max(7).nullable().default(null),
    timeWindow: z
      .object({ startMinute: countSchema, endMinute: countSchema })
      .strict()
      .nullable()
      .default(null),
    effect: effectSchema,
    priority: countSchema.default(0),
  })
  .strict();

/** A price list with all its items, saved and read as a whole. */
export const priceListDocumentSchema = z
  .object({
    version: versionSchema,
    brandId: idSchema,
    name: nameSchema,
    items: z.array(itemSchema).max(500),
  })
  .strict();

export type PriceListDocumentInput = z.infer<typeof priceListDocumentSchema>;
