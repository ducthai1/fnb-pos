import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";

const textSchema = z.string().min(1).max(200);

/** A template as the backoffice lists it for the person choosing. */
export const shopTemplateSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: textSchema,
    description: z.string().min(1).max(400),
    categories: z.array(textSchema).max(50),
    stations: z.array(textSchema).max(50),
    flags: z.record(z.string().min(1).max(60), z.boolean()),
  })
  .strict();

export const shopTemplateListSchema = z.object({ templates: z.array(shopTemplateSchema) }).strict();

const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_category"), name: textSchema }).strict(),
  z.object({ kind: z.literal("add_station"), name: textSchema }).strict(),
  z.object({ kind: z.literal("set_flag"), flag: z.string().min(1).max(60), value: z.boolean() }).strict(),
]);

const keptSchema = z
  .object({
    flag: z.string().min(1).max(60),
    wanted: z.boolean(),
    current: z.boolean(),
    reason: z.enum(["chosen_by_shop", "breaks_a_rule", "locked"]),
  })
  .strict();

/** What a template adds to a branch (to preview) or added (after applying), and what it left. */
export const shopTemplatePlanSchema = z
  .object({
    templateId: z.string().min(1).max(40),
    branchId: uuidSchema,
    changes: z.array(changeSchema),
    kept: z.array(keptSchema),
  })
  .strict();

export const shopTemplateParamsSchema = z.object({ templateId: z.string().min(1).max(40) }).strict();
export const shopTemplatePlanQuerySchema = z.object({ branchId: uuidSchema }).strict();
export const shopTemplateApplyBodySchema = z.object({ branchId: uuidSchema }).strict();

export type ShopTemplateWire = z.infer<typeof shopTemplateSchema>;
export type ShopTemplatePlanWire = z.infer<typeof shopTemplatePlanSchema>;
