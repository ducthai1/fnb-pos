import type { PosProduct } from "@fnb/contracts";
import {
  CATALOG_ERROR_CODES as C,
  type ComboPickInput,
  type DomainError,
  isDomainError,
  resolveComboPicks,
} from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import { vi } from "../../messages/vi";
import { type PickerPick, cartPicks, optionName, slotsOf } from "./combo-picks";
import { confirmChoices } from "./modifier-choices";
import { modifierErrorMessage } from "./modifier-error-message";

const M = vi.sale.combo;

const numberIn = (details: DomainError["details"], key: string): number => {
  const value = details?.[key];
  return typeof value === "number" ? value : 0;
};

/** The sentence for a slot the domain refused, naming the slot the cashier must fix. */
export function comboErrorMessage(product: PosProduct, error: DomainError): string {
  const slot = slotsOf(product).find((candidate) => candidate.id === error.details?.slotId);
  const name = slot?.name ?? "";
  switch (error.code) {
    case C.requiredComboSlotMissing:
      return M.required(name);
    case C.tooFewComboSelections:
      return M.tooFew(name, numberIn(error.details, "minSelect"));
    case C.tooManyComboSelections:
      return M.tooMany(name, numberIn(error.details, "maxSelect"));
    default:
      // A slot, option or product the shop changed under the open picker.
      return M.menuChanged;
  }
}

export type ComboConfirmation =
  | { readonly ok: true; readonly picks: ComboPickInput[] }
  | { readonly ok: false; readonly message: string };

/**
 * The picks checked as the server will check them: each pick's own options first, naming
 * the pick that is short of one (two milk teas: which of them has no sugar yet), then the
 * slots, by the domain's resolveComboPicks.
 */
export function confirmComboPicks(
  menu: TillMenu,
  product: PosProduct,
  picks: readonly PickerPick[],
): ComboConfirmation {
  for (const pick of picks) {
    const own = menu.productsById.get(pick.productId);
    if (own === undefined) return { ok: false, message: M.menuChanged };
    const checked = confirmChoices(own, pick.variantId, pick.modifiers);
    if (!checked.ok) {
      const name = optionName(menu, pick);
      return { ok: false, message: M.pickProblem(name, modifierErrorMessage(own, checked.error)) };
    }
  }
  try {
    const productOf = (id: string) => menu.productsById.get(id);
    resolveComboPicks(product, productOf, picks);
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return { ok: false, message: comboErrorMessage(product, error) };
  }
  return { ok: true, picks: cartPicks(picks) };
}
