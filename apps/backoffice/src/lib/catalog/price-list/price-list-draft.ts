import type { PriceListDocument, PriceListRule } from "../../api/price-list-api";
import { amountInputText } from "../../format/amount-text";
import { clockText, lastDayText, localDateText } from "./clock-and-date-text";

export type ScopeKind = "global" | "category" | "product" | "variant";
export type EffectKind = "percent_off" | "fixed_price";

/** One rule as the person edits it: boxes hold text, so a half-typed number is not lost. */
export interface RuleDraft {
  readonly key: string;
  readonly scopeKind: ScopeKind;
  readonly categoryId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly effectKind: EffectKind;
  /** Percent ("20", "12,5") or đồng ("45.000"), by the effect. */
  readonly value: string;
  readonly rounding: "down" | "up" | "half-up" | "half-even";
  readonly branchId: string;
  readonly channelKey: string;
  readonly days: readonly number[];
  readonly start: string;
  readonly end: string;
  readonly from: string;
  readonly to: string;
  readonly priority: string;
  /** What was stored, so a date the person never touched is saved back to the same instant. */
  readonly stored: { readonly validFrom: string | null; readonly validTo: string | null };
}

export interface PriceListDraft {
  readonly id: string;
  readonly brandId: string;
  readonly version: number | null;
  readonly name: string;
  readonly rules: readonly RuleDraft[];
}

/** Which product a size belongs to, for a rule that names only the size. */
export type ProductOfVariant = (variantId: string) => string | undefined;

export function emptyRule(key: string): RuleDraft {
  return {
    key,
    scopeKind: "global",
    categoryId: "",
    productId: "",
    variantId: "",
    effectKind: "percent_off",
    value: "",
    rounding: "half-up",
    branchId: "",
    channelKey: "",
    days: [],
    start: "",
    end: "",
    from: "",
    to: "",
    priority: "0",
    stored: { validFrom: null, validTo: null },
  };
}

export const emptyListDraft = (id: string, brandId: string): PriceListDraft => ({
  id,
  brandId,
  version: null,
  name: "",
  rules: [],
});

function ruleOf(rule: PriceListRule, productOf: ProductOfVariant): RuleDraft {
  const { scope, effect, timeWindow } = rule;
  const [from, to] = [rule.validFrom, rule.validTo];
  return {
    ...emptyRule(rule.id),
    scopeKind: scope.kind,
    categoryId: scope.kind === "category" ? scope.categoryId : "",
    productId: scope.kind === "product" ? scope.productId : scope.kind === "variant" ? (productOf(scope.variantId) ?? "") : "",
    variantId: scope.kind === "variant" ? scope.variantId : "",
    effectKind: effect.kind,
    value: effect.kind === "fixed_price" ? amountInputText(effect.price) : String(effect.rateBp / 100).replace(".", ","),
    rounding: effect.kind === "percent_off" ? effect.rounding : "half-up",
    branchId: rule.branchId ?? "",
    channelKey: rule.channelKey ?? "",
    days: rule.daysOfWeek === null ? [] : [...rule.daysOfWeek].sort((a, b) => a - b),
    start: timeWindow === null ? "" : clockText(timeWindow.startMinute),
    end: timeWindow === null ? "" : clockText(timeWindow.endMinute),
    from: from === null ? "" : localDateText(Date.parse(from)),
    to: to === null ? "" : lastDayText(Date.parse(to)),
    priority: String(rule.priority),
    stored: { validFrom: from, validTo: to },
  };
}

export const draftOfDocument = (document: PriceListDocument, productOf: ProductOfVariant): PriceListDraft => ({
  id: document.id,
  brandId: document.brandId,
  version: document.version,
  name: document.name,
  rules: document.items.map((rule) => ruleOf(rule, productOf)),
});
