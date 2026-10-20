"use client";

import { type FormEvent, useState } from "react";
import type { SettingEntry } from "../../lib/api/settings-api";
import {
  type ChargeProfileDraft,
  type ChargeProfileField,
  SERVICE_CHANNELS,
  type ServiceChannel,
  checkChargeProfileDraft,
  chargeProfileDraftOf,
} from "../../lib/settings/charge-profile-draft";
import { vi } from "../../messages/vi";
import { CheckField } from "../ui/select-field";
import { FieldError, TextField } from "../ui/text-field";
import { SettingCard } from "./setting-card";
import type { SettingWrite } from "./use-setting-write";

const T = vi.settings.charge;
const KEY = "charge_profile";

function ChargeProfileForm({ entry, write }: { entry: SettingEntry; write: SettingWrite }) {
  const [draft, setDraft] = useState<ChargeProfileDraft>(() => chargeProfileDraftOf(entry.value));
  const [errors, setErrors] = useState<Partial<Record<ChargeProfileField, true>>>({});
  const locked = !entry.editableHere || write.busy;
  const edit = (change: Partial<ChargeProfileDraft>) => setDraft((current) => ({ ...current, ...change }));
  const toggleChannel = (channel: ServiceChannel, on: boolean) =>
    edit({
      appliesTo: SERVICE_CHANNELS.filter((each) => (each === channel ? on : draft.appliesTo.includes(each))),
    });

  function submit(event: FormEvent) {
    event.preventDefault();
    const check = checkChargeProfileDraft(draft);
    if (!check.ok) return setErrors(check.errors);
    setErrors({});
    void write.save(KEY, check.value);
  }

  return (
    <form className="bo-stack" onSubmit={submit} noValidate>
      <CheckField label={T.pricesIncludeTax} checked={draft.pricesIncludeTax} disabled={locked} onChange={(on) => edit({ pricesIncludeTax: on })} />
      <CheckField label={T.serviceChargeOn} checked={draft.serviceChargeOn} disabled={locked} onChange={(on) => edit({ serviceChargeOn: on })} />
      {draft.serviceChargeOn && (
        <>
          <div className="bo-row">
            <TextField
              label={T.rate}
              value={draft.rate}
              inputMode="decimal"
              disabled={locked}
              error={errors.rate === undefined ? undefined : T.rateInvalid}
              onChange={(rate) => edit({ rate })}
            />
            <TextField
              label={T.taxRate}
              value={draft.taxRate}
              inputMode="decimal"
              disabled={locked}
              error={errors.taxRate === undefined ? undefined : T.taxRateInvalid}
              onChange={(taxRate) => edit({ taxRate })}
            />
          </div>
          <fieldset className="bo-fieldset">
            <legend>{T.appliesTo}</legend>
            {SERVICE_CHANNELS.map((channel) => (
              <CheckField
                key={channel}
                label={T.channels[channel] ?? channel}
                checked={draft.appliesTo.includes(channel)}
                disabled={locked}
                onChange={(on) => toggleChannel(channel, on)}
              />
            ))}
            <FieldError message={errors.appliesTo === undefined ? undefined : T.appliesToMissing} />
          </fieldset>
          <fieldset className="bo-fieldset">
            <legend>{T.base}</legend>
            {(["before_discount", "after_discount"] as const).map((base) => (
              <label key={base} className="bo-field--inline">
                <input type="radio" name="service-charge-base" checked={draft.base === base} disabled={locked} onChange={() => edit({ base })} />
                {base === "before_discount" ? T.beforeDiscount : T.afterDiscount}
              </label>
            ))}
          </fieldset>
        </>
      )}
      {entry.editableHere && (
        <button type="submit" className="bo-button bo-button--primary" disabled={write.busy}>
          {write.busy ? vi.common.saving : vi.common.save}
        </button>
      )}
    </form>
  );
}

/** How the branch prices an order: VAT inside the prices or not, and its service charge. */
export function ChargeProfileSection({ entry, write }: { entry: SettingEntry; write: SettingWrite }) {
  return (
    <SettingCard title={T.title} entry={entry} write={write}>
      <ChargeProfileForm key={`${entry.source}:${JSON.stringify(entry.value)}`} entry={entry} write={write} />
    </SettingCard>
  );
}
