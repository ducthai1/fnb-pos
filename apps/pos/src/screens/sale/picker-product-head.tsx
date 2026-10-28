import type { PosProduct } from "@fnb/contracts";
import { tilePriceOf } from "../../features/menu/menu-prices";
import type { TillMenu } from "../../features/menu/till-menu";
import { categoryTones } from "./product-mark";
import { ProductMark } from "./product-photo";
import { tilePriceText } from "./tile-price-text";

/**
 * The product being set up, as its tile shows it: its photo or mark, its category and the
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
  const price = tilePriceOf(menu, product, now);
  return (
    <div className="pos-picker-head" data-tone={tone}>
      <ProductMark
        className="pos-product__thumb pos-picker-head__mark"
        name={product.name}
        imageUrl={product.imageUrl}
      />
      <p className="pos-picker-head__facts pos-wrap">
        {category === undefined ? null : <span>{category.name}</span>}
        <strong>{tilePriceText(price)}</strong>
      </p>
    </div>
  );
}
