import { z } from "zod";
import { channelKeySchema } from "../../catalog/catalog-schema-parts";
import { tableTagSchema } from "../../floor/table-status-schema";
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

/**
 * order.save_draft: the till's whole draft, opened or saved again. A dine-in order either
 * sits at a table (tableId: it holds the table until paid or cancelled) or is a counter
 * order with the table number it is brought to (tableTag: it holds nothing); never both.
 */
export const saveDraftPayloadSchema = z
  .object({
    orderId: uuidSchema,
    /** The till's own running number for the order, printed before it ever syncs. */
    deviceOrderNo: z.number().int().positive().safe(),
    serviceType: z.enum(["dine_in", "takeaway", "delivery_self", "delivery_platform"]),
    channelKey: channelKeySchema.nullable(),
    /** Fixed when the draft is opened; moving it is table.transfer, which checks the target. */
    tableId: uuidSchema.nullable().default(null),
    tableTag: tableTagSchema.nullable().default(null),
    lines: z.array(lineIntentSchema).max(200),
    /** A manager's approval for open prices the staff member may not type alone. */
    approvalId: uuidSchema.optional(),
  })
  .superRefine((draft, context) => {
    // Only reads fields already checked above as present: no parsing of possibly bad input.
    if (draft.tableId !== null && draft.tableTag !== null) {
      context.addIssue({ code: "custom", path: ["tableTag"], message: "table and tag" });
    }
    if ((draft.tableId !== null || draft.tableTag !== null) && draft.serviceType !== "dine_in") {
      context.addIssue({ code: "custom", path: ["serviceType"], message: "table not dine-in" });
    }
  });

export type SaveDraftPayload = z.infer<typeof saveDraftPayloadSchema>;
export type SaveDraftLineIntent = SaveDraftPayload["lines"][number];
