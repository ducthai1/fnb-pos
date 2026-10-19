import { z } from "zod";
import { channelKeySchema } from "../../catalog/catalog-schema-parts";
import { wholeDongSchema } from "../../primitives/money-schema";
import { uuidSchema } from "../../primitives/uuid-schema";

const modifierSelectionSchema = z.object({
  groupId: uuidSchema,
  optionId: uuidSchema,
  quantity: z.number().int().min(1).max(99),
});

/**
 * What the cashier chose, never what it costs: any price the till sends along (it shows
 * one on screen) is stripped here, and the server prices the line from its catalog. The
 * one exception is a product sold at an open price, whose price is whatever the cashier
 * typed; the domain refuses it on any other product, and a negative one, with its codes.
 */
const lineIntentSchema = z.object({
  lineId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  modifiers: z.array(modifierSelectionSchema).max(50),
  quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/),
  note: z.string().max(500).nullable(),
  enteredPrice: wholeDongSchema.optional(),
});

/** order.save_draft: the till's whole draft, opened or saved again. */
export const saveDraftPayloadSchema = z.object({
  orderId: uuidSchema,
  /** The till's own running number for the order, printed before it ever syncs. */
  deviceOrderNo: z.number().int().positive().safe(),
  serviceType: z.enum(["dine_in", "takeaway", "delivery_self", "delivery_platform"]),
  channelKey: channelKeySchema.nullable(),
  lines: z.array(lineIntentSchema).max(200),
  /** A manager's approval for open prices the staff member may not type alone. */
  approvalId: uuidSchema.optional(),
});

export type SaveDraftPayload = z.infer<typeof saveDraftPayloadSchema>;
export type SaveDraftLineIntent = SaveDraftPayload["lines"][number];
