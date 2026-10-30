import { PRODUCT_CODE_PATTERN } from "@fnb/contracts";
import type { ProductBody } from "../../../lib/catalog/product-document";
import { parseAmountText, parseCountText } from "../../../lib/format/amount-text";
import { parsePercentText } from "../../../lib/format/percent-text";
import { vi } from "../../../messages/vi";
import {
  DraftErrorList,
  groupPath,
  optionPath,
  productPath,
  rulePath,
  slotOptionPath,
  slotPath,
  variantPath,
} from "./draft-error-paths";
import type { DraftCombo, DraftGroup, DraftVariantRule, ProductDraft } from "./product-draft";

const NAME_MAX = 120;

/** Reads the typed text of one field, recording why at `path` when it cannot be read. */
class FieldReader {
  constructor(readonly errors: DraftErrorList) {}

  name(path: string, text: string): string {
    const name = text.trim();
    if (name === "") this.errors.add(path, vi.menu.editor.nameRequired);
    else if (name.length > NAME_MAX) this.errors.add(path, vi.menu.editor.nameTooLong);
    return name;
  }

  amount(path: string, text: string): number {
    const amount = parseAmountText(text);
    if (amount === null) this.errors.add(path, vi.common.amountInvalid);
    return amount === null ? 0 : Number(amount);
  }

  optionalAmount(path: string, text: string): number | null {
    return text.trim() === "" ? null : this.amount(path, text);
  }

  count(path: string, text: string): number {
    const count = parseCountText(text);
    if (count === null) this.errors.add(path, vi.common.countInvalid);
    return count ?? 0;
  }

  optionalCount(path: string, text: string): number | null {
    return text.trim() === "" ? null : this.count(path, text);
  }

  rate(path: string, text: string): number {
    const rate = parsePercentText(text);
    if (rate === null) this.errors.add(path, vi.roles.rateInvalid);
    return rate ?? 0;
  }
}

function ruleBody(read: FieldReader, groupId: string, variantId: string, rule: DraftVariantRule) {
  const minSelect = read.optionalCount(rulePath(groupId, variantId, "minSelect"), rule.minSelect);
  const maxSelect = read.optionalCount(rulePath(groupId, variantId, "maxSelect"), rule.maxSelect);
  return {
    ...(minSelect === null ? {} : { minSelect }),
    ...(maxSelect === null ? {} : { maxSelect }),
    ...(rule.hidden ? { hidden: true } : {}),
  };
}

function groupBody(read: FieldReader, group: DraftGroup, variantIds: ReadonlySet<string>) {
  const rules: Record<string, ReturnType<typeof ruleBody>> = {};
  for (const [variantId, rule] of Object.entries(group.variantRules)) {
    // A rule of a size removed in this edit goes with it; the domain would refuse it anyway.
    if (!variantIds.has(variantId)) continue;
    const body = ruleBody(read, group.id, variantId, rule);
    if (Object.keys(body).length > 0) rules[variantId] = body;
  }
  return {
    id: group.id,
    name: read.name(groupPath(group.id, "name"), group.name),
    minSelect: read.count(groupPath(group.id, "minSelect"), group.minSelect),
    maxSelect: read.count(groupPath(group.id, "maxSelect"), group.maxSelect),
    allowDuplicates: group.allowDuplicates,
    options: group.options.map((option) => ({
      id: option.id,
      name: read.name(optionPath(group.id, option.id, "name"), option.name),
      priceDelta: read.amount(optionPath(group.id, option.id, "priceDelta"), option.priceDelta || "0"),
      // Without repeats each option is taken once at most: a cap per option would be noise.
      maxQuantity: group.allowDuplicates
        ? read.optionalCount(optionPath(group.id, option.id, "maxQuantity"), option.maxQuantity)
        : null,
    })),
    variantRules: rules,
  };
}

/**
 * The combo's slots as the API takes them. A row without a product, or without a size for a
 * product sold by size, is recorded on the row: the till could not match it to any pick.
 */
function comboBody(
  read: FieldReader,
  combo: DraftCombo,
  sizesOf: SizesOf,
): NonNullable<ProductBody["combo"]> {
  return {
    slots: combo.slots.map((slot) => ({
      id: slot.id,
      name: read.name(slotPath(slot.id, "name"), slot.name),
      minSelect: read.count(slotPath(slot.id, "minSelect"), slot.minSelect),
      maxSelect: read.count(slotPath(slot.id, "maxSelect"), slot.maxSelect),
      options: slot.options.map((option) => {
        const path = (field: string) => slotOptionPath(slot.id, option.key, field);
        if (option.productId === "") read.errors.add(path("productId"), vi.menu.editor.pickProduct);
        else if (option.variantId === null && (sizesOf(option.productId)?.length ?? 0) > 0) {
          read.errors.add(path("variantId"), vi.menu.editor.pickVariant);
        }
        return {
          productId: option.productId,
          variantId: option.variantId,
          upcharge: read.amount(path("upcharge"), option.upcharge || "0"),
        };
      }),
    })),
  };
}

/** The code typed, if any: letters, digits, dot, underscore and dash, 1 to 40 of them. */
function codeOfDraft(typed: string, errors: DraftErrorList): { code?: string } {
  const code = typed.trim();
  if (code === "") return {};
  if (!PRODUCT_CODE_PATTERN.test(code)) errors.add(productPath("code"), vi.menu.editor.codeInvalid);
  return { code };
}

/** What the editor knows of other products: their sizes, so a combo row asks for one. */
export type SizesOf = (productId: string) => readonly unknown[] | undefined;

/**
 * The PUT body for the draft, with every field that cannot be read recorded at its path.
 * The body is only good to send when no error was recorded.
 */
export function draftToProductBody(
  draft: ProductDraft,
  errors: DraftErrorList,
  sizesOf: SizesOf = () => undefined,
): ProductBody {
  const read = new FieldReader(errors);
  const variantIds = new Set(draft.variants.map((variant) => variant.id));
  return {
    version: draft.version,
    brandId: draft.brandId,
    categoryId: draft.categoryId,
    kind: draft.kind,
    name: read.name(productPath("name"), draft.name),
    basePrice: read.optionalAmount(productPath("basePrice"), draft.basePrice),
    pricingMode: draft.pricingMode,
    measureUnit: draft.pricingMode === "weighed" ? draft.measureUnit : null,
    taxRateBp: read.rate(productPath("taxRate"), draft.taxRate),
    stationId: draft.stationId,
    trackStock: draft.trackStock,
    earnsPoints: draft.earnsPoints,
    printCupLabel: draft.printCupLabel,
    ...codeOfDraft(draft.code, errors),
    imageKey: draft.photo?.key ?? null,
    variants: draft.variants.map((variant) => ({
      id: variant.id,
      name: read.name(variantPath(variant.id, "name"), variant.name),
      price: read.optionalAmount(variantPath(variant.id, "price"), variant.price),
    })),
    modifierGroups: draft.modifierGroups.map((group) => groupBody(read, group, variantIds)),
    combo: draft.combo === null ? null : comboBody(read, draft.combo, sizesOf),
  };
}
