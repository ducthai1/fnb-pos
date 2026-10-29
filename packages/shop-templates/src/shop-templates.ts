import { BAKERY, BAR, CAFE, MILK_TEA, RESTAURANT } from "./templates/shop-template-data";
import type { ShopTemplate, ShopTemplateId } from "./shop-template-types";

/** Every template, in the order the backoffice offers them. */
export const SHOP_TEMPLATES: readonly ShopTemplate[] = [CAFE, MILK_TEA, RESTAURANT, BAR, BAKERY];

/** The template with this id, or undefined when the text names none. */
export function shopTemplateById(id: string): ShopTemplate | undefined {
  return SHOP_TEMPLATES.find((template) => template.id === (id as ShopTemplateId));
}
