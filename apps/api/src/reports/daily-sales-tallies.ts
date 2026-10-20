import { moneyToWire } from "@fnb/contracts";
import {
  type OrderTotals,
  type Quantity,
  type Vnd,
  ZERO_VND,
  addQuantity,
  addVnd,
  quantity,
  quantityToDecimalString,
} from "@fnb/domain";
import type { SoldLine } from "../einvoice/sold-lines-of-order";

/** Running sums of a group of orders' totals; every addition is the domain's addVnd. */
export class TotalsTally {
  orderCount = 0;
  gross: Vnd = ZERO_VND;
  discount: Vnd = ZERO_VND;
  net: Vnd = ZERO_VND;
  serviceCharge: Vnd = ZERO_VND;
  tax: Vnd = ZERO_VND;
  collected: Vnd = ZERO_VND;
  private readonly byRate = new Map<number, { base: Vnd; tax: Vnd }>();

  add(totals: OrderTotals): void {
    this.orderCount += 1;
    this.gross = addVnd(this.gross, totals.grossTotal);
    this.discount = addVnd(this.discount, totals.discountTotal);
    this.net = addVnd(this.net, totals.netTotal);
    this.serviceCharge = addVnd(this.serviceCharge, totals.serviceCharge);
    this.tax = addVnd(this.tax, totals.taxTotal);
    this.collected = addVnd(this.collected, totals.amountDue);
    for (const group of totals.taxBreakdown) {
      const sum = this.byRate.get(group.rate) ?? { base: ZERO_VND, tax: ZERO_VND };
      this.byRate.set(group.rate, {
        base: addVnd(sum.base, group.base),
        tax: addVnd(sum.tax, group.tax),
      });
    }
  }

  /** Σ base over the rates: what was sold without VAT. */
  netExcludingTax(): Vnd {
    return addVnd(...[...this.byRate.values()].map((group) => group.base));
  }

  taxByRate() {
    return [...this.byRate.entries()]
      .sort(([a], [b]) => a - b)
      .map(([rate, group]) => ({
        rate,
        base: moneyToWire(group.base),
        tax: moneyToWire(group.tax),
      }));
  }
}

interface ItemSum {
  line: SoldLine["line"];
  quantity: Quantity;
  gross: Vnd;
  discount: Vnd;
  net: Vnd;
  tax: Vnd;
}

/**
 * Goods sold, one row per product, variant or option (a topping sold on any drink is one
 * row). The name is the one it was first sold under that day.
 */
export class ItemTally {
  private readonly items = new Map<string, ItemSum>();

  add(lines: readonly SoldLine[]): void {
    for (const { line, quantity: sold, amounts } of lines) {
      const key = [line.lineType, line.productId, line.variantId, line.modifierOptionId].join("|");
      const sum = this.items.get(key) ?? {
        line,
        quantity: quantity(0),
        gross: ZERO_VND,
        discount: ZERO_VND,
        net: ZERO_VND,
        tax: ZERO_VND,
      };
      this.items.set(key, {
        line: sum.line,
        quantity: addQuantity(sum.quantity, sold),
        gross: addVnd(sum.gross, amounts.gross),
        discount: addVnd(sum.discount, amounts.discountAllocated),
        net: addVnd(sum.net, amounts.net),
        tax: addVnd(sum.tax, amounts.tax),
      });
    }
  }

  rows() {
    return [...this.items.values()].map((sum) => ({
      lineType: sum.line.lineType,
      productId: sum.line.productId,
      variantId: sum.line.variantId,
      modifierOptionId: sum.line.modifierOptionId,
      name: sum.line.nameSnapshot,
      quantity: quantityToDecimalString(sum.quantity),
      gross: moneyToWire(sum.gross),
      discount: moneyToWire(sum.discount),
      net: moneyToWire(sum.net),
      tax: moneyToWire(sum.tax),
    }));
  }
}

/** Money by payment method, sales and refunds apart. */
export class PaymentTally {
  private readonly methods = new Map<string, { sales: Vnd; refunds: Vnd }>();

  add(method: string, amount: Vnd, refund: boolean): void {
    const sum = this.methods.get(method) ?? { sales: ZERO_VND, refunds: ZERO_VND };
    this.methods.set(method, {
      sales: refund ? sum.sales : addVnd(sum.sales, amount),
      refunds: refund ? addVnd(sum.refunds, amount) : sum.refunds,
    });
  }

  rows() {
    return [...this.methods.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([method, sum]) => ({
        method,
        sales: moneyToWire(sum.sales),
        refunds: moneyToWire(sum.refunds),
        net: moneyToWire(addVnd(sum.sales, sum.refunds)),
      }));
  }
}
