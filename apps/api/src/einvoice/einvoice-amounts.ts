import { moneySchema, moneyToWire, rateSchema } from "@fnb/contracts";
import { quantityToDecimalString } from "@fnb/domain";
import { z } from "zod";
import type { StoredOrder } from "../sync/stored-order";
import type { EInvoiceAmounts } from "./einvoice-provider";
import { soldOrderOf } from "./sold-lines-of-order";

/** What the invoice of `stored` says: its goods lines and totals, all from the domain. */
export function einvoiceAmountsOf(
  stored: Pick<StoredOrder, "order" | "chargeProfile">,
): EInvoiceAmounts {
  const { totals, lines } = soldOrderOf(stored);
  return {
    lines: lines.map(({ line, quantity, amounts }) => ({
      name: line.nameSnapshot,
      quantity: quantityToDecimalString(quantity),
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      gross: amounts.gross,
      discount: amounts.discountAllocated,
      net: amounts.net,
      tax: amounts.tax,
    })),
    grossTotal: totals.grossTotal,
    discountTotal: totals.discountTotal,
    netTotal: totals.netTotal,
    serviceCharge: totals.serviceCharge,
    serviceChargeTax: totals.serviceChargeTax,
    taxBreakdown: totals.taxBreakdown.map(({ rate, base, tax }) => ({ rate, base, tax })),
    taxTotal: totals.taxTotal,
    amountDue: totals.amountDue,
  };
}

/** The amounts as einvoice.amounts stores them: money as whole-đồng JSON numbers. */
export function einvoiceAmountsToJson(amounts: EInvoiceAmounts) {
  const money = moneyToWire;
  return {
    lines: amounts.lines.map((line) => ({
      ...line,
      unitPrice: money(line.unitPrice),
      gross: money(line.gross),
      discount: money(line.discount),
      net: money(line.net),
      tax: money(line.tax),
    })),
    grossTotal: money(amounts.grossTotal),
    discountTotal: money(amounts.discountTotal),
    netTotal: money(amounts.netTotal),
    serviceCharge: money(amounts.serviceCharge),
    serviceChargeTax: money(amounts.serviceChargeTax),
    taxBreakdown: amounts.taxBreakdown.map((group) => ({
      rate: group.rate,
      base: money(group.base),
      tax: money(group.tax),
    })),
    taxTotal: money(amounts.taxTotal),
    amountDue: money(amounts.amountDue),
  };
}

const storedLineSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  unitPrice: moneySchema,
  taxRate: rateSchema,
  gross: moneySchema,
  discount: moneySchema,
  net: moneySchema,
  tax: moneySchema,
});

const storedAmountsSchema = z.object({
  lines: z.array(storedLineSchema),
  grossTotal: moneySchema,
  discountTotal: moneySchema,
  netTotal: moneySchema,
  serviceCharge: moneySchema,
  serviceChargeTax: moneySchema,
  taxBreakdown: z.array(z.object({ rate: rateSchema, base: moneySchema, tax: moneySchema })),
  taxTotal: moneySchema,
  amountDue: moneySchema,
});

/** einvoice.amounts read back; a row that does not parse is corrupt and throws. */
export function einvoiceAmountsFromJson(stored: unknown): EInvoiceAmounts {
  return storedAmountsSchema.parse(stored);
}
