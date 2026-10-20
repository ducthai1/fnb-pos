import { z } from "zod";
import { businessDateSchema } from "../primitives/business-date-schema";
import { wholeDongSchema as money } from "../primitives/money-schema";
import { uuidSchema } from "../primitives/uuid-schema";

/** GET /reports/daily-sales: one branch, one business day. */
export const dailySalesQuerySchema = z
  .object({ branchId: uuidSchema, businessDate: businessDateSchema })
  .strict();

const count = z.number().int().nonnegative();
const taxGroup = z.object({ rate: z.number().int(), base: money, tax: money }).strict();
const id = uuidSchema.nullable();

/**
 * The day's sales of a branch, by fixed definitions (the same on every report and every
 * day, so two days compare):
 *
 * - gross: goods at their prices before any discount, as priced (VAT inside when the
 *   branch's prices include it); a voided unit was never sold and is not in it.
 * - discount: every discount, positive. net = gross − discount.
 * - serviceCharge: the service charges added to the bills.
 * - tax / taxByRate: VAT by rate as the invoices state it; base is the value without VAT.
 *   netExcludingTax = Σ base: what was sold, discount and VAT out, service charge in.
 * - collected: what customers paid for the day's sales (= Σ base + tax).
 * - refunds: kept apart, as negative amounts, on the day they were given back.
 * - byHour: sales by the branch's local hour at which the till took the money.
 * - items: goods sold, toppings and combo parts on their own rows, voided units left out.
 * - voids: units cancelled from orders of the day, valued at their price before discount.
 * - qrRefunds: money the bank brought for a QR that no sale counts (paid short or over, or
 *   for an order that closed another way), handed back to the customer on the day. It was
 *   never a sale, so it is not revenue, not a refund of a sale, and in no other figure.
 *
 * Every amount is the domain's computeOrderTotals of each order as stored, added up.
 */
export const dailySalesReportSchema = z
  .object({
    branchId: uuidSchema,
    businessDate: businessDateSchema,
    sales: z
      .object({
        orderCount: count,
        gross: money,
        discount: money,
        net: money,
        serviceCharge: money,
        tax: money,
        taxByRate: z.array(taxGroup),
        netExcludingTax: money,
        collected: money,
      })
      .strict(),
    refunds: z
      .object({ orderCount: count, collected: money, tax: money, taxByRate: z.array(taxGroup) })
      .strict(),
    payments: z.array(
      z.object({ method: z.string(), sales: money, refunds: money, net: money }).strict(),
    ),
    byHour: z.array(
      z
        .object({ hour: z.number().int().min(0).max(23), orderCount: count, collected: money })
        .strict(),
    ),
    items: z.array(
      z
        .object({
          lineType: z.string(),
          productId: id,
          variantId: id,
          modifierOptionId: id,
          name: z.string(),
          quantity: z.string(),
          gross: money,
          discount: money,
          net: money,
          tax: money,
        })
        .strict(),
    ),
    voids: z
      .object({
        count,
        value: money,
        items: z.array(
          z
            .object({
              productId: id,
              variantId: id,
              name: z.string(),
              count,
              quantity: z.string(),
              value: money,
            })
            .strict(),
        ),
      })
      .strict(),
    cancelledOrders: count,
    qrRefunds: z
      .object({
        count,
        amount: money,
        byMethod: z.array(z.object({ method: z.string(), count, amount: money }).strict()),
      })
      .strict(),
  })
  .strict();

export type DailySalesReport = z.infer<typeof dailySalesReportSchema>;
