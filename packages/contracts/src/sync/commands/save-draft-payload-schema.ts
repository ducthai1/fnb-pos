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
 * What was put in one place of a combo: a product the slot offers (and its size), with that
 * product's own options. Like the line, it carries no price: the slot's upcharge and the
 * options' prices come from the catalog.
 */
const comboPickSchema = z.object({
  slotId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  modifiers: z.array(modifierSelectionSchema).max(50),
});

/**
 * What the cashier chose, never what it costs: any price the till sends along (it shows
 * one on screen) is stripped here, and the server prices the line from its catalog. The
 * one exception is a product sold at an open price, whose price is whatever the cashier
 * typed; the domain refuses it on any other product, a negative one and one past its cap,
 * with its codes. A product sold by weight carries its weight as the quantity, in the unit
 * its price is per (0.35 for 350 g of a product priced per kg).
 */
const lineIntentSchema = z.object({
  lineId: uuidSchema,
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  modifiers: z.array(modifierSelectionSchema).max(50),
  quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/),
  note: z.string().max(500).nullable(),
  enteredPrice: wholeDongSchema.optional(),
  /**
   * A manager's approval of exactly this typed price on this line of this order, for a
   * staff member who may not type prices alone. Each typed line names its own: one approval
   * covers one line and one price.
   */
  priceApprovalId: uuidSchema.optional(),
  /**
   * A combo's picks, one per place filled (two milk teas in a "2 drinks" slot are two picks).
   * Left out on any other product; the server refuses picks on a product that is no combo.
   */
  comboPicks: z.array(comboPickSchema).max(30).optional(),
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
    /**
     * A manager's approval of a typed price, for a line that names none of its own (see
     * priceApprovalId); it covers one line only, like the line's own would.
     */
    approvalId: uuidSchema.optional(),
    /**
     * The version of the order this draft was edited from (0 for one the till opens now).
     * Sent, the server saves only over that version and refuses the draft when the order
     * moved on (another till added to the table), so nothing the other till added is lost;
     * the till pulls the order and redoes its change. Left out, the draft replaces what
     * the server holds, as tills that do not send it expect.
     */
    expectedVersion: z.number().int().nonnegative().safe().optional(),
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
