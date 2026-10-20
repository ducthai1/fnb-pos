import type { NewStaffMember } from "../../lib/api/staff-api";
import { vi } from "../../messages/vi";

const T = vi.staff;
const NAME_MAX = 80;
const PIN_FORMAT = /^\d{4,6}$/;

export interface NewStaffForm {
  displayName: string;
  roleId: string;
  branchIds: readonly string[];
  pin: string;
}

export type NewStaffField = keyof NewStaffForm;
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

/**
 * The member to create, or what to fix first, field by field. Only the format of the PIN
 * is checked here; which PINs are too easy to guess is the server's rule, and its refusal
 * is shown at the PIN field (see staffFieldOfCode).
 */
export function newStaffBody(
  form: NewStaffForm,
): { ok: true; body: NewStaffMember } | { ok: false; errors: FieldErrors<NewStaffField> } {
  const errors: FieldErrors<NewStaffField> = {};
  const displayName = form.displayName.trim();
  if (displayName === "") errors.displayName = vi.common.nameMissing;
  else if (displayName.length > NAME_MAX) errors.displayName = vi.common.nameTooLong(NAME_MAX);
  if (form.roleId === "") errors.roleId = T.roleMissing;
  if (form.branchIds.length === 0) errors.branchIds = T.branchesMissing;
  if (!PIN_FORMAT.test(form.pin)) errors.pin = T.pinFormat;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: { displayName, roleId: form.roleId, pin: form.pin, branchIds: [...form.branchIds] },
  };
}

/** The field a refusal of POST /staff is about, so its sentence shows next to that field. */
export function staffFieldOfCode(code: string | null): NewStaffField | null {
  switch (code) {
    case "API_STAFF_PIN_FORMAT":
    case "API_STAFF_PIN_TOO_WEAK":
      return "pin";
    case "API_ROLE_NOT_FOUND":
      return "roleId";
    case "API_BRANCH_NOT_FOUND":
      return "branchIds";
    default:
      return null;
  }
}
