"use client";

import { Plus } from "lucide-react";
import type { Category, ProductSummary, Station } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { Icon } from "../../ui/icon";
import { ErrorNotice } from "../../ui/error-notice";
import { ComboSection } from "./combo-section";
import { type DraftErrors, productPath } from "./draft-error-paths";
import { EditorSectionNav } from "./editor-section-nav";
import { EDITOR_SECTIONS } from "./editor-sections";
import { GeneralSection, PriceSection } from "./general-section";
import { ModifierGroupCard } from "./modifier-group-card";
import type { ProductDraft } from "./product-draft";
import { type DraftEdit, addGroup } from "./product-draft-edits";
import { VariantsSection } from "./variants-section";

const T = vi.menu.editor;

/**
 * The whole product on one page: general fields, price, sizes, then the modifier groups; a
 * combo has its slots in place of sizes and groups.
 */
export function ProductEditorForm({
  draft,
  errors,
  categories,
  stations,
  products = [],
  edit,
}: {
  draft: ProductDraft;
  errors: DraftErrors;
  categories: readonly Category[];
  stations: readonly Station[];
  /** The brand's products, which a combo's slots offer. */
  products?: readonly ProductSummary[];
  edit: (change: DraftEdit) => void;
}) {
  const combo = draft.kind === "combo";
  return (
    <div className="bo-stack">
      <ErrorNotice message={errors[productPath()] ?? null} />
      <EditorSectionNav combo={combo} />
      <GeneralSection draft={draft} errors={errors} categories={categories} stations={stations} edit={edit} />
      <PriceSection draft={draft} errors={errors} edit={edit} />
      {combo ? (
        <ComboSection draft={draft} products={products} errors={errors} edit={edit} />
      ) : (
        <ItemParts draft={draft} errors={errors} edit={edit} />
      )}
    </div>
  );
}

/** Sizes and modifier groups: what an item (not a combo) is chosen by. */
function ItemParts({
  draft,
  errors,
  edit,
}: {
  draft: ProductDraft;
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  return (
    <>
      <VariantsSection draft={draft} errors={errors} edit={edit} />
      <fieldset className="bo-card bo-fieldset-card" id={EDITOR_SECTIONS.groups}>
        <legend className="bo-subtitle">{T.groups}</legend>
        <p className="bo-muted">{T.groupsHint}</p>
        {draft.modifierGroups.map((group, index) => (
          <ModifierGroupCard
            key={group.id}
            group={group}
            index={index}
            variants={draft.variants}
            errors={errors}
            edit={edit}
          />
        ))}
        <button type="button" className="bo-button bo-button--add" onClick={() => edit(addGroup())}>
          <Icon of={Plus} size={16} />
          {T.addGroup}
        </button>
      </fieldset>
    </>
  );
}
