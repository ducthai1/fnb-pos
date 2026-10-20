"use client";

import type { Category, Station } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { ErrorNotice } from "../../ui/error-notice";
import { type DraftErrors, productPath } from "./draft-error-paths";
import { EditorSectionNav } from "./editor-section-nav";
import { EDITOR_SECTIONS } from "./editor-sections";
import { GeneralSection, PriceSection } from "./general-section";
import { ModifierGroupCard } from "./modifier-group-card";
import type { ProductDraft } from "./product-draft";
import { type DraftEdit, addGroup } from "./product-draft-edits";
import { VariantsSection } from "./variants-section";

const T = vi.menu.editor;

/** The whole product on one page: general fields, price, sizes, then the modifier groups. */
export function ProductEditorForm({
  draft,
  errors,
  categories,
  stations,
  edit,
}: {
  draft: ProductDraft;
  errors: DraftErrors;
  categories: readonly Category[];
  stations: readonly Station[];
  edit: (change: DraftEdit) => void;
}) {
  return (
    <div className="bo-stack">
      <ErrorNotice message={errors[productPath()] ?? null} />
      <EditorSectionNav />
      <GeneralSection draft={draft} errors={errors} categories={categories} stations={stations} edit={edit} />
      <PriceSection draft={draft} errors={errors} edit={edit} />
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
        <button type="button" className="bo-button" onClick={() => edit(addGroup())}>
          {T.addGroup}
        </button>
      </fieldset>
    </div>
  );
}
