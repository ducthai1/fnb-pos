import type { Vnd } from "../money";

export type ProductKind = "prepared_item" | "prepared_drink" | "retail_item" | "combo" | "service";

/**
 * - `fixed`: the price comes from the catalog and the price list.
 * - `open_price`: the cashier types the price at sale time (e.g. a custom cake).
 * - `weighed`: the catalog price is per unit of measure (e.g. per kg); the line
 *   amount is computed later from the weighed quantity.
 */
export type PricingMode = "fixed" | "open_price" | "weighed";

export interface Product {
  readonly id: string;
  readonly categoryId: string | null;
  readonly kind: ProductKind;
  readonly name: string;
  readonly basePrice: Vnd | null;
  readonly pricingMode: PricingMode;
  /** Empty when the product is sold in a single form; otherwise a variant must be chosen. */
  readonly variants: readonly Variant[];
  readonly modifierGroups: readonly ModifierGroup[];
  /** Present only on products of kind `combo`. */
  readonly combo: ComboDefinition | null;
}

export interface Variant {
  readonly id: string;
  readonly name: string;
  /** null ⇒ the variant sells at the product's basePrice. */
  readonly price: Vnd | null;
}

/** Per-variant override of a modifier group, keyed by variant id (e.g. size L allows more toppings). */
export interface ModifierGroupVariantRule {
  readonly minSelect?: number;
  readonly maxSelect?: number;
  /** The group does not apply to this variant at all (e.g. ice level on a hot drink). */
  readonly hidden?: boolean;
}

/**
 * A set of options the customer picks from, such as "Sugar level" or "Toppings".
 *
 * There is deliberately no separate "required" flag: a group is required exactly
 * when its minSelect ≥ 1. Storing both would allow contradictory configs such as
 * "required with minSelect 0" or "optional with minSelect 2".
 */
export interface ModifierGroup {
  readonly id: string;
  readonly name: string;
  /** Minimum total units chosen across the group's options (quantities add up). */
  readonly minSelect: number;
  /** Maximum total units chosen across the group's options (quantities add up). */
  readonly maxSelect: number;
  /** Whether the same option may be taken more than once (e.g. double pearls). */
  readonly allowDuplicates: boolean;
  readonly options: readonly ModifierOption[];
  readonly variantRules: Readonly<Record<string, ModifierGroupVariantRule>>;
}

export interface ModifierOption {
  readonly id: string;
  readonly name: string;
  /** Added to the item's unit price per unit chosen. Never negative. */
  readonly priceDelta: Vnd;
  /** Cap on how many units of this one option an item may carry; null = only the group cap applies. */
  readonly maxQuantity: number | null;
}

export interface ComboDefinition {
  readonly slots: readonly ComboSlot[];
}

/** One position in a combo, e.g. "Drink" or "Side", with the products allowed in it. */
export interface ComboSlot {
  readonly id: string;
  readonly name: string;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: readonly ComboSlotOption[];
}

export interface ComboSlotOption {
  readonly productId: string;
  /** Matched exactly: null means the product is sold without variants. */
  readonly variantId: string | null;
  /** Extra charged for swapping this product into the slot; 0 for the default choice. */
  readonly upcharge: Vnd;
}
