import { z } from "zod";
import { EINVOICE_REGIME_VERSIONS, einvoiceRegimeRules } from "./einvoice-regimes";

/**
 * A Vietnamese tax code: ten digits, a branch unit's thirteen (ten, a dash, three), or the
 * twelve-digit citizen id individuals now use as their tax code.
 */
export const taxCodeSchema = z.string().regex(/^(\d{10}(-\d{3})?|\d{12})$/);

const textField = (max: number) =>
  z
    .string()
    .max(max)
    .refine((text) => text.trim() !== "", { message: "blank" });

/** A provider key as the server registers its adapters ("vnpt", "viettel", "misa", "fake"). */
export const einvoiceProviderKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);

/**
 * The `einvoice_profile` setting of a branch: whether its sales are invoiced, as whom, and
 * through which provider under which regime. Every sale paid while it is enabled gets one
 * invoice, whatever the shop's turnover: food service sold to consumers has to invoice from
 * the cash register regardless of size (secondary source, see einvoice-regimes.ts).
 */
export const einvoiceProfileSchema = z
  .object({
    enabled: z.boolean(),
    sellerTaxCode: taxCodeSchema,
    sellerName: textField(200),
    sellerAddress: textField(300),
    templateSymbol: z.string().max(16),
    provider: einvoiceProviderKeySchema,
    regimeVersion: z.string().max(40),
    /** Defaults to the cautious reading: a refund gets no invoice of its own. */
    refundInvoicing: z.enum(["none", "adjustment"]).default("none"),
  })
  .strict()
  .superRefine((profile, context) => {
    const rules = einvoiceRegimeRules(profile.regimeVersion);
    if (rules === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["regimeVersion"],
        message: `unknown regime; known: ${EINVOICE_REGIME_VERSIONS.join(", ")}`,
      });
      return;
    }
    if (!rules.templateSymbol.test(profile.templateSymbol)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["templateSymbol"],
        message: "not a template symbol this regime allows",
      });
    }
    if (!rules.refundInvoicing.includes(profile.refundInvoicing)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refundInvoicing"],
        message: "this regime does not allow that refund treatment",
      });
    }
  });

export type EInvoiceProfile = z.output<typeof einvoiceProfileSchema>;

/** The setting as resolved for a branch: null until the branch (or its brand) sets one. */
export const einvoiceProfileSettingSchema = einvoiceProfileSchema.nullable();
