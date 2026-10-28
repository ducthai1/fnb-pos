import type { SaveDraftLineIntent, SaveDraftPayload } from "@fnb/contracts";
import { newId } from "@fnb/db";
import {
  type OrderLine,
  type ValidatedModifierSelection,
  findProductVariant,
  gramsOfWeighedQuantity,
  measureUnitOf,
  quantity,
  resolveComboPicks,
  resolveUnitPrice,
  validateModifierSelection,
  vnd,
} from "@fnb/domain";
import type pg from "pg";
import {
  type BranchPricing,
  type SellableProduct,
  loadBrandPriceList,
  loadSellableProducts,
} from "./sellable-catalog";

type LineIntent = SaveDraftLineIntent;

/**
 * The draft's lines priced by the server from its own catalog and price lists, as of the
 * moment the till recorded the command (a happy-hour price stays the happy-hour price when
 * the till syncs later). Each item is followed by its modifier lines, and a combo by its
 * picks, each pick followed by its own options. A child line keeps the id it had under the
 * same parent, so saving a draft again does not renumber its options or picks.
 */
export async function priceDraftLines(
  client: pg.PoolClient,
  branch: BranchPricing,
  payload: SaveDraftPayload,
  at: number,
  previousLines: readonly OrderLine[],
): Promise<OrderLine[]> {
  // A pick taken off the menu is refused like an item would be: the combo cannot be made.
  const products = await loadSellableProducts(
    client,
    branch.brandId,
    payload.lines.flatMap((line) => [
      line.productId,
      ...(line.comboPicks ?? []).map((pick) => pick.productId),
    ]),
  );
  const priceList = await loadBrandPriceList(client, branch.brandId);
  const previousIds = previousChildLineIds(previousLines);
  return payload.lines.flatMap((intent) => {
    const sellable = products.get(intent.productId);
    if (sellable === undefined) throw new Error("loadSellableProducts returned every product");
    const unitPrice = resolveUnitPrice({
      product: sellable.product,
      variantId: intent.variantId,
      branchId: branch.branchId,
      channelKey: payload.channelKey,
      at,
      utcOffsetMinutes: branch.utcOffsetMinutes,
      priceList,
      // Only an open-price product takes it; the domain refuses it on any other.
      ...(intent.enteredPrice === undefined ? {} : { enteredPrice: vnd(intent.enteredPrice) }),
    });
    const options = validateModifierSelection(sellable.product, intent.variantId, intent.modifiers);
    return [
      itemLine(intent, sellable, unitPrice.unitPrice, unitPrice.source),
      ...modifierLines(intent.lineId, sellable, options, previousIds),
      ...comboLines(intent, sellable, products, previousIds),
    ];
  });
}

/** Keys a child line by what it is under its parent, so a save again finds its old id. */
const optionKey = (parentLineId: string, optionId: string | null) =>
  `${parentLineId}:option:${optionId}`;
const pickKey = (
  parentLineId: string,
  line: Pick<OrderLine, "productId" | "variantId">,
  n: number,
) => `${parentLineId}:pick:${line.productId}:${line.variantId}:${n}`;

/** The ids of the stored options and picks; a pick is counted among equal ones of its combo. */
function previousChildLineIds(previousLines: readonly OrderLine[]): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const line of previousLines) {
    if (line.parentLineId === null) continue;
    if (line.lineType === "modifier")
      ids.set(optionKey(line.parentLineId, line.modifierOptionId), line.id);
    if (line.lineType !== "combo_component") continue;
    const same = pickKey(line.parentLineId, line, 0);
    const n = seen.get(same) ?? 0;
    seen.set(same, n + 1);
    ids.set(pickKey(line.parentLineId, line, n), line.id);
  }
  return ids;
}

function itemLine(
  intent: LineIntent,
  { product, taxRate }: SellableProduct,
  unitPrice: OrderLine["unitPrice"],
  priceSource: OrderLine["priceSource"],
): OrderLine {
  const variant = findProductVariant(product, intent.variantId);
  const units = quantity(intent.quantity);
  // Sold by weight, the quantity is the weight in the product's unit: whole grams, more than
  // nothing, at most what one line may weigh. The amount is then the domain's price × weight.
  const unit = measureUnitOf(product);
  if (unit !== null) gramsOfWeighedQuantity(units, unit);
  return {
    id: intent.lineId,
    parentLineId: null,
    lineType: "item",
    productId: product.id,
    variantId: intent.variantId,
    modifierOptionId: null,
    nameSnapshot: variant === null ? product.name : `${product.name} (${variant.name})`,
    unitPrice,
    quantity: units,
    taxRate,
    note: intent.note,
    priceSource,
    reversesLineId: null,
  };
}

function modifierLines(
  parentLineId: string,
  { product, taxRate }: SellableProduct,
  selections: readonly ValidatedModifierSelection[],
  previousIds: ReadonlyMap<string, string>,
): OrderLine[] {
  const options = new Map(
    product.modifierGroups.flatMap((group) => group.options.map((option) => [option.id, option])),
  );
  return selections.map((selection) => ({
    id: previousIds.get(optionKey(parentLineId, selection.optionId)) ?? newId(),
    parentLineId,
    lineType: "modifier",
    productId: null,
    variantId: null,
    modifierOptionId: selection.optionId,
    nameSnapshot: options.get(selection.optionId)?.name ?? "",
    unitPrice: selection.unitPriceDelta,
    // Per one unit of the item: two double-pearl teas carry 2 × 2 pearls.
    quantity: quantity(BigInt(selection.quantity)),
    // An option is part of the item it is sold with, so it is taxed at the item's rate.
    taxRate,
    note: null,
    priceSource: "base",
    reversesLineId: null,
  }));
}

/**
 * A combo's picks as lines under it, each one unit per combo at the slot's upcharge (0 for
 * the default choice), followed by its own options. The domain checks the picks against the
 * slots and each pick's options against its product; picks on a product that is no combo are
 * refused there too. A pick and its options are part of the combo, so they carry its tax rate.
 */
function comboLines(
  intent: LineIntent,
  combo: SellableProduct,
  products: ReadonlyMap<string, SellableProduct>,
  previousIds: ReadonlyMap<string, string>,
): OrderLine[] {
  const picks = intent.comboPicks ?? [];
  if (combo.product.kind !== "combo" && picks.length === 0) return [];
  const resolved = resolveComboPicks(combo.product, (id) => products.get(id)?.product, picks);
  const seen = new Map<string, number>();
  return resolved.flatMap((pick) => {
    const same = pickKey(
      intent.lineId,
      { productId: pick.product.id, variantId: pick.variantId },
      0,
    );
    const n = seen.get(same) ?? 0;
    seen.set(same, n + 1);
    const key = pickKey(
      intent.lineId,
      { productId: pick.product.id, variantId: pick.variantId },
      n,
    );
    const id = previousIds.get(key) ?? newId();
    const line: OrderLine = {
      id,
      parentLineId: intent.lineId,
      lineType: "combo_component",
      productId: pick.product.id,
      variantId: pick.variantId,
      modifierOptionId: null,
      nameSnapshot: pick.name,
      unitPrice: pick.upcharge,
      quantity: quantity(1n),
      taxRate: combo.taxRate,
      note: null,
      priceSource: "base",
      reversesLineId: null,
    };
    const own = { product: pick.product, taxRate: combo.taxRate };
    return [line, ...modifierLines(id, own, pick.modifiers, previousIds)];
  });
}
