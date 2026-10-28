/*
 * Where a problem with the product is shown. Each part of the editor reads the errors at
 * its own paths, so a refused topping shows next to that topping, not at the top of a page
 * with 30 of them.
 */

export type DraftErrors = Readonly<Record<string, string>>;

export const productPath = (field?: string) => (field === undefined ? "product" : `product.${field}`);
export const variantPath = (variantId: string, field?: string) =>
  field === undefined ? `variant.${variantId}` : `variant.${variantId}.${field}`;
export const groupPath = (groupId: string, field?: string) =>
  field === undefined ? `group.${groupId}` : `group.${groupId}.${field}`;
export const optionPath = (groupId: string, optionId: string, field?: string) =>
  `${groupPath(groupId)}.option.${optionId}${field === undefined ? "" : `.${field}`}`;
export const rulePath = (groupId: string, variantId: string, field?: string) =>
  `${groupPath(groupId)}.rule.${variantId}${field === undefined ? "" : `.${field}`}`;

export const slotPath = (slotId: string, field?: string) =>
  field === undefined ? `slot.${slotId}` : `slot.${slotId}.${field}`;
export const slotOptionPath = (slotId: string, key: string, field?: string) =>
  `${slotPath(slotId)}.option.${key}${field === undefined ? "" : `.${field}`}`;

/** The first error recorded at a path wins: it is the one to fix first. */
export class DraftErrorList {
  private readonly errors: Record<string, string> = {};

  add(path: string, message: string): void {
    if (!Object.hasOwn(this.errors, path)) this.errors[path] = message;
  }

  get empty(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  toRecord(): DraftErrors {
    return { ...this.errors };
  }
}
