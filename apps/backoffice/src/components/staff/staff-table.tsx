"use client";

import { Users } from "lucide-react";
import type { Role } from "../../lib/api/roles-api";
import type { StaffMember } from "../../lib/api/staff-api";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useSession } from "../shell/session-context";
import { type DataColumn, DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { type StaffTool, StaffToolPanel } from "./staff-tool-panel";

const T = vi.staff;
const K = vi.staffTools;

export interface OpenTool {
  readonly staffId: string;
  readonly tool: StaffTool;
}

/** Whether wrong PINs are counted against them: a lock now, or a count the next lock grows from. */
const hasPinTrouble = (member: StaffMember) =>
  member.lockedOutUntil !== null || member.failedSignIns > 0;

function statusText(member: StaffMember) {
  if (!member.active) return T.inactive;
  if (member.lockedOutUntil !== null)
    return `${T.active} · ${K.lockedOutUntil(formatDateTime(member.lockedOutUntil))}`;
  if (member.failedSignIns > 0) return `${T.active} · ${K.failedSignIns(member.failedSignIns)}`;
  return T.active;
}

function ToolButtons({
  member,
  onOpen,
}: {
  member: StaffMember;
  onOpen: (tool: StaffTool) => void;
}) {
  const name = member.displayName;
  const button = (tool: StaffTool, label: string, aria: string) => (
    <button
      type="button"
      className="bo-button bo-button--sm"
      aria-label={aria}
      onClick={() => onOpen(tool)}
    >
      {label}
    </button>
  );
  return (
    <div>
      {button("edit", K.edit, K.editLabel(name))}
      {button("pin", K.resetPin, K.resetPinLabel(name))}
      {hasPinTrouble(member) && button("unlock", K.unlockPin, K.unlockPinLabel(name))}
      {member.active
        ? button("lock", K.lock, K.lockLabel(name))
        : button("reopen", K.reopen, K.reopenLabel(name))}
    </div>
  );
}

function statusTone(member: StaffMember): string | undefined {
  if (!member.active) return undefined;
  if (member.lockedOutUntil !== null) return "danger";
  return member.failedSignIns > 0 ? "warn" : "ok";
}

/**
 * Everyone who signs in at the tills, with what a manager can do about each: the tool
 * picked opens under its row, one at a time.
 */
export function StaffTable({
  staff,
  roles,
  open,
  onOpen,
  onClose,
  onDone,
}: {
  staff: readonly StaffMember[];
  roles: readonly Role[];
  open: OpenTool | null;
  onOpen: (open: OpenTool) => void;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { branches } = useSession();
  const branchName = (id: string) =>
    branches?.find((branch) => branch.id === id)?.name ?? T.unknownBranch;
  const roleName = (member: StaffMember) =>
    roles.find((role) => role.id === member.roleId)?.name ?? T.unknownRole;
  const columns: readonly DataColumn<StaffMember>[] = [
    {
      key: "name",
      label: T.columns.name,
      cell: (member) => <strong>{member.displayName}</strong>,
      sortValue: (member) => member.displayName,
    },
    { key: "role", label: T.columns.role, cell: roleName, sortValue: roleName },
    {
      key: "branches",
      label: T.columns.branches,
      cell: (member) => member.branchIds.map(branchName).join(", "),
    },
    {
      key: "status",
      label: T.columns.status,
      cell: (member) => (
        <span className="bo-badge" data-tone={statusTone(member)}>
          {statusText(member)}
        </span>
      ),
      sortValue: (member) => (member.active ? (hasPinTrouble(member) ? 1 : 0) : 2),
    },
  ];
  return (
    <DataTable
      label={T.title}
      rows={staff}
      rowKey={(member) => member.id}
      rowData={(member) => ({ "data-staff": member.id })}
      columns={columns}
      search={{ label: T.search, text: (member) => member.displayName }}
      filters={[
        { key: "active", label: T.filters.active, test: (member) => member.active },
        { key: "inactive", label: T.filters.inactive, test: (member) => !member.active },
        { key: "pin", label: T.filters.pinTrouble, test: hasPinTrouble },
      ]}
      actionsWidth="300px"
      actions={(member) => (
        <ToolButtons member={member} onOpen={(tool) => onOpen({ staffId: member.id, tool })} />
      )}
      expanded={(member) =>
        open?.staffId === member.id ? (
          <StaffToolPanel
            key={open.tool}
            tool={open.tool}
            member={member}
            roles={roles}
            onCancel={onClose}
            onDone={onDone}
          />
        ) : null
      }
      panelData={(member) => ({ "data-staff-tool": member.id })}
      empty={<EmptyState icon={Users}>{T.empty}</EmptyState>}
    />
  );
}
