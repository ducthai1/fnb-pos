"use client";

import { PERMISSION_DEFINITIONS, PERMISSION_KEYS, type PermissionKey } from "@fnb/domain";
import { type FormEvent, useState } from "react";
import type { Role } from "../../lib/api/roles-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ErrorNotice } from "../ui/error-notice";
import { TextField } from "../ui/text-field";
import { type RoleGrantsErrors, type RoleGrantsForm, roleGrantsBody, roleGrantsFormOf } from "./role-grants-form";

const T = vi.roles;

/** Edits one role's name, keys and limits; `role` null creates a new one. */
export function RoleEditor({
  role,
  onSaved,
  onCancel,
}: {
  role: Role | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const { signedOut } = useSession();
  const [form, setForm] = useState<RoleGrantsForm>(() => roleGrantsFormOf(role));
  const [errors, setErrors] = useState<RoleGrantsErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (key: PermissionKey, on: boolean) =>
    setForm((current) => ({
      ...current,
      keys: on ? [...current.keys, key] : current.keys.filter((held) => held !== key),
    }));
  const setLimit = (key: PermissionKey, text: string) =>
    setForm((current) => ({ ...current, limits: { ...current.limits, [key]: text } }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    const checked = roleGrantsBody(form);
    if (!checked.ok) return setErrors(checked.errors);
    setErrors({});
    setBusy(true);
    const result =
      role === null ? await api.createRole(checked.body) : await api.updateRole(role.id, checked.body);
    setBusy(false);
    if (result.ok) return onSaved(T.saved(checked.body.name));
    if (isSignedOut(result)) signedOut();
    setFailure(failureMessage(result));
  }

  return (
    <form className="bo-card" aria-labelledby="role-editor-title" onSubmit={(event) => void submit(event)} noValidate>
      <h2 id="role-editor-title" className="bo-subtitle bo-wrap">
        {role === null ? T.newRoleTitle : T.editTitle(role.name)}
      </h2>
      <TextField label={T.nameLabel} value={form.name} onChange={(name) => setForm({ ...form, name })} error={errors.name} />
      <fieldset className="bo-fieldset bo-permissions">
        <legend>{T.permissionsLegend}</legend>
        {PERMISSION_KEYS.map((key) => {
          const kind = PERMISSION_DEFINITIONS[key].threshold;
          const held = form.keys.includes(key);
          return (
            <div key={key} className="bo-permission">
              <label className="bo-field--inline">
                <input type="checkbox" checked={held} onChange={(event) => toggle(key, event.target.checked)} />
                {T.permissions[key]}
              </label>
              {kind !== undefined && held && (
                <TextField
                  label={kind === "max_rate" ? T.maxRateLabel : T.maxAmountLabel}
                  value={form.limits[key] ?? ""}
                  inputMode="decimal"
                  onChange={(text) => setLimit(key, text)}
                  error={errors[key]}
                />
              )}
            </div>
          );
        })}
      </fieldset>
      <ErrorNotice message={failure} />
      <div className="bo-row">
        <button type="submit" className="bo-button bo-button--primary" disabled={busy}>
          {busy ? vi.common.saving : T.save}
        </button>
        <button type="button" className="bo-button" disabled={busy} onClick={onCancel}>
          {vi.common.cancel}
        </button>
      </div>
    </form>
  );
}
