"use client";

import { Fragment } from "react";
import type { Role } from "../../lib/api/roles-api";
import type { StaffMember } from "../../lib/api/staff-api";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useSession } from "../shell/session-context";
import { type StaffTool, StaffToolPanel } from "./staff-tool-panel";

const T = vi.staff;
const K = vi.staffTools;

export interface OpenTool {
  readonly staffId: string;
  readonly tool: StaffTool;
}

/** Whether wrong PINs are counted against them: a lock now, or a count the next lock grows from. */
const hasPinTrouble = (member: StaffMember) => member.lockedOutUntil !== null || member.failedSignIns > 0;

function statusText(member: StaffMember) {
  if (!member.active) return T.inactive;
  if (member.lockedOutUntil !== null) return `${T.active} · ${K.lockedOutUntil(formatDateTime(member.lockedOutUntil))}`;
  if (member.failedSignIns > 0) return `${T.active} · ${K.failedSignIns(member.failedSignIns)}`;
  return T.active;
}

function ToolButtons({ member, onOpen }: { member: StaffMember; onOpen: (tool: StaffTool) => void }) {
  const name = member.displayName;
  const button = (tool: StaffTool, label: string, aria: string) => (
    <button type="button" className="bo-button" aria-label={aria} onClick={() => onOpen(tool)}>
      {label}
    </button>
  );
  return (
    <div className="bo-row">
      {button("edit", K.edit, K.editLabel(name))}
      {button("pin", K.resetPin, K.resetPinLabel(name))}
      {hasPinTrouble(member) && button("unlock", K.unlockPin, K.unlockPinLabel(name))}
      {member.active ? button("lock", K.lock, K.lockLabel(name)) : button("reopen", K.reopen, K.reopenLabel(name))}
    </div>
  );
}

/**
 * Everyone who signs in at the tills, with what a manager can do about each: the tool
 * picked opens under its row, one at a time.
 */
export function StaffTable({ staff, roles, open, onOpen, onClose, onDone }: {
  staff: readonly StaffMember[];
  roles: readonly Role[];
  open: OpenTool | null;
  onOpen: (open: OpenTool) => void;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { branches } = useSession();
  const branchName = (id: string) => branches?.find((branch) => branch.id === id)?.name ?? T.unknownBranch;
  if (staff.length === 0) return <p className="bo-muted">{T.empty}</p>;
  return (
    <table className="bo-table" aria-label={T.title}>
      <thead>
        <tr>
          <th scope="col">{T.columns.name}</th>
          <th scope="col">{T.columns.role}</th>
          <th scope="col">{T.columns.branches}</th>
          <th scope="col">{T.columns.status}</th>
          <th scope="col">{K.actionsColumn}</th>
        </tr>
      </thead>
      <tbody>
        {staff.map((member) => (
          <Fragment key={member.id}>
            <tr data-staff={member.id}>
              <td data-label={T.columns.name} className="bo-wrap">
                {member.displayName}
              </td>
              <td data-label={T.columns.role} className="bo-wrap">
                {roles.find((role) => role.id === member.roleId)?.name ?? T.unknownRole}
              </td>
              <td data-label={T.columns.branches} className="bo-wrap">
                {member.branchIds.map(branchName).join(", ")}
              </td>
              <td data-label={T.columns.status} className="bo-wrap">
                {statusText(member)}
              </td>
              <td data-label={K.actionsColumn}>
                <ToolButtons member={member} onOpen={(tool) => onOpen({ staffId: member.id, tool })} />
              </td>
            </tr>
            {open?.staffId === member.id && (
              <tr data-staff-tool={member.id}>
                <td colSpan={5}>
                  <StaffToolPanel
                    key={open.tool}
                    tool={open.tool}
                    member={member}
                    roles={roles}
                    onCancel={onClose}
                    onDone={onDone}
                  />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
