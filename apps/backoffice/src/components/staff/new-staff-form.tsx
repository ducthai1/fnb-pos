"use client";

import { type FormEvent, useState } from "react";
import type { Role } from "../../lib/api/roles-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { FieldError, TextField } from "../ui/text-field";
import {
  type FieldErrors,
  type NewStaffField,
  type NewStaffForm,
  newStaffBody,
  staffFieldOfCode,
} from "./new-staff-form-state";

const T = vi.staff;

export function NewStaffFormView({ roles, onCreated }: { roles: readonly Role[]; onCreated: () => void }) {
  const api = useApi();
  const session = useSession();
  const empty = (): NewStaffForm => ({
    displayName: "",
    roleId: "",
    branchIds: session.branch === null ? [] : [session.branch.id],
    pin: "",
  });
  const [form, setForm] = useState<NewStaffForm>(empty);
  const [errors, setErrors] = useState<FieldErrors<NewStaffField>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<NewStaffForm>) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDone(null);
    setFailure(null);
    const checked = newStaffBody(form);
    if (!checked.ok) return setErrors(checked.errors);
    setErrors({});
    setBusy(true);
    const result = await api.createStaff(checked.body);
    setBusy(false);
    if (result.ok) {
      setDone(T.added(checked.body.displayName));
      setForm(empty());
      return onCreated();
    }
    if (isSignedOut(result)) session.signedOut();
    const field = staffFieldOfCode(result.code);
    if (field === null) return setFailure(failureMessage(result));
    setErrors({ [field]: failureMessage(result) });
  }

  const toggleBranch = (branchId: string, on: boolean) =>
    set({
      branchIds: on
        ? [...form.branchIds, branchId]
        : form.branchIds.filter((id) => id !== branchId),
    });

  return (
    <form className="bo-card bo-form-grid" aria-labelledby="new-staff-title" onSubmit={(event) => void submit(event)} noValidate>
      <h2 id="new-staff-title" className="bo-subtitle">
        {T.addTitle}
      </h2>
      <TextField
        label={T.nameLabel}
        value={form.displayName}
        maxLength={120}
        onChange={(displayName) => set({ displayName })}
        error={errors.displayName}
      />
      <div className="bo-field">
        <label htmlFor="new-staff-role">{T.roleLabel}</label>
        <select
          id="new-staff-role"
          className="bo-input"
          value={form.roleId}
          aria-invalid={errors.roleId === undefined ? undefined : true}
          onChange={(event) => set({ roleId: event.target.value })}
        >
          <option value="">{T.rolePlaceholder}</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <FieldError message={errors.roleId} />
      </div>
      <fieldset className="bo-fieldset">
        <legend>{T.branchesLabel}</legend>
        {(session.branches ?? []).map((branch) => (
          <label key={branch.id} className="bo-field--inline bo-wrap">
            <input
              type="checkbox"
              checked={form.branchIds.includes(branch.id)}
              onChange={(event) => toggleBranch(branch.id, event.target.checked)}
            />
            {branch.name}
          </label>
        ))}
        <FieldError message={errors.branchIds} />
      </fieldset>
      <TextField
        label={T.pinLabel}
        value={form.pin}
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        hint={T.pinHint}
        onChange={(pin) => set({ pin: pin.replace(/\D/g, "") })}
        error={errors.pin}
      />
      <ErrorNotice message={failure} />
      <SuccessNotice message={done} />
      <button type="submit" className="bo-button bo-button--primary" disabled={busy}>
        {busy ? T.submitting : T.submit}
      </button>
    </form>
  );
}
