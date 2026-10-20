"use client";

import { useMemo, useState } from "react";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useApiLoad } from "../shell/use-api-load";
import { SuccessNotice } from "../ui/error-notice";
import { NewStaffFormView } from "./new-staff-form";
import { type OpenTool, StaffTable } from "./staff-table";

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
  const [open, setOpen] = useState<OpenTool | null>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <section className="bo-stack" aria-labelledby="staff-title">
      <h1 id="staff-title" className="bo-title">
        {T.title}
      </h1>
      <p className="bo-muted">{T.hint}</p>
      <LoadStateView loaded={roles} retry={reloadRoles}>
        {(roleList) => (
          <>
            <NewStaffFormView roles={roleList.filter((role) => role.archivedAt === null)} onCreated={refreshStaff} />
            <SuccessNotice message={done} />
            <LoadStateView loaded={staff} retry={reloadStaff}>
              {(members) => (
                <StaffTable
                  staff={members}
                  roles={roleList}
                  open={open}
                  onOpen={(tool) => {
                    setDone(null);
                    setOpen(tool);
                  }}
                  onClose={() => setOpen(null)}
                  onDone={(message) => {
                    setOpen(null);
                    setDone(message);
                    refreshStaff();
                  }}
                />
              )}
            </LoadStateView>
          </>
        )}
      </LoadStateView>
    </section>
  );
}
