"use client";

import type { Category, Station } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { CheckField, SelectField } from "../../ui/select-field";
import { TextField } from "../../ui/text-field";
import { type DraftErrors, productPath } from "./draft-error-paths";
import { EDITOR_SECTIONS } from "./editor-sections";
import type { ProductDraft } from "./product-draft";
import { type DraftEdit, setFields } from "./product-draft-edits";

const T = vi.menu.editor;
const KINDS = ["prepared_drink", "prepared_item", "retail_item", "service"] as const;
const MODES = ["fixed", "open_price", "weighed"] as const;

export function GeneralSection({
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
  const set = (patch: Parameters<typeof setFields>[0]) => edit(setFields(patch));
  // A combo keeps its kind: its slots are not edited here, and no other kind may carry them.
  const kinds = draft.kind === "combo" ? (["combo"] as const) : KINDS;
  return (
    <fieldset className="bo-card bo-fieldset-card" id={EDITOR_SECTIONS.info}>
      <legend className="bo-subtitle">{T.general}</legend>
      <TextField label={T.name} value={draft.name} onChange={(name) => set({ name })} error={errors[productPath("name")]} />
      <div className="bo-row">
        <SelectField
          label={T.kind}
          value={draft.kind}
          choices={kinds.map((kind) => ({ value: kind, label: T.kinds[kind] }))}
          onChange={(kind) => set({ kind: kind as ProductDraft["kind"] })}
        />
        <SelectField
          label={T.category}
          value={draft.categoryId ?? ""}
          choices={[{ value: "", label: T.noCategory }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(categoryId) => set({ categoryId: categoryId === "" ? null : categoryId })}
          error={errors[productPath("categoryId")]}
        />
      </div>
      {draft.kind === "combo" && <p className="bo-notice bo-notice--warn">{T.comboNotEditable}</p>}
      <SelectField
        label={T.station}
        value={draft.stationId ?? ""}
        choices={[{ value: "", label: T.noStation }, ...stations.map((s) => ({ value: s.id, label: s.name }))]}
        onChange={(stationId) => set({ stationId: stationId === "" ? null : stationId })}
        error={errors[productPath("stationId")]}
      />
      <div className="bo-row">
        <CheckField label={T.printCupLabel} checked={draft.printCupLabel} onChange={(printCupLabel) => set({ printCupLabel })} />
        <CheckField label={T.trackStock} checked={draft.trackStock} onChange={(trackStock) => set({ trackStock })} />
        <CheckField label={T.earnsPoints} checked={draft.earnsPoints} onChange={(earnsPoints) => set({ earnsPoints })} />
      </div>
    </fieldset>
  );
}

/** What the product sells for, how the till prices it, and its VAT. */
export function PriceSection({
  draft,
  errors,
  edit,
}: {
  draft: ProductDraft;
  errors: DraftErrors;
  edit: (change: DraftEdit) => void;
}) {
  const set = (patch: Parameters<typeof setFields>[0]) => edit(setFields(patch));
  return (
    <fieldset className="bo-card bo-fieldset-card" id={EDITOR_SECTIONS.price}>
      <legend className="bo-subtitle">{T.priceTitle}</legend>
      <div className="bo-row">
        <TextField
          label={T.basePrice}
          value={draft.basePrice}
          inputMode="numeric"
          hint={T.basePriceHint}
          onChange={(basePrice) => set({ basePrice })}
          error={errors[productPath("basePrice")]}
        />
        <SelectField
          label={T.pricingMode}
          value={draft.pricingMode}
          choices={MODES.map((mode) => ({ value: mode, label: T.pricingModes[mode] }))}
          onChange={(mode) => set({ pricingMode: mode as ProductDraft["pricingMode"] })}
        />
        <TextField
          label={T.taxRate}
          value={draft.taxRate}
          inputMode="decimal"
          onChange={(taxRate) => set({ taxRate })}
          error={errors[productPath("taxRate")]}
        />
      </div>
    </fieldset>
  );
}
