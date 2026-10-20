import { z } from "zod";
import { taxCodeSchema } from "./einvoice-profile-schema";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((text) => text.trim() !== "", { message: "blank" })
    .optional();

/**
 * Who bought, printed on the invoice only when the customer asks for it: a company wanting
 * its tax code on the bill, or a person giving a citizen id or phone. A sale without a
 * buyer is invoiced to "a retail customer", which is the usual case at a counter.
 */
export const einvoiceBuyerSchema = z
  .object({
    name: optionalText(200),
    taxCode: taxCodeSchema.optional(),
    /** Căn cước công dân: twelve digits. */
    citizenId: z
      .string()
      .regex(/^\d{12}$/)
      .optional(),
    /** A Vietnamese number, national (0…) or international (+84…) form, no spaces. */
    phone: z
      .string()
      .regex(/^(0|\+84)\d{9,10}$/)
      .optional(),
    address: optionalText(300),
    email: z.string().email().max(200).optional(),
  })
  .strict()
  .superRefine((buyer, context) => {
    // A buyer is somebody the tax authority can tell apart; a bare address is not.
    if (
      buyer.taxCode === undefined &&
      buyer.citizenId === undefined &&
      buyer.phone === undefined &&
      buyer.name === undefined
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "names nobody" });
    }
    // A tax code is an organization's: its invoice must say which organization it is.
    if (buyer.taxCode !== undefined && buyer.name === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "a tax code needs the organization's name",
      });
    }
  });

export type EInvoiceBuyer = z.output<typeof einvoiceBuyerSchema>;
