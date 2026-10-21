"use client";

import { Archive, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { Role } from "../../lib/api/roles-api";
import { vi } from "../../messages/vi";
import { permissionLabel } from "../../messages/vi-people-and-devices";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useApiLoad } from "../shell/use-api-load";
import { type DataColumn, DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { SuccessNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import { RoleArchivePanel } from "./role-archive-panel";
import { RoleEditor } from "./role-editor";

const T = vi.roles;
const K = vi.staffTools;

type Editing = { role: Role | null } | null;

const COLUMNS: readonly DataColumn<Role>[] = [
  {
    key: "name",
    label: T.columns.name,
    cell: (role) => (
      <span className="bo-cell-title">
        <strong>{role.name}</strong>
        {role.isTemplate && (
          <span className="bo-badge" data-tone="info">
            {T.template}
          </span>
        )}
        {role.archivedAt !== null && <span className="bo-badge">{K.archivedBadge}</span>}
      </span>
    ),
    sortValue: (role) => role.name,
    width: "20%",
  },
  {
    key: "permissions",
    label: T.columns.permissions,
    cell: (role) => (
      <ul className="bo-chips" aria-label={T.columns.permissions}>
        {role.permissionKeys.map((key) => (
          <li key={key} className="bo-badge">
            {permissionLabel(key)}
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "count",
    label: T.columns.count,
    numeric: true,
    cell: (role) => String(role.permissionKeys.length),
    sortValue: (role) => role.permissionKeys.length,
    width: "110px",
  },
];

export function RolesScreen() {
  const api = useApi();
  const load = useMemo(() => () => api.listRoles(), [api]);
  const [loaded, reload, refresh] = useApiLoad(load);
  const [editing, setEditing] = useState<Editing>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const open = (role: Role | null) => {
    setSaved(null);
    setEditing({ role });
  };

  return (
    <section className="bo-stack" aria-labelledby="roles-title">
      <PageHeader
        section="/roles"
        title={T.title}
        titleId="roles-title"
        hint={T.hint}
        actions={
          <button type="button" className="bo-button bo-button--primary" onClick={() => open(null)}>
            <Icon of={Plus} />
            {T.add}
          </button>
        }
      />
      <SuccessNotice message={saved} />
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
      <LoadStateView loaded={loaded} retry={reload}>
        {(roles) => (
          <DataTable
            label={T.title}
            rows={roles}
            rowKey={(role) => role.id}
            columns={COLUMNS}
            search={{ label: T.search, text: (role) => role.name }}
            filters={[
              {
                key: "current",
                label: T.filters.current,
                test: (role) => role.archivedAt === null,
              },
              {
                key: "archived",
                label: T.filters.archived,
                test: (role) => role.archivedAt !== null,
              },
            ]}
            actionsWidth="150px"
            actions={(role) =>
              role.archivedAt === null && (
                <div>
                  <button
                    type="button"
                    className="bo-button bo-button--sm"
                    aria-label={T.editLabel(role.name)}
                    onClick={() => open(role)}
                  >
                    <Icon of={Pencil} size={16} />
                    {vi.common.edit}
                  </button>
                  <button
                    type="button"
                    className="bo-button bo-button--sm"
                    aria-label={K.archiveLabel(role.name)}
                    onClick={() => {
                      setSaved(null);
                      setArchiving(role.id);
                    }}
                  >
                    <Icon of={Archive} size={16} />
                    {K.archive}
                  </button>
                </div>
              )
            }
            expanded={(role) =>
              archiving === role.id ? (
                <RoleArchivePanel
                  role={role}
                  onCancel={() => setArchiving(null)}
                  onDone={(message) => {
                    setArchiving(null);
                    setSaved(message);
                    refresh();
                  }}
                />
              ) : null
            }
            empty={<EmptyState icon={ShieldCheck}>{T.empty}</EmptyState>}
          />
        )}
      </LoadStateView>
    </section>
  );
}
