import { formatVnd } from "@fnb/domain";
import type { TilePrice } from "../../features/menu/menu-prices";
import { vi } from "../../messages/vi";

/** "35.000 ₫", "200.000 ₫/kg", "Nhập giá", or "Chưa có giá" for a product with none. */
export function tilePriceText(price: TilePrice | null): string {
  if (price === null) return vi.sale.noPrice;
  if (price.kind === "typed") return vi.sale.typedPrice;
  const amount = formatVnd(price.amount);
  return price.per === null ? amount : vi.sale.pricePer(amount, vi.sale.units[price.per]);
}
