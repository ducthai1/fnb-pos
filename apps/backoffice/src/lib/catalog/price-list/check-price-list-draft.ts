import type { PriceListDocumentInput } from "@fnb/contracts";
import { type PriceListItem, PRICING_ERROR_CODES, basisPoints, isDomainError, validatePriceList, vnd } from "@fnb/domain";
import { vi } from "../../../messages/vi";
import type { PriceListRule } from "../../api/price-list-api";
import { parseAmountText } from "../../format/amount-text";
import { parsePercentText } from "../../format/percent-text";
import { endOfDayText, lastDayText, localDateText, parseClockText, startOfDayText } from "./clock-and-date-text";
import type { PriceListDraft, RuleDraft } from "./price-list-draft";

const E = vi.priceLists.errors;
export const NAME_MAX = 120;
export const CHANNEL_MAX = 40;
export const RULES_MAX = 500;

export type DraftErrors = Readonly<Record<string, string>>;

/** Where a problem with a rule shows: the key of the rule and the field in it. */
export const rulePath = (key: string, field: string) => `rule.${key}.${field}`;

export type PriceListCheck =
  | { readonly ok: true; readonly body: PriceListDocumentInput }
  | { readonly ok: false; readonly errors: DraftErrors };

const PRICING = PRICING_ERROR_CODES;
const FIELD_OF_CODE: Readonly<Record<string, string>> = {
  [PRICING.fixedPriceOnBroadScope]: "effect",
  [PRICING.negativeFixedPrice]: "value",
  [PRICING.invalidValidityRange]: "to",
  [PRICING.invalidDaysOfWeek]: "days",
  [PRICING.invalidTimeWindow]: "time",
  [PRICING.invalidPriority]: "priority",
  [PRICING.duplicatePriceListItemId]: "rule",
  DOMAIN_MONEY_INVALID_RATE: "value",
};

/** The field of the rule a domain refusal (or the API's, with its details) is about. */
export const fieldOfRefusal = (code: string): string => FIELD_OF_CODE[code] ?? "rule";

function scopeOf(rule: RuleDraft, errors: Record<string, string>): PriceListRule["scope"] | null {
  const at = (field: string, message: string) => {
    errors[rulePath(rule.key, field)] = message;
    return null;
  };
  switch (rule.scopeKind) {
    case "global":
      return { kind: "global" };
    case "category":
      return rule.categoryId === "" ? at("target", E.pickTarget) : { kind: "category", categoryId: rule.categoryId };
    case "product":
      return rule.productId === "" ? at("target", E.pickTarget) : { kind: "product", productId: rule.productId };
    case "variant":
      if (rule.productId === "") return at("target", E.pickTarget);
      return rule.variantId === "" ? at("variant", E.pickVariant) : { kind: "variant", variantId: rule.variantId };
  }
}

function dateOf(text: string, kind: "from" | "to", stored: string | null, rule: RuleDraft, errors: Record<string, string>) {
  if (text.trim() === "") return null;
  const at = kind === "from" ? startOfDayText(text) : endOfDayText(text);
  if (at === null) {
    errors[rulePath(rule.key, kind)] = E.dateInvalid;
    return null;
  }
  // Untouched, the stored instant stays: a rule saved by another tool may not end at midnight.
  const unchanged = stored !== null && draftTextOf(stored, kind) === text.trim();
  return unchanged ? stored : new Date(at).toISOString();
}

const draftTextOf = (instant: string, kind: "from" | "to"): string =>
  kind === "from" ? localDateText(Date.parse(instant)) : lastDayText(Date.parse(instant));

function windowOf(rule: RuleDraft, errors: Record<string, string>): PriceListRule["timeWindow"] {
  const [start, end] = [rule.start.trim(), rule.end.trim()];
  if (start === "" && end === "") return null;
  const fail = (message: string) => {
    errors[rulePath(rule.key, "time")] = message;
    return null;
  };
  if (start === "" || end === "") return fail(E.clockBothOrNone);
  const [startMinute, endMinute] = [parseClockText(start, false), parseClockText(end, true)];
  return startMinute === null || endMinute === null ? fail(E.clockInvalid) : { startMinute, endMinute };
}

