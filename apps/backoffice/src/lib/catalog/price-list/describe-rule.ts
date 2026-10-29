import { formatVnd, vnd } from "@fnb/domain";
import { vi } from "../../../messages/vi";
import type { RuleDraft } from "./price-list-draft";

const S = vi.priceLists.summary;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Names of what a rule points at, looked up by id; the rule's sentence falls back to a hint. */
export interface RuleNames {
  readonly category: (id: string) => string | undefined;
  readonly product: (id: string) => string | undefined;
  readonly variant: (id: string) => string | undefined;
  readonly branch: (id: string) => string | undefined;
}

/** Days as a person says them: "T2–T6" for a run, otherwise the days listed. */
export function daysText(days: readonly number[]): string {
  if (days.length === 0 || days.length === 7) return S.everyDay;
  const short = vi.priceLists.editor.dayShort;
  const ordered = DAY_ORDER.filter((day) => days.includes(day));
  const first = DAY_ORDER.indexOf(ordered[0] ?? 1);
  const isRun = ordered.length > 2 && ordered.every((day, at) => DAY_ORDER[first + at] === day);
  const [head, tail] = [ordered[0], ordered[ordered.length - 1]];
  return isRun && head !== undefined && tail !== undefined
    ? `${short[head]}–${short[tail]}`
    : ordered.map((day) => short[day]).join(", ");
}

/** One line that says what a rule does, for the head of its card and for tests to read. */
export function describeRule(rule: RuleDraft, names: RuleNames): string {
  const effect =
    rule.effectKind === "percent_off" ? S.percent(rule.value || "?") : S.fixed(/^\d/.test(rule.value) ? formatVnd(vnd(BigInt(rule.value.replace(/\D/g, "") || "0"))) : "?");
  const target =
    rule.scopeKind === "global"
      ? S.global
      : rule.scopeKind === "category"
        ? names.category(rule.categoryId)
        : rule.scopeKind === "product"
          ? names.product(rule.productId)
          : [names.product(rule.productId), names.variant(rule.variantId)].filter(Boolean).join(" · ");
  const when = [
    daysText(rule.days),
    rule.start !== "" && rule.end !== "" ? `${rule.start}–${rule.end}` : S.allDay,
    rule.from !== "" || rule.to !== "" ? S.range(rule.from, rule.to) : null,
  ].filter((part) => part !== null);
  const where = [rule.branchId === "" ? S.allBranches : (names.branch(rule.branchId) ?? S.allBranches)];
  if (rule.channelKey.trim() !== "") where.push(S.channel(rule.channelKey.trim()));
  return `${effect} · ${target === undefined || target === "" ? S.unknown : target} · ${when.join(", ")} · ${where.join(", ")}`;
}

