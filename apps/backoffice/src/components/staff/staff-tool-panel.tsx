"use client";

import { useId, useState } from "react";
import type { ApiResult } from "../../lib/api/api-result";
import type { Role } from "../../lib/api/roles-api";
import type { StaffMember } from "../../lib/api/staff-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ErrorNotice } from "../ui/error-notice";
import { SelectField } from "../ui/select-field";
import { TextField } from "../ui/text-field";

const T = vi.staffTools;

export type StaffTool = "edit" | "pin" | "unlock" | "lock" | "reopen";

const TITLES: Record<StaffTool, (name: string) => string> = {
  edit: T.editTitle,
  pin: T.resetPinTitle,
  unlock: T.unlockPinTitle,
  lock: T.lockTitle,
  reopen: T.reopenTitle,
};
const HINTS: Partial<Record<StaffTool, string>> = {
  unlock: T.unlockPinHint,
  lock: T.lockHint,
  reopen: T.reopenHint,
  pin: vi.staff.pinHint,
};
const CONFIRM: Record<StaffTool, readonly [string, string]> = {
  edit: [T.save, T.saving],
  pin: [T.resetPin, T.resettingPin],
  unlock: [T.unlockPin, T.unlockingPin],
  lock: [T.lock, T.locking],
  reopen: [T.reopen, T.reopening],
};
const DONE: Record<StaffTool, (name: string) => string> = {
  edit: T.saved,
  pin: T.pinReset,
  unlock: T.pinUnlocked,
  lock: T.locked,
  reopen: T.reopened,
};

/**
 * One tool on one staff member, in place under their row: the fields it needs, and one tap
 * that sends it. What the server refuses stays here with its reason, beside the fields.
 */
export function StaffToolPanel({ tool, member, roles, onDone, onCancel }: {
  tool: StaffTool;
  member: StaffMember;
  roles: readonly Role[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const { signedOut } = useSession();
  const titleId = useId();
  const [name, setName] = useState(member.displayName);
  const [roleId, setRoleId] = useState(member.roleId);
  const [pin, setPin] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const assignable = roles.filter((role) => role.archivedAt === null || role.id === member.roleId);

  /** The call this tool makes, or what to fix before it can be made. */
  function request(): Promise<ApiResult<true>> | { field?: string; form?: string } {
    if (tool === "lock") return api.deactivateStaff(member.id);
    if (tool === "reopen") return api.reactivateStaff(member.id);
    if (tool === "unlock") return api.unlockStaffPin(member.id);
    if (tool === "pin") {
      if (!/^\d{4,6}$/.test(pin)) return { field: vi.staff.pinFormat };
      return api.resetStaffPin(member.id, pin);
    }
    const trimmed = name.trim();
    if (trimmed === "") return { field: T.nameMissing };
    const body = {
      ...(trimmed === member.displayName ? {} : { displayName: trimmed }),
      ...(roleId === member.roleId ? {} : { roleId }),
    };
    if (Object.keys(body).length === 0) return { form: T.nothingChanged };
    return api.updateStaff(member.id, body);
  }

  async function submit() {
    const sent = request();
    if (!(sent instanceof Promise)) {
      setFieldError(sent.field);
      return setError(sent.form ?? null);
    }
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    const result = await sent;
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setError(failureMessage(result));
    }
    onDone(DONE[tool](tool === "edit" ? name.trim() : member.displayName));
  }

  const [confirmLabel, busyLabel] = CONFIRM[tool];
  const hint = HINTS[tool];
  return (
    <div className="bo-card bo-confirm bo-stack" role="alertdialog" aria-labelledby={titleId}>
      <p id={titleId} className="bo-subtitle bo-wrap">
        {TITLES[tool](member.displayName)}
      </p>
      {hint !== undefined && <p className="bo-muted bo-wrap">{hint}</p>}
      {tool === "edit" && (
        <>
          <TextField label={vi.staff.nameLabel} value={name} onChange={setName} error={fieldError} maxLength={80} />
          <SelectField
            label={vi.staff.roleLabel}
            value={roleId}
            onChange={setRoleId}
            choices={assignable.map((role) => ({ value: role.id, label: role.name }))}
          />
        </>
      )}
      {tool === "pin" && (
        <TextField
          label={T.newPinLabel}
          value={pin}
          onChange={setPin}
          error={fieldError}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
        />
      )}
      <ErrorNotice message={error} />
      <div className="bo-row">
        <button type="button" className="bo-button bo-button--danger" disabled={busy} onClick={() => void submit()}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="bo-button" disabled={busy} onClick={onCancel}>
          {vi.common.cancel}
        </button>
      </div>
    </div>
  );
}