function effectOf(rule: RuleDraft, errors: Record<string, string>): PriceListRule["effect"] | null {
  if (rule.effectKind === "percent_off") {
    const rate = parsePercentText(rule.value);
    if (rate !== null) return { kind: "percent_off", rateBp: Number(rate), rounding: rule.rounding };
    errors[rulePath(rule.key, "value")] = E.percentInvalid;
    return null;
  }
  const price = parseAmountText(rule.value);
  if (price !== null) return { kind: "fixed_price", price: Number(price) };
  errors[rulePath(rule.key, "value")] = E.priceInvalid;
  return null;
}

function ruleOf(rule: RuleDraft, errors: Record<string, string>): PriceListRule | null {
  const before = Object.keys(errors).length;
  const [scope, effect, timeWindow] = [scopeOf(rule, errors), effectOf(rule, errors), windowOf(rule, errors)];
  const channelKey = rule.channelKey.trim();
  if (channelKey.length > CHANNEL_MAX) errors[rulePath(rule.key, "channel")] = E.channelTooLong(CHANNEL_MAX);
  const priority = /^-?\d{1,9}$/.test(rule.priority.trim()) ? Number(rule.priority.trim()) : null;
  if (priority === null) errors[rulePath(rule.key, "priority")] = E.priorityInvalid;
  const validFrom = dateOf(rule.from, "from", rule.stored.validFrom, rule, errors);
  const validTo = dateOf(rule.to, "to", rule.stored.validTo, rule, errors);
  if (Object.keys(errors).length > before || scope === null || effect === null || priority === null) return null;
  return {
    id: rule.key,
    scope,
    branchId: rule.branchId === "" ? null : rule.branchId,
    channelKey: channelKey === "" ? null : channelKey,
    validFrom,
    validTo,
    daysOfWeek: rule.days.length === 0 ? null : [...rule.days],
    timeWindow,
    effect,
    priority,
  };
}

const toDomain = (rule: PriceListRule): PriceListItem => ({
  ...rule,
  validFrom: rule.validFrom === null ? null : Date.parse(rule.validFrom),
  validTo: rule.validTo === null ? null : Date.parse(rule.validTo),
  effect:
    rule.effect.kind === "fixed_price"
      ? { kind: "fixed_price", price: vnd(BigInt(rule.effect.price)) }
      : { kind: "percent_off", rate: basisPoints(rule.effect.rateBp), rounding: rule.effect.rounding },
});

/**
 * The draft as the body the API takes, or what is wrong and where. Each rule is checked
 * by what a person can get wrong (a box that is not a number), then by the domain's own
 * price list rules, whose refusal names the rule it is about; no second set of rules here.
 */
export function checkPriceListDraft(draft: PriceListDraft): PriceListCheck {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  if (name === "") errors.name = E.nameRequired;
  else if (name.length > NAME_MAX) errors.name = E.nameTooLong(NAME_MAX);
  if (draft.rules.length > RULES_MAX) errors.rules = E.tooManyRules(RULES_MAX);
  const items = draft.rules.flatMap((rule) => ruleOf(rule, errors) ?? []);
  if (Object.keys(errors).length === 0) {
    try {
      validatePriceList(items.map(toDomain));
    } catch (error) {
      if (!isDomainError(error)) throw error;
      const id = typeof error.details?.priceListItemId === "string" ? error.details.priceListItemId : null;
      const key = id ?? draft.rules[0]?.key ?? "";
      errors[rulePath(key, fieldOfRefusal(error.code))] = vi.errors.byCode[error.code] ?? error.message;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { version: draft.version, brandId: draft.brandId, name, items } };
}
