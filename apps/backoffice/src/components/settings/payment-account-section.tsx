"use client";

import { type FormEvent, useState } from "react";
import type { SettingEntry } from "../../lib/api/settings-api";
import {
  type PaymentAccountDraft,
  type PaymentAccountField,
  checkPaymentAccountDraft,
  paymentAccountDraftOf,
} from "../../lib/settings/payment-account-draft";
import { VIETNAM_BANKS, bankOfBin } from "../../lib/settings/vietnam-banks";
import { vi } from "../../messages/vi";
import { Listbox } from "../ui/listbox";
import { FieldError, TextField } from "../ui/text-field";
import { SettingCard } from "./setting-card";
import type { SettingWrite } from "./use-setting-write";

const T = vi.settings.account;
const KEY = "payment_account";
const OTHER = "other";

const BANK_CHOICES = [
  { value: "", label: T.chooseBank },
  ...VIETNAM_BANKS.map((bank) => ({ value: bank.bin, label: `${bank.shortName} (${bank.bin})` })),
  { value: OTHER, label: T.otherBank },
];

function PaymentAccountForm({ entry, write }: { entry: SettingEntry; write: SettingWrite }) {
  const [draft, setDraft] = useState<PaymentAccountDraft>(() => paymentAccountDraftOf(entry.value));
  // A stored BIN missing from the list is shown as typed by hand, never silently replaced.
  const [otherBank, setOtherBank] = useState(() => draft.bankBin !== "" && bankOfBin(draft.bankBin) === undefined);
  const [errors, setErrors] = useState<Partial<Record<PaymentAccountField, true>>>({});
  const locked = !entry.editableHere || write.busy;
  const edit = (change: Partial<PaymentAccountDraft>) => setDraft((current) => ({ ...current, ...change }));

  function chooseBank(value: string) {
    setOtherBank(value === OTHER);
    edit({ bankBin: value === OTHER ? "" : value });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const check = checkPaymentAccountDraft(draft);
    if (!check.ok) return setErrors(check.errors);
    setErrors({});
    void write.save(KEY, check.value);
  }

  const binError = errors.bankBin === undefined ? undefined : T.binInvalid;
  return (
    <form className="bo-stack" onSubmit={submit} noValidate>
      <div className="bo-listbox-field">
        <Listbox
          className="bo-listbox--field"
          label={T.bank}
          value={otherBank ? OTHER : draft.bankBin}
          choices={BANK_CHOICES}
          disabled={locked}
          onChange={chooseBank}
        />
        <FieldError message={otherBank ? undefined : binError} />
      </div>
      {otherBank && (
        <TextField
          label={T.bin}
          value={draft.bankBin}
          inputMode="numeric"
          disabled={locked}
          error={binError}
          onChange={(bankBin) => edit({ bankBin })}
        />
      )}
      <TextField
        label={T.accountNumber}
        value={draft.accountNumber}
        inputMode="numeric"
        autoComplete="off"
        disabled={locked}
        error={errors.accountNumber === undefined ? undefined : T.accountNumberInvalid}
        onChange={(accountNumber) => edit({ accountNumber })}
      />
      <TextField
        label={T.accountName}
        value={draft.accountName}
        autoComplete="off"
        disabled={locked}
        error={errors.accountName === undefined ? undefined : T.accountNameInvalid}
        onChange={(accountName) => edit({ accountName })}
      />
      {entry.editableHere && (
        <button type="submit" className="bo-button bo-button--primary" disabled={write.busy}>
          {write.busy ? vi.common.saving : vi.common.save}
        </button>
      )}
    </form>
  );
}

/** The bank account the branch's tills build their transfer QR from. */
export function PaymentAccountSection({ entry, write }: { entry: SettingEntry; write: SettingWrite }) {
  return (
    <SettingCard title={T.title} hint={entry.value === null ? `${T.hint} ${T.none}` : T.hint} entry={entry} write={write}>
      <PaymentAccountForm key={`${entry.source}:${JSON.stringify(entry.value)}`} entry={entry} write={write} />
    </SettingCard>
  );
}
