import {
  type DraftGroup,
  type DraftOption,
  type DraftVariant,
  type DraftVariantRule,
  type ProductDraft,
  newId,
} from "./product-draft";

/*
 * Every change the editor makes to a draft, as a function from the old draft to the new
 * one: the components only say which, so the rules (a removed size takes its group rules
 * with it) live in one place.
 */

export type DraftEdit = (draft: ProductDraft) => ProductDraft;

const NO_RULE: DraftVariantRule = { hidden: false, minSelect: "", maxSelect: "" };

const without = <T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));

const mapGroup = (draft: ProductDraft, groupId: string, change: (group: DraftGroup) => DraftGroup) => ({
  ...draft,
  modifierGroups: draft.modifierGroups.map((group) => (group.id === groupId ? change(group) : group)),
});

export const setFields =
  (patch: Partial<Omit<ProductDraft, "variants" | "modifierGroups">>): DraftEdit =>
  (draft) => ({ ...draft, ...patch });

export const addVariant = (): DraftEdit => (draft) => ({
  ...draft,
  variants: [...draft.variants, { id: newId(), name: "", price: "" }],
});

export const setVariant =
  (variantId: string, patch: Partial<Omit<DraftVariant, "id">>): DraftEdit =>
  (draft) => ({
    ...draft,
    variants: draft.variants.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant)),
  });

/** A rule for a size that no longer exists would be refused, so it leaves with the size. */
export const removeVariant =
  (variantId: string): DraftEdit =>
  (draft) => ({
    ...draft,
    variants: draft.variants.filter((variant) => variant.id !== variantId),
    modifierGroups: draft.modifierGroups.map((group) => ({
      ...group,
      variantRules: without(group.variantRules, variantId),
    })),
  });

/** A new group starts optional with one pick, the commonest shape (sugar, ice). */
export const addGroup = (): DraftEdit => (draft) => ({
  ...draft,
  modifierGroups: [
    ...draft.modifierGroups,
    { id: newId(), name: "", minSelect: "0", maxSelect: "1", allowDuplicates: false, options: [], variantRules: {} },
  ],
});

export const setGroup =
  (groupId: string, patch: Partial<Pick<DraftGroup, "name" | "minSelect" | "maxSelect" | "allowDuplicates">>): DraftEdit =>
  (draft) =>
    mapGroup(draft, groupId, (group) => ({ ...group, ...patch }));

export const removeGroup =
  (groupId: string): DraftEdit =>
  (draft) => ({ ...draft, modifierGroups: draft.modifierGroups.filter((group) => group.id !== groupId) });

export const addOption =
  (groupId: string): DraftEdit =>
  (draft) =>
    mapGroup(draft, groupId, (group) => ({
      ...group,
      options: [...group.options, { id: newId(), name: "", priceDelta: "0", maxQuantity: "" }],
    }));

export const setOption =
  (groupId: string, optionId: string, patch: Partial<Omit<DraftOption, "id">>): DraftEdit =>
  (draft) =>
    mapGroup(draft, groupId, (group) => ({
      ...group,
      options: group.options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)),
    }));

export const removeOption =
  (groupId: string, optionId: string): DraftEdit =>
  (draft) =>
    mapGroup(draft, groupId, (group) => ({
      ...group,
      options: group.options.filter((option) => option.id !== optionId),
    }));

/** A rule left with nothing set is dropped: it would only repeat the group's limits. */
export const setRule =
  (groupId: string, variantId: string, patch: Partial<DraftVariantRule>): DraftEdit =>
  (draft) =>
    mapGroup(draft, groupId, (group) => {
      const next = { ...(group.variantRules[variantId] ?? NO_RULE), ...patch };
      const others = without(group.variantRules, variantId);
      const empty = !next.hidden && next.minSelect.trim() === "" && next.maxSelect.trim() === "";
      return { ...group, variantRules: empty ? others : { ...others, [variantId]: next } };
    });

export const ruleOf = (group: DraftGroup, variantId: string): DraftVariantRule =>
  group.variantRules[variantId] ?? NO_RULE;
