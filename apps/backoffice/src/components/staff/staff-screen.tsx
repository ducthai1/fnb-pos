"use client";

import { useMemo } from "react";
import type { Role } from "../../lib/api/roles-api";
import type { StaffMember } from "../../lib/api/staff-api";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { NewStaffFormView } from "./new-staff-form";

const T = vi.staff;

/**
 * Adding someone needs the roles to pick from; the list is loaded on its own, so a list
 * that cannot be read does not also take away the form.
 */
export function StaffScreen() {
  const api = useApi();
  const loadRoles = useMemo(() => () => api.listRoles(), [api]);
  const loadStaff = useMemo(() => () => api.listStaff(), [api]);
  const [roles, reloadRoles] = useApiLoad(loadRoles);
  const [staff, reloadStaff, refreshStaff] = useApiLoad(loadStaff);

  return (
    <section className="bo-stack" aria-labelledby="staff-title">
      <h1 id="staff-title" className="bo-title">
        {T.title}
      </h1>
      <p className="bo-muted">{T.hint}</p>
      <LoadStateView loaded={roles} retry={reloadRoles}>
        {(roleList) => (
          <>
            <NewStaffFormView roles={roleList} onCreated={refreshStaff} />
            <LoadStateView loaded={staff} retry={reloadStaff}>
              {(members) => <StaffTable staff={members} roles={roleList} />}
            </LoadStateView>
          </>
        )}
      </LoadStateView>
    </section>
  );
}

function StaffTable({ staff, roles }: { staff: readonly StaffMember[]; roles: readonly Role[] }) {
  const { branches } = useSession();
  const branchName = (id: string) =>
    branches?.find((branch) => branch.id === id)?.name ?? T.unknownBranch;
  if (staff.length === 0) return <p className="bo-muted">{T.empty}</p>;
  return (
    <table className="bo-table" aria-label={T.title}>
      <thead>
        <tr>
          <th scope="col">{T.columns.name}</th>
          <th scope="col">{T.columns.role}</th>
          <th scope="col">{T.columns.branches}</th>
          <th scope="col">{T.columns.status}</th>
        </tr>
      </thead>
      <tbody>
        {staff.map((member) => (
          <tr key={member.id}>
            <td data-label={T.columns.name}>{member.displayName}</td>
            <td data-label={T.columns.role}>
              {roles.find((role) => role.id === member.roleId)?.name ?? T.unknownRole}
            </td>
            <td data-label={T.columns.branches}>{member.branchIds.map(branchName).join(", ")}</td>
            <td data-label={T.columns.status}>{member.active ? T.active : T.inactive}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
