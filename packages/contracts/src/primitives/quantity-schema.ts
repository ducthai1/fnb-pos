import { type Quantity, quantity, quantityToDecimalString } from "@fnb/domain";
import { z } from "zod";
import { viaDomainRule } from "./domain-rule-transform";

/*
 * A stored quantity is numeric(12,3): at most 13 characters with its sign and point. The
 * cap is generous on purpose; it only keeps a hostile body from handing BigInt a
 * megabyte of digits.
 */
const MAX_QUANTITY_LENGTH = 32;

/**
 * A quantity on the wire: a decimal string such as "1.5" or "0.125", parsed by the domain
 * so the decimal rules (at most 3 places, no rounding) live in one place. A JSON number is
 * refused: a float computed on the client (0.1 + 0.2 = 0.30000000000000004) has no exact
 * decimal, while a string carries exactly the digits that were entered. Padding is refused
 * because the domain trims, and " 1.5" is no spelling our own encoder ever sends.
 */
export const quantitySchema = z
  .string()
  .max(MAX_QUANTITY_LENGTH)
  .refine((text) => text === text.trim(), { message: "quantity must not be padded" })
  .transform(viaDomainRule((text: string): Quantity => quantity(text)));

/** The canonical decimal string for a quantity: 1500n → "1.5", 2000n → "2". */
export function quantityToWire(value: Quantity): string {
  return quantityToDecimalString(value);
}
