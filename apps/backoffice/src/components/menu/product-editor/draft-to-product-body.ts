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
  variantPath,
} from "./draft-error-paths";
import type { DraftGroup, DraftVariantRule, ProductDraft } from "./product-draft";

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
 * The PUT body for the draft, with every field that cannot be read recorded at its path.
 * The body is only good to send when no error was recorded.
 */
export function draftToProductBody(draft: ProductDraft, errors: DraftErrorList): ProductBody {
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
    imageKey: draft.photo?.key ?? null,
    variants: draft.variants.map((variant) => ({
      id: variant.id,
      name: read.name(variantPath(variant.id, "name"), variant.name),
      price: read.optionalAmount(variantPath(variant.id, "price"), variant.price),
    })),
    modifierGroups: draft.modifierGroups.map((group) => groupBody(read, group, variantIds)),
    combo: draft.combo,
  };
}
