import { type Vnd, quantity, vnd } from "./domain";
import type { NewLineInput } from "../sync-client/pos-order-actions";
import type { SeededRandom } from "./seeded-random";

// Prices and names a café till actually sees, including a long Vietnamese name with
// combining marks and a weighed item with a fractional quantity.
const MENU: readonly { itemId: string; name: string; price: Vnd }[] = [
  { itemId: "cf-sua-da", name: "Cà phê sữa đá", price: vnd(29_000) },
  { itemId: "bac-xiu", name: "Bạc xỉu", price: vnd(32_000) },
  { itemId: "tra-dao", name: "Trà đào cam sả thêm topping trân châu trắng 🍑", price: vnd(45_000) },
  { itemId: "banh-mi", name: "Bánh mì thịt nướng", price: vnd(25_000) },
  { itemId: "hat-dieu", name: "Hạt điều rang muối (cân)", price: vnd(380_000) },
  { itemId: "nuoc-suoi", name: "Nước suối", price: vnd(0) },
];

const QUANTITIES = ["1", "2", "3", "0.25", "0.375"] as const;

export function sampleLines(random: SeededRandom, count: number): NewLineInput[] {
  return Array.from({ length: count }, () => {
    const item = random.pick(MENU);
    return {
      itemId: item.itemId,
      name: item.name,
      qty: quantity(random.pick(QUANTITIES)),
      unitPriceVnd: item.price,
    };
  });
}
