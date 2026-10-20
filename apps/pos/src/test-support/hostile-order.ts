import type { CounterOrder } from "../features/order/counter-order";
import { HOSTILE_MENU_NAMES, HOSTILE_PRODUCT } from "./hostile-menu";
import { MENU, tid } from "./till-fixtures";

const toppingGroup = HOSTILE_PRODUCT.modifierGroups.at(-1);

/**
 * A counter order a busy shop could really ring up: 999 cups of the 80-character drink with
 * 30 toppings and a note over three lines, two shots in a coffee, a free 0đ item.
 */
export const HOSTILE_ORDER: CounterOrder = {
  orderId: tid(0x600),
  deviceOrderNo: 123_456,
  serviceType: "dine_in",
  tableTag: "SânThượngBàn20",
  table: null,
  lines: [
    {
      lineId: tid(0x601),
      productId: HOSTILE_PRODUCT.id,
      variantId: MENU.sizeL,
      modifiers: [
        { groupId: MENU.sugar, optionId: MENU.sugarHalf, quantity: 1 },
        ...(toppingGroup?.options ?? []).map((option) => ({
          groupId: toppingGroup?.id ?? "",
          optionId: option.id,
          quantity: 1,
        })),
      ],
      quantity: 999,
      note: HOSTILE_MENU_NAMES.note,
    },
    {
      lineId: tid(0x602),
      productId: MENU.coffee,
      variantId: null,
      modifiers: [{ groupId: MENU.extras, optionId: MENU.extraShot, quantity: 2 }],
      quantity: 1,
      note: null,
    },
    {
      lineId: tid(0x603),
      productId: tid(0x405),
      variantId: null,
      modifiers: [],
      quantity: 3,
      note: null,
    },
  ],
};
