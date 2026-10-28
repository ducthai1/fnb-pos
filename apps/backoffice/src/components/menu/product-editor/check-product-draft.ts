import { productDocumentSchema, productDocumentToDomain } from "@fnb/contracts";
import { type Product, isDomainError, validateProductConfig } from "@fnb/domain";
import type { ProductBody } from "../../../lib/catalog/product-document";
import { messageForCode } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";
import {
  DraftErrorList,
  type DraftErrors,
  groupPath,
  optionPath,
  productPath,
  rulePath,
  slotOptionPath,
  slotPath,
  variantPath,
} from "./draft-error-paths";
import { type SizesOf, draftToProductBody } from "./draft-to-product-body";
import { locateDomainError } from "./locate-domain-error";
import type { ProductDraft } from "./product-draft";

export type DraftCheck =
  | { readonly ok: true; readonly body: ProductBody; readonly product: Product }
  | { readonly ok: false; readonly errors: DraftErrors };

type IssuePath = readonly (string | number)[];
const field = (part: string | number | undefined) => (typeof part === "string" ? part : undefined);

/** The editor path of a contract issue in the combo's slots, through the draft's row keys. */
function pathOfComboIssue(draft: ProductDraft, path: IssuePath): string {
  const [, , slotIndex, sub, optionIndex, leaf] = path;
  const slot = typeof slotIndex === "number" ? draft.combo?.slots[slotIndex] : undefined;
  if (slot === undefined) return productPath();
  if (sub === "options" && typeof optionIndex === "number") {
    const option = slot.options[optionIndex];
    return option === undefined ? slotPath(slot.id) : slotOptionPath(slot.id, option.key, field(leaf));
  }
  return slotPath(slot.id, field(sub));
}

/** The editor path of a contract issue, found through the ids at the indexes it names. */
function pathOfIssue(body: ProductBody, path: IssuePath, draft: ProductDraft): string {
  const [head, index, sub, subIndex, leaf] = path;
  if (head === "combo") return pathOfComboIssue(draft, path);
  if (head === "variants" && typeof index === "number") {
    const variant = body.variants[index];
    return variant === undefined ? productPath() : variantPath(variant.id, field(sub));
  }
  if (head === "modifierGroups" && typeof index === "number") {
    const group = body.modifierGroups[index];
    if (group === undefined) return productPath();
    if (sub === "options" && typeof subIndex === "number") {
      const option = group.options[subIndex];
      return option === undefined ? groupPath(group.id) : optionPath(group.id, option.id, field(leaf));
    }
    if (sub === "variantRules" && typeof subIndex === "string") return rulePath(group.id, subIndex);
    return groupPath(group.id, field(sub));
  }
  return productPath(field(head));
}

/**
 * Everything the editor knows to check before saving, in the order the API checks it:
 * fields that cannot be read, then the contract's shape, then the domain's rules for a
 * product the tills can sell. The domain stops at its first refusal; that one is shown
 * where it belongs, and the next shows once it is fixed.
 */
export function checkProductDraft(draft: ProductDraft, sizesOf?: SizesOf): DraftCheck {
  const errors = new DraftErrorList();
  const raw = draftToProductBody(draft, errors, sizesOf);
  if (!errors.empty) return { ok: false, errors: errors.toRecord() };

  const parsed = productDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.add(pathOfIssue(raw, issue.path, draft), vi.menu.editor.invalidField);
    }
    return { ok: false, errors: errors.toRecord() };
  }

  const product = productDocumentToDomain(draft.id, parsed.data);
  try {
    validateProductConfig(product);
  } catch (error) {
    if (!isDomainError(error)) throw error;
    errors.add(locateDomainError(error, draft.combo), messageForCode(error.code));
    return { ok: false, errors: errors.toRecord() };
  }
  return { ok: true, body: parsed.data, product };
}
