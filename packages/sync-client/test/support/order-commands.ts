import { newId } from "@fnb/db";
import { DOMAIN_VERSION } from "@fnb/domain";
import type { EntityView, LocalCommand } from "../../src";

export const BUSINESS_DATE = "2026-10-20";
/** 10:00 in Vietnam: no time-limited price applies. */
export const RECORDED_AT = "2026-10-20T03:00:00.000Z";

export interface LineSnapshot {
  id: string;
  parentLineId: string | null;
  lineType: string;
  productId: string | null;
  variantId: string | null;
  modifierOptionId: string | null;
  nameSnapshot: string;
  unitPrice: number;
  quantity: string;
  taxRate: number;
  note: string | null;
  priceSource: string;
  reversesLineId: string | null;
}

/** An order the way the server sends it and the till shows it (the fields scenarios read). */
export interface OrderView {
  id: string;
  deviceOrderNo: number;
  status: string;
  serviceType: string;
  channelKey: string | null;
  tableId?: string | null;
  version: number;
  chargeProfile: { pricesIncludeTax: boolean; serviceCharge: unknown };
  lines: LineSnapshot[];
  payments: { method: string; amount: number }[];
}

export const orderOf = (view: EntityView | null): OrderView | null =>
  view === null ? null : (view.snapshot as unknown as OrderView);

/** One item the cashier picked, at the price the till's own copy of the menu shows. */
export interface PickedItem {
  lineId: string;
  productId: string;
  variantId: string | null;
  modifiers: { groupId: string; optionId: string; quantity: number; shownPrice: number }[];
  quantity: string;
  shownUnitPrice: number;
  /** What the cashier typed for the kitchen; free text, so any characters. */
  note?: string | null;
}

export const pick = (
  productId: string,
  shownUnitPrice: number,
  overrides: Partial<PickedItem> = {},
): PickedItem => ({
  lineId: newId(),
  productId,
  variantId: null,
  modifiers: [],
  quantity: "1",
  shownUnitPrice,
  ...overrides,
});

/** The items of an order the till shows, to save it again with one more. No modifiers. */
export const itemsOf = (order: OrderView): PickedItem[] =>
  order.lines
    .filter((line) => line.lineType === "item")
    .map((line) =>
      pick(line.productId ?? "", line.unitPrice, {
        lineId: line.id,
        variantId: line.variantId,
        quantity: line.quantity,
      }),
    );

function linesShown(items: readonly PickedItem[]): LineSnapshot[] {
  const line = (fields: Partial<LineSnapshot>): LineSnapshot => ({
    id: newId(),
    parentLineId: null,
    lineType: "item",
    productId: null,
    variantId: null,
    modifierOptionId: null,
    nameSnapshot: "",
    unitPrice: 0,
    quantity: "1",
    taxRate: 800,
    note: null,
    priceSource: "base",
    reversesLineId: null,
    ...fields,
  });
  return items.flatMap((item) => [
    line({
      id: item.lineId,
      productId: item.productId,
      variantId: item.variantId,
      unitPrice: item.shownUnitPrice,
      quantity: item.quantity,
      note: item.note ?? null,
    }),
    ...item.modifiers.map((m) =>
      line({
        parentLineId: item.lineId,
        lineType: "modifier",
        modifierOptionId: m.optionId,
        unitPrice: m.shownPrice,
        quantity: String(m.quantity),
      }),
    ),
  ]);
}

export const envelope = (type: string, payload: Record<string, unknown>) => ({
  commandId: newId(),
  type,
  payload,
  businessDate: BUSINESS_DATE,
  domainVersion: DOMAIN_VERSION,
  createdAt: RECORDED_AT,
});

/** order.save_draft: the whole draft as picked, shown at once at the till's own prices. */
export function saveDraft(
  order: {
    id: string;
    deviceOrderNo: number;
    base: OrderView | null;
    /** Seated at a table, or a counter order (the default); a table implies dine-in. */
    tableId?: string;
    /** The version the draft was edited from; the server refuses it when the order moved on. */
    expectedVersion?: number;
  },
  items: readonly PickedItem[],
  overrides: Partial<LocalCommand> = {},
): LocalCommand {
  const serviceType = order.tableId === undefined ? "takeaway" : "dine_in";
  const payload = {
    orderId: order.id,
    deviceOrderNo: order.deviceOrderNo,
    serviceType,
    channelKey: null,
    ...(order.tableId === undefined ? {} : { tableId: order.tableId }),
    ...(order.expectedVersion === undefined ? {} : { expectedVersion: order.expectedVersion }),
    lines: items.map(({ lineId, productId, variantId, modifiers, quantity, note }) => ({
      lineId,
      productId,
      variantId,
      quantity,
      note: note ?? null,
      modifiers: modifiers.map(({ groupId, optionId, quantity: count }) => ({
        groupId,
        optionId,
        quantity: count,
      })),
    })),
  };
  const shown: OrderView = {
    id: order.id,
    deviceOrderNo: order.deviceOrderNo,
    status: "draft",
    serviceType,
    channelKey: null,
    ...(order.tableId === undefined ? {} : { tableId: order.tableId }),
    chargeProfile: order.base?.chargeProfile ?? { pricesIncludeTax: true, serviceCharge: null },
    payments: [],
    version: (order.base?.version ?? 0) + 1,
    lines: linesShown(items),
  };
  return {
    ...envelope("order.save_draft", payload),
    target: { entity: "order", entityId: order.id, optimistic: { ...shown } },
    ...overrides,
  };
}

/** order.pay in cash for what the till asks the customer for; shown paid at once. */
export function pay(order: OrderView, amountDue: number, overrides: Partial<LocalCommand> = {}) {
  const payments = [{ method: "cash", amount: amountDue }];
  const payload = { orderId: order.id, payments, expectedAmountDue: amountDue };
  const shown = { ...order, status: "paid", version: order.version + 1, payments };
  return {
    ...envelope("order.pay", payload),
    target: { entity: "order", entityId: order.id, optimistic: { ...shown } },
    ...overrides,
  } satisfies LocalCommand;
}
