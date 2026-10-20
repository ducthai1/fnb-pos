import { QUANTITY_SCALE, findProductVariant, quantityToDecimalString } from "@fnb/domain";
import {
  type CupItem,
  PRINT_LABELS_VI,
  buildCupLabels,
  renderLabelPreview,
  renderTsplChunks,
} from "@fnb/printing";
import { newId } from "../ids/new-id";
import type { TillMenu } from "../menu/till-menu";
import type { PaidSale } from "./paid-sale";
import type { PrintJob } from "./printer-port";
import { CUP_LABEL_PRINTER, PRINTER_KEYS } from "./printer-profiles";
import { childrenOf, itemsOf, slipHead } from "./sale-order";

/**
 * One sticker per cup of every product set to print one. Options print as the list under
 * the drink: the menu does not say which of its groups is sugar or ice.
 */
export function cupLabelSlip(menu: TillMenu, sale: PaidSale, at: number): PrintJob | null {
  const items: CupItem[] = itemsOf(sale.priced.lines).flatMap((item) => {
    const product = item.productId === null ? undefined : menu.productsById.get(item.productId);
    if (product === undefined || !product.printCupLabel) return [];
    const variant = findProductVariant(product, item.variantId);
    const toppings = childrenOf(sale.priced.lines, item.id).map((child) =>
      child.quantity === QUANTITY_SCALE
        ? child.nameSnapshot
        : `${child.nameSnapshot} x${quantityToDecimalString(child.quantity)}`,
    );
    return [
      {
        name: product.name,
        quantity: item.quantity,
        size: variant?.name ?? null,
        sugar: null,
        ice: null,
        toppings,
        note: item.note,
      },
    ];
  });
  if (items.length === 0) return null;
  const head = slipHead(menu, sale, at);
  const labels = buildCupLabels({ callNumber: head.callNumber, printedAt: head.printedAt, items });
  return {
    jobId: newId(),
    kind: "cup_label",
    printerKey: PRINTER_KEYS.cupLabel,
    preview: renderLabelPreview(labels, CUP_LABEL_PRINTER, PRINT_LABELS_VI.moreLines),
    chunks: renderTsplChunks(labels, CUP_LABEL_PRINTER, PRINT_LABELS_VI.moreLines),
  };
}
