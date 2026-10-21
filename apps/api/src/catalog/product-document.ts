/** A product as the backoffice edits it; money in whole đồng as JSON numbers. */
export interface ProductDocument {
  id: string;
  version: number;
  archivedAt: string | null;
  brandId: string;
  categoryId: string | null;
  kind: string;
  name: string;
  basePrice: number | null;
  pricingMode: string;
  taxRateBp: number;
  stationId: string | null;
  trackStock: boolean;
  earnsPoints: boolean;
  printCupLabel: boolean;
  /** The stored photo's name, and where it is served (relative to the API's base). */
  imageKey: string | null;
  imageUrl: string | null;
  variants: { id: string; name: string; price: number | null }[];
  modifierGroups: ProductDocumentGroup[];
  combo: { slots: ProductDocumentSlot[] } | null;
}

export interface ProductDocumentGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  allowDuplicates: boolean;
  options: { id: string; name: string; priceDelta: number; maxQuantity: number | null }[];
  variantRules: Record<string, { minSelect?: number; maxSelect?: number; hidden?: true }>;
}

export interface ProductDocumentSlot {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { productId: string; variantId: string | null; upcharge: number }[];
}

/** pg returns bigint as text; parsed exactly, then sent as a JSON number. */
export const amountOf = (text: string): number => Number(BigInt(text));
