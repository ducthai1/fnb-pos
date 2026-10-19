import { DomainError } from "../errors";
import type { ModifierSelectionInput } from "./validate-modifier-selection";

/* Test-only helpers shared by the catalog and pricing tests; not exported from the package. */

/** The DomainError thrown by fn; any other outcome fails the test. */
export function errorOf(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("expected a DomainError, but nothing was thrown");
}

export const sugar = (percent: number): ModifierSelectionInput => ({
  groupId: "sugar",
  optionId: `sugar-${percent}`,
  quantity: 1,
});

export const ice = (optionId: string): ModifierSelectionInput => ({
  groupId: "ice",
  optionId,
  quantity: 1,
});

export const topping = (optionId: string, quantity = 1): ModifierSelectionInput => ({
  groupId: "topping",
  optionId,
  quantity,
});

/** The two choices every cold milk tea needs before toppings. */
export const SUGAR_AND_ICE: readonly ModifierSelectionInput[] = [sugar(50), ice("ice-less")];
