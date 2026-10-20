import type { PosProduct } from "@fnb/contracts";
import { formatVnd } from "@fnb/domain";
import { tilePrice } from "../../features/menu/menu-prices";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";
import { categoryTones, productMark } from "./product-mark";

/**
 * The product being set up, as its tile shows it: the coloured mark, its category and the
 * price it starts from. The name is the screen's title, so it is not written again here.
 */
export function PickerProductHead({
  menu,
  product,
  now,
}: {
  menu: TillMenu;
  product: PosProduct;
  now: number;
}) {
  const category = menu.categories.find((each) => each.id === product.categoryId);
  const tone = category === undefined ? 0 : (categoryTones(menu.categories).get(category.id) ?? 0);
  const price = tilePrice(menu, product, now);
  return (
    <div className="pos-picker-head" data-tone={tone}>
      <span
        className="pos-product__thumb pos-picker-head__mark"
        data-initial={productMark(product.name)}
        aria-hidden
      />
      <p className="pos-picker-head__facts pos-wrap">
        {category === undefined ? null : <span>{category.name}</span>}
        <strong>{price === null ? vi.sale.noPrice : formatVnd(price)}</strong>
      </p>
    </div>
  );
}
