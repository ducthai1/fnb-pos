"use client";

import { useMemo, useState } from "react";
import type { Role } from "../../lib/api/roles-api";
import { vi } from "../../messages/vi";
import { permissionLabel } from "../../messages/vi-people-and-devices";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useApiLoad } from "../shell/use-api-load";
import { SuccessNotice } from "../ui/error-notice";
import { RoleEditor } from "./role-editor";

const T = vi.roles;

type Editing = { role: Role | null } | null;

export function RolesScreen() {
  const api = useApi();
  const load = useMemo(() => () => api.listRoles(), [api]);
  const [loaded, reload, refresh] = useApiLoad(load);
  const [editing, setEditing] = useState<Editing>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const open = (role: Role | null) => {
    setSaved(null);
    setEditing({ role });
  };

  return (
    <section className="bo-stack" aria-labelledby="roles-title">
      <h1 id="roles-title" className="bo-title">
        {T.title}
      </h1>
      <p className="bo-muted">{T.hint}</p>
      <SuccessNotice message={saved} />
      <LoadStateView loaded={loaded} retry={reload}>
        {(roles) => (
          <>
            {editing !== null && (
              <RoleEditor
                key={editing.role?.id ?? "new"}
                role={editing.role}
                onCancel={() => setEditing(null)}
                onSaved={(message) => {
                  setEditing(null);
                  setSaved(message);
                  refresh();
                }}
              />
            )}
            <ul className="bo-choice-list" aria-label={T.title}>
              {roles.map((role) => (
                <li key={role.id} className="bo-card bo-role-row">
                  <span className="bo-wrap">
                    <strong>{role.name}</strong>
                    {role.isTemplate && <span className="bo-muted"> · {T.template}</span>}
                  </span>
                  <span className="bo-muted bo-wrap">
                    {role.permissionKeys.map(permissionLabel).join(", ")}
                  </span>
                  <button type="button" className="bo-button" aria-label={T.editLabel(role.name)} onClick={() => open(role)}>
                    {vi.common.edit}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="bo-button" onClick={() => open(null)}>
              {T.add}
            </button>
          </>
        )}
      </LoadStateView>
    </section>
  );
}
