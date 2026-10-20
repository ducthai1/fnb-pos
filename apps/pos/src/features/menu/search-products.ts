import type { PosProduct } from "@fnb/contracts";

/** "Trà Sữa Đào" → "tra sua dao": cashiers type without tone marks, often without đ. */
export function searchKey(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
}

/** The products of one category (null: all), whose name holds what was typed. */
export function productsShown(
  products: readonly PosProduct[],
  categoryId: string | null,
  query: string,
): PosProduct[] {
  const wanted = searchKey(query);
  return products.filter(
    (product) =>
      (categoryId === null || product.categoryId === categoryId) &&
      (wanted === "" || searchKey(product.name).includes(wanted)),
  );
}
