"use client";

import { EINVOICE_REGIME_VERSIONS } from "@fnb/contracts";
import { type FormEvent, useState } from "react";
import type { SettingEntry } from "../../lib/api/settings-api";
import {
  type EInvoiceProfileDraft,
  type EInvoiceProfileField,
  checkEInvoiceProfileDraft,
  einvoiceProfileDraftOf,
} from "../../lib/settings/einvoice-profile-draft";
import { vi } from "../../messages/vi";
import { CheckField, SelectField } from "../ui/select-field";
import { TextField } from "../ui/text-field";
import { SettingCard } from "./setting-card";
import type { SettingWrite } from "./use-setting-write";

const T = vi.settings.einvoice;
const KEY = "einvoice_profile";

/** The sentence under each field the contract refuses. */
const FIELD_ERRORS: Readonly<Record<EInvoiceProfileField, string>> = {
  sellerTaxCode: T.sellerTaxCodeInvalid,
  sellerName: T.textInvalid,
  sellerAddress: T.textInvalid,
  templateSymbol: T.templateSymbolInvalid,
  provider: T.providerInvalid,
  regimeVersion: T.textInvalid,
  refundInvoicing: T.refundInvalid,
};

const TEXT_FIELDS = [
  ["sellerTaxCode", T.sellerTaxCode, "numeric"],
  ["sellerName", T.sellerName, "text"],
  ["sellerAddress", T.sellerAddress, "text"],
  ["templateSymbol", T.templateSymbol, "text"],
] as const;

function EInvoiceProfileForm({ entry, write }: { entry: SettingEntry; write: SettingWrite }) {
  const [draft, setDraft] = useState<EInvoiceProfileDraft>(() => einvoiceProfileDraftOf(entry.value));
  const [errors, setErrors] = useState<Partial<Record<EInvoiceProfileField, true>>>({});
  const locked = !entry.editableHere || write.busy;
  const edit = (change: Partial<EInvoiceProfileDraft>) => setDraft((current) => ({ ...current, ...change }));
  const errorOf = (field: EInvoiceProfileField) => (errors[field] === undefined ? undefined : FIELD_ERRORS[field]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const check = checkEInvoiceProfileDraft(draft);
    if (!check.ok) return setErrors(check.errors);
    setErrors({});
    void write.save(KEY, check.value);
  }

  return (
    <form className="bo-stack" onSubmit={submit} noValidate>
      <CheckField label={T.enabled} checked={draft.enabled} disabled={locked} onChange={(enabled) => edit({ enabled })} />
      {TEXT_FIELDS.map(([field, label, inputMode]) => (
        <TextField
          key={field}
          label={label}
          value={draft[field]}
          inputMode={inputMode}
          disabled={locked}
          error={errorOf(field)}
          onChange={(text) => edit({ [field]: text })}
        />
      ))}
      <TextField
        label={T.provider}
        hint={T.providerHint}
        value={draft.provider}
        autoComplete="off"
        disabled={locked}
        error={errorOf("provider")}
        onChange={(provider) => edit({ provider })}
      />
      <SelectField
        label={T.regimeVersion}
        value={draft.regimeVersion}
        choices={EINVOICE_REGIME_VERSIONS.map((version) => ({ value: version, label: version }))}
        disabled={locked}
        error={errorOf("regimeVersion")}
        onChange={(regimeVersion) => edit({ regimeVersion })}
      />
      <SelectField
        label={T.refundInvoicing}
        value={draft.refundInvoicing}
        choices={[
          { value: "none", label: T.refundNone },
          { value: "adjustment", label: T.refundAdjustment },
        ]}
        disabled={locked}
        error={errorOf("refundInvoicing")}
        onChange={(value) => edit({ refundInvoicing: value === "adjustment" ? "adjustment" : "none" })}
      />
      {entry.editableHere && (
        <button type="submit" className="bo-button bo-button--primary" disabled={write.busy}>
          {write.busy ? vi.common.saving : vi.common.save}
        </button>
      )}
    </form>
  );
}

/** In whose name, through which provider and under which rules the branch's sales are invoiced. */
export function EInvoiceProfileSection({ entry, write }: { entry: SettingEntry; write: SettingWrite }) {
  return (
    <SettingCard title={T.title} entry={entry} write={write}>
      <EInvoiceProfileForm key={`${entry.source}:${JSON.stringify(entry.value)}`} entry={entry} write={write} />
    </SettingCard>
  );
}
