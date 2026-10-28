import { v7 as uuidv7 } from "uuid";
import type { MeasureUnit } from "@fnb/domain";
import type { ProductBody, ProductDocument } from "../../../lib/catalog/product-document";
import { amountInputText } from "../../../lib/format/amount-text";

/*
 * The product as the editor holds it: what the person typed, as text, so a half-typed
 * price ("35.") stays on screen until it is fixed instead of snapping to a number. Ids are
 * made here when a size, group or option is added (UUIDv7, as everywhere a row is born).
 */

export interface DraftVariant {
  readonly id: string;
  readonly name: string;
  /** Blank: the variant sells at the product's price. */
  readonly price: string;
}

export interface DraftOption {
  readonly id: string;
  readonly name: string;
  readonly priceDelta: string;
  /** Blank: only the group's limit applies. */
  readonly maxQuantity: string;
}

/** Per variant: blank limits keep the group's own. */
export interface DraftVariantRule {
  readonly hidden: boolean;
  readonly minSelect: string;
  readonly maxSelect: string;
}

export interface DraftGroup {
  readonly id: string;
  readonly name: string;
  readonly minSelect: string;
  readonly maxSelect: string;
  readonly allowDuplicates: boolean;
  readonly options: readonly DraftOption[];
  readonly variantRules: Readonly<Record<string, DraftVariantRule>>;
}

/** A product a combo slot offers. `key` names the row (its product can still change). */
export interface DraftSlotOption {
  readonly key: string;
  /** "" until a product is chosen for the row. */
  readonly productId: string;
  readonly variantId: string | null;
  readonly upcharge: string;
}

export interface DraftSlot {
  readonly id: string;
  readonly name: string;
  readonly minSelect: string;
  readonly maxSelect: string;
  readonly options: readonly DraftSlotOption[];
}

export interface DraftCombo {
  readonly slots: readonly DraftSlot[];
}

/** A photo uploaded for the product: the stored file's name and its address under the API. */
export interface DraftPhoto {
  readonly key: string;
  readonly url: string;
}

export interface ProductDraft {
  readonly id: string;
  /** null until the product is first saved. */
  readonly version: number | null;
  readonly archivedAt: string | null;
  readonly brandId: string;
  readonly categoryId: string | null;
  readonly kind: ProductBody["kind"];
  readonly name: string;
  readonly basePrice: string;
  readonly pricingMode: ProductBody["pricingMode"];
  /**
   * What the price is per if the product is sold by weight. Kept while another mode is
   * chosen, so switching back and forth does not lose it; saved only on a weighed product.
   */
  readonly measureUnit: MeasureUnit;
  /** Percent text, e.g. "8" for 8% VAT. */
  readonly taxRate: string;
  readonly stationId: string | null;
  readonly trackStock: boolean;
  readonly earnsPoints: boolean;
  readonly printCupLabel: boolean;
  readonly photo: DraftPhoto | null;
  readonly variants: readonly DraftVariant[];
  readonly modifierGroups: readonly DraftGroup[];
  /** Present exactly on a combo: its slots and what each offers. */
  readonly combo: DraftCombo | null;
}

export const newId = (): string => uuidv7();

const countText = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

export function emptyDraft(id: string, brandId: string): ProductDraft {
  return {
    id,
    version: null,
    archivedAt: null,
    brandId,
    categoryId: null,
    kind: "prepared_drink",
    name: "",
    basePrice: "",
    pricingMode: "fixed",
    measureUnit: "kg",
    taxRate: "0",
    stationId: null,
    trackStock: false,
    earnsPoints: true,
    printCupLabel: false,
    photo: null,
    variants: [],
    modifierGroups: [],
    combo: null,
  };
}

export function draftOfDocument(document: ProductDocument): ProductDraft {
  return {
    ...document,
    combo:
      document.combo === null
        ? null
        : {
            slots: document.combo.slots.map((slot) => ({
              id: slot.id,
              name: slot.name,
              minSelect: String(slot.minSelect),
              maxSelect: String(slot.maxSelect),
              options: slot.options.map((option) => ({
                key: newId(),
                productId: option.productId,
                variantId: option.variantId,
                upcharge: amountInputText(option.upcharge),
              })),
            })),
          },
    basePrice: amountInputText(document.basePrice),
    measureUnit: document.measureUnit ?? "kg",
    taxRate: String(document.taxRateBp / 100),
    photo:
      document.imageKey === null || document.imageUrl === null
        ? null
        : { key: document.imageKey, url: document.imageUrl },
    variants: document.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: amountInputText(variant.price),
    })),
    modifierGroups: document.modifierGroups.map((group) => ({
      id: group.id,
      name: group.name,
      minSelect: String(group.minSelect),
      maxSelect: String(group.maxSelect),
      allowDuplicates: group.allowDuplicates,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: amountInputText(option.priceDelta),
        maxQuantity: countText(option.maxQuantity),
      })),
      variantRules: Object.fromEntries(
        Object.entries(group.variantRules).map(([variantId, rule]) => [
          variantId,
          {
            hidden: rule.hidden === true,
            minSelect: countText(rule.minSelect),
            maxSelect: countText(rule.maxSelect),
          },
        ]),
      ),
    })),
  };
}
