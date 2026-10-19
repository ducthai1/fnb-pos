import { z } from "zod";
import { wholeDongSchema } from "../../primitives/money-schema";

/**
 * A key the shop configures ("cash", "card", "momo"), as the payment table stores it, so a
 * method the database would refuse is refused here with the command's own code instead.
 */
export const paymentMethodSchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);

/**
 * Why units were voided, a draft cancelled or a sale refunded: a key from the shop's list
 * ("customer_changed_mind", "wrong_item"), never free text, so reports can group by it.
 */
export const reasonCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

/** Money a till took for an order: whole đồng, never below zero. */
export const tenderedAmountSchema = wholeDongSchema.nonnegative();
