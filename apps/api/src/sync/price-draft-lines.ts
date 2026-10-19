import { newId } from "@fnb/db";
import {
  type OrderLine,
  findProductVariant,
  quantity,
  resolveUnitPrice,
  validateModifierSelection,
} from "@fnb/domain";
import type pg from "pg";
import {
  type BranchPricing,
  type SellableProduct,
  loadBrandPriceList,
  loadSellableProducts,
} from "./sellable-catalog";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";
import type { SaveDraftPayload } from "./sync-request-schemas";

type LineIntent = SaveDraftPayload["lines"][number];

/**
 * The draft's lines priced by the server from its own catalog and price lists, as of the
 * moment the till recorded the command (a happy-hour price stays the happy-hour price when
 * the till syncs later). Each item is followed by its modifier lines. A modifier line keeps
 * the id it had under the same item, so saving a draft again does not renumber its options.
 */
export async function priceDraftLines(
  client: pg.PoolClient,
  branch: BranchPricing,
  payload: SaveDraftPayload,
  at: number,
  previousLines: readonly OrderLine[],
): Promise<OrderLine[]> {
  const products = await loadSellableProducts(
    client,
    branch.brandId,
    payload.lines.map((line) => line.productId),
  );
  const priceList = await loadBrandPriceList(client, branch.brandId);
  const previousOptionLineIds = new Map(
    previousLines
      .filter((line) => line.lineType === "modifier")
      .map((line) => [`${line.parentLineId}:${line.modifierOptionId}`, line.id]),
  );
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
    });
    return [
      itemLine(intent, sellable, unitPrice.unitPrice, unitPrice.source),
      ...modifierLines(intent, sellable, previousOptionLineIds),
    ];
  });
}

function itemLine(
  intent: LineIntent,
  { product, taxRate }: SellableProduct,
  unitPrice: OrderLine["unitPrice"],
  priceSource: OrderLine["priceSource"],
): OrderLine {
  // A combo is priced with its slot choices, which this command does not carry yet;
  // pricing it without them would charge the combo's base price for nothing.
  if (product.kind === "combo") throw new CommandRejection(SYNC_ERROR_CODES.comboNotSupported);
  const variant = findProductVariant(product, intent.variantId);
  return {
    id: intent.lineId,
    parentLineId: null,
    lineType: "item",
    productId: product.id,
    variantId: intent.variantId,
    modifierOptionId: null,
    nameSnapshot: variant === null ? product.name : `${product.name} (${variant.name})`,
    unitPrice,
    quantity: quantity(intent.quantity),
    taxRate,
    note: intent.note,
    priceSource,
    reversesLineId: null,
  };
}

function modifierLines(
  intent: LineIntent,
  { product, taxRate }: SellableProduct,
  previousOptionLineIds: ReadonlyMap<string, string>,
): OrderLine[] {
  const options = new Map(
    product.modifierGroups.flatMap((group) => group.options.map((option) => [option.id, option])),
  );
  return validateModifierSelection(product, intent.variantId, intent.modifiers).map(
    (selection) => ({
      id: previousOptionLineIds.get(`${intent.lineId}:${selection.optionId}`) ?? newId(),
      parentLineId: intent.lineId,
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
    }),
  );
}
