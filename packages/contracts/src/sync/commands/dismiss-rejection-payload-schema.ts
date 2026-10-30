import { z } from "zod";
import { uuidSchema } from "../../primitives/uuid-schema";
import { reasonCodeSchema, reasonNoteSchema } from "./command-payload-parts";

/**
 * Command types whose refusal can hide money or food the kitchen was sent: setting one
 * aside always says in words what became of it, whatever reason key was picked.
 */
export const DISMISSAL_NOTE_REQUIRED_TYPES: ReadonlySet<string> = new Set([
  "order.pay",
  "order.refund",
  "order.mark_sent_to_kitchen",
  "payment.create_intent",
  "payment.cancel_intent",
  "payment.hand_back_excess",
  "shift.cash_move",
  "shift.close",
]);

/**
 * The refused commands about an order whose setting aside also needs a manager when the
 * staff member lacks close_unpaid_table: the money or the food they stood for is given up,
 * which is what closing a table nobody paid for is. Shift commands (cash moves, closing) name
 * a shift, not an order, so they keep to the staff member's words and the audit trail.
 */
export const DISMISSAL_APPROVAL_TYPES: ReadonlySet<string> = new Set([
  "order.pay",
  "order.refund",
  "order.mark_sent_to_kitchen",
  "payment.create_intent",
  "payment.cancel_intent",
  "payment.hand_back_excess",
]);

/**
 * sync.rejection_dismissed: the till's staff set aside a command the server refused for good,
 * and say why. The refused command stays in the till's journal; this one is the trace the
 * server keeps of who gave it up and for what reason.
 */
export const dismissRejectionPayloadSchema = z.object({
  /** The command the server refused, as the till sent it. */
  rejectedCommandId: uuidSchema,
  rejectedType: z.string().min(1).max(64),
  /** The code the server refused it with. */
  rejectedCode: z.string().min(1).max(100),
  /** The order the refused command was about, when it named one. */
  orderId: uuidSchema.optional(),
  reasonCode: reasonCodeSchema,
  /** What became of it, in the staff member's words; needed for "other" and for money or kitchen commands. */
  reasonNote: reasonNoteSchema.optional(),
  /** The manager's on-the-spot approval, for a command of DISMISSAL_APPROVAL_TYPES. */
  approvalId: uuidSchema.optional(),
});

export type DismissRejectionPayload = z.infer<typeof dismissRejectionPayloadSchema>;
