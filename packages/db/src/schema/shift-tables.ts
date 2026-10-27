import { bigint, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

const money = (name: string) => bigint(name, { mode: "bigint" });

/** Cash in or out of a shift's drawer outside a sale; amount is a magnitude. */
export const cashMove = pgTable("cash_move", {
  ...tenantRowColumns(),
  shiftId: uuid("shift_id").notNull(),
  kind: text("kind").notNull(),
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  staffId: uuid("staff_id").notNull(),
  approvalId: uuid("approval_id"),
  /** The QR whose money this cash handed back to the customer; see 0033. */
  paymentIntentId: uuid("payment_intent_id"),
});

/** The notes of one denomination counted at a shift's opening or closing. */
export const shiftCount = pgTable("shift_count", {
  ...tenantRowColumns(),
  shiftId: uuid("shift_id").notNull(),
  stage: text("stage").notNull(),
  denomination: money("denomination").notNull(),
  pieces: integer("pieces").notNull(),
});

export const shiftTables = { cashMove, shiftCount };
