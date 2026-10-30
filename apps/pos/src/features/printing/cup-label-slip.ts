import {
  QUANTITY_SCALE,
  type Quantity,
  findProductVariant,
  quantityToDecimalString,
} from "@fnb/domain";
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
import { type SlipOrder, childrenOf, itemsOf, slipHead } from "./sale-order";

/**
 * The cup a line makes, if its product prints one: an item, or a drink picked inside a combo
 * (one cup per combo it is in, labelled with the combo's note).
 */
function cupOf(
  menu: TillMenu,
  lines: PaidSale["priced"]["lines"],
  line: PaidSale["priced"]["lines"][number],
  of: { readonly quantity: CupItem["quantity"]; readonly note: string | null },
): CupItem[] {
  const product = line.productId === null ? undefined : menu.productsById.get(line.productId);
  if (product === undefined || !product.printCupLabel || product.kind === "combo") return [];
  const variant = findProductVariant(product, line.variantId);
  const toppings = childrenOf(lines, line.id)
    .filter((child) => child.lineType === "modifier")
    .map((child) =>
      child.quantity === QUANTITY_SCALE
        ? child.nameSnapshot
        : `${child.nameSnapshot} x${quantityToDecimalString(child.quantity)}`,
    );
  return [
    {
      name: product.name,
      quantity: of.quantity,
      size: variant?.name ?? null,
      sugar: null,
      ice: null,
      toppings,
      note: of.note,
    },
  ];
}

/**
 * One sticker per cup of every product set to print one, a drink inside a combo included.
 * Options print as the list under the drink: the menu does not say which group is sugar or ice.
 * Only when the till's cup-label switch is on. `handedOver` limits it to the units a bar
 * ticket just took (a table's round), by item line; without it, every unit of the order.
 */
export function cupLabelSlip(
  menu: TillMenu,
  sale: SlipOrder,
  at: number,
  handedOver?: ReadonlyMap<string, Quantity>,
): PrintJob | null {
  if (menu.config.flags.cup_labels !== true) return null;
  const lines = sale.priced.lines;
  const items: CupItem[] = itemsOf(lines).flatMap((item) => {
    const units = handedOver === undefined ? item.quantity : handedOver.get(item.id);
    if (units === undefined) return [];
    const made = { quantity: units, note: item.note };
    return [
      ...cupOf(menu, lines, item, made),
      ...childrenOf(lines, item.id)
        .filter((child) => child.lineType === "combo_component")
        .flatMap((pick) => cupOf(menu, lines, pick, made)),
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
