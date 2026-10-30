"use client";

import { MEASURE_UNITS, type MeasureUnit } from "@fnb/domain";
import type { Category, Station } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { Listbox } from "../../ui/listbox";
import { CheckField } from "../../ui/check-field";
import { FieldError, TextField } from "../../ui/text-field";
import { type DraftErrors, productPath } from "./draft-error-paths";
import { EDITOR_SECTIONS } from "./editor-sections";
import type { ProductDraft } from "./product-draft";
import { ProductPhotoField } from "./product-photo-field";
import { setKind } from "./combo-draft-edits";
import { type DraftEdit, setFields } from "./product-draft-edits";

const T = vi.menu.editor;
const KINDS = ["prepared_drink", "prepared_item", "retail_item", "service", "combo"] as const;
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
  // A saved product keeps being a combo, or not one: the orders already holding it were
  // stored as one or the other.
  const saved = draft.version !== null;
  const kinds = !saved
    ? KINDS
    : draft.kind === "combo"
      ? (["combo"] as const)
      : KINDS.filter((kind) => kind !== "combo");
  return (
    <fieldset className="bo-card bo-fieldset-card" id={EDITOR_SECTIONS.info}>
      <legend className="bo-subtitle">{T.general}</legend>
      <ProductPhotoField draft={draft} edit={edit} />
      <TextField
        label={T.name}
        value={draft.name}
        onChange={(name) => set({ name })}
        error={errors[productPath("name")]}
      />
      <TextField
        label={T.code}
        value={draft.code}
        hint={T.codeHint}
        maxLength={40}
        onChange={(code) => set({ code })}
        error={errors[productPath("code")]}
      />
      <div className="bo-row">
        <div className="bo-listbox-field">
          <Listbox
            className="bo-listbox--field"
            label={T.kind}
            value={draft.kind}
            choices={kinds.map((kind) => ({ value: kind, label: T.kinds[kind] }))}
            onChange={(kind) => edit(setKind(kind as ProductDraft["kind"]))}
          />
        </div>
        <div className="bo-listbox-field">
          <Listbox
            className="bo-listbox--field"
            label={T.category}
            value={draft.categoryId ?? ""}
            choices={[
              { value: "", label: T.noCategory },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={(categoryId) => set({ categoryId: categoryId === "" ? null : categoryId })}
          />
          <FieldError message={errors[productPath("categoryId")]} />
        </div>
      </div>
      {saved && draft.kind === "combo" && <p className="bo-muted">{T.comboKindLocked}</p>}
      <div className="bo-listbox-field">
        <Listbox
          className="bo-listbox--field"
          label={T.station}
          value={draft.stationId ?? ""}
          choices={[
            { value: "", label: T.noStation },
            ...stations.map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={(stationId) => set({ stationId: stationId === "" ? null : stationId })}
        />
        <FieldError message={errors[productPath("stationId")]} />
      </div>
      <div className="bo-row">
        <CheckField
          label={T.printCupLabel}
          checked={draft.printCupLabel}
          onChange={(printCupLabel) => set({ printCupLabel })}
        />
        <CheckField
          label={T.trackStock}
          checked={draft.trackStock}
          onChange={(trackStock) => set({ trackStock })}
        />
        <CheckField
          label={T.earnsPoints}
          checked={draft.earnsPoints}
          onChange={(earnsPoints) => set({ earnsPoints })}
        />
      </div>
    </fieldset>
  );
}

/** What the product sells for, how the till prices it (and per what, sold by weight), and its VAT. */
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
  const weighed = draft.pricingMode === "weighed";
  const combo = draft.kind === "combo";
  const unitError = errors[productPath("measureUnit")];
  return (
    <fieldset className="bo-card bo-fieldset-card" id={EDITOR_SECTIONS.price}>
      <legend className="bo-subtitle">{T.priceTitle}</legend>
      {/* A combo sells at its fixed price plus the upcharges of what is picked. */}
      {!combo && (
        <div className="bo-row">
          <Listbox
            className="bo-listbox--field"
            label={T.pricingMode}
            value={draft.pricingMode}
            choices={MODES.map((mode) => ({ value: mode, label: T.pricingModes[mode] }))}
            onChange={(mode) => set({ pricingMode: mode as ProductDraft["pricingMode"] })}
          />
          {weighed && (
            <div className="bo-listbox-field">
              <Listbox
                className="bo-listbox--field"
                label={T.measureUnit}
                value={draft.measureUnit}
                choices={MEASURE_UNITS.map((unit) => ({
                  value: unit,
                  label: T.measureUnits[unit],
                }))}
                onChange={(unit) => set({ measureUnit: unit as MeasureUnit })}
              />
              <FieldError message={unitError} />
            </div>
          )}
        </div>
      )}
      <p className="bo-muted bo-wrap" data-pricing-mode-hint={combo ? "combo" : draft.pricingMode}>
        {combo ? T.comboPriceHint : T.pricingModeHints[draft.pricingMode]}
      </p>
      <div className="bo-row">
        <TextField
          label={weighed ? T.basePriceWeighed[draft.measureUnit] : T.basePrice}
          value={draft.basePrice}
          inputMode="numeric"
          hint={draft.pricingMode === "open_price" ? T.basePriceOpenHint : T.basePriceHint}
          onChange={(basePrice) => set({ basePrice })}
          error={errors[productPath("basePrice")]}
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
