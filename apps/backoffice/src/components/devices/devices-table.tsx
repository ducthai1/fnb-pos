"use client";

import { TabletSmartphone, Unplug } from "lucide-react";
import { useState } from "react";
import type { Device } from "../../lib/api/devices-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { type DataColumn, DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { SuccessNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";

const T = vi.devices;

const COLUMNS: readonly DataColumn<Device>[] = [
  {
    key: "name",
    label: T.columns.name,
    cell: (device) => <strong>{device.name}</strong>,
    sortValue: (device) => device.name,
  },
  {
    key: "pairedAt",
    label: T.columns.pairedAt,
    cell: (device) => formatDateTime(device.pairedAt),
    sortValue: (device) => device.pairedAt,
  },
  {
    key: "status",
    label: T.columns.status,
    cell: (device) =>
      device.revokedAt === null ? (
        <span className="bo-badge" data-tone="ok">
          {T.active}
        </span>
      ) : (
        <span className="bo-badge">{T.revoked(formatDateTime(device.revokedAt))}</span>
      ),
    sortValue: (device) => (device.revokedAt === null ? 0 : 1),
  },
];

/** The tills of the branch; revoking one asks first, then reloads the list. */
export function DevicesTable({
  devices,
  onChanged,
}: {
  devices: readonly Device[];
  onChanged: () => void;
}) {
  const api = useApi();
  const { signedOut } = useSession();
  const [confirming, setConfirming] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function revoke(device: Device) {
    setBusy(true);
    setError(null);
    const result = await api.revokeDevice(device.id);
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setError(failureMessage(result));
    }
    setConfirming(null);
    setDone(T.revokedDone(device.name));
    onChanged();
  }

  return (
    <div className="bo-stack">
      <SuccessNotice message={done} />
      {confirming !== null && (
        <ConfirmPanel
          title={T.revokeTitle(confirming.name)}
          hint={T.revokeHint}
          confirmLabel={T.revokeConfirm}
          busyLabel={T.revoking}
          busy={busy}
          error={error}
          onConfirm={() => void revoke(confirming)}
          onCancel={() => {
            setConfirming(null);
            setError(null);
          }}
        />
      )}
      <DataTable
        label={T.title}
        rows={devices}
        rowKey={(device) => device.id}
        rowData={(device) => ({ "data-device-id": device.id })}
        columns={COLUMNS}
        search={{ label: T.search, text: (device) => device.name }}
        filterLabel={T.columns.status}
        filters={[
          { key: "active", label: T.filters.active, test: (device) => device.revokedAt === null },
          { key: "revoked", label: T.filters.revoked, test: (device) => device.revokedAt !== null },
        ]}
        actions={(device) =>
          device.revokedAt === null && (
            <div>
              <button
                type="button"
                className="bo-button bo-button--danger bo-button--sm"
                aria-label={T.revokeLabel(device.name)}
                onClick={() => {
                  setDone(null);
                  setConfirming(device);
                }}
              >
                <Icon of={Unplug} size={16} />
                {T.revoke}
              </button>
            </div>
          )
        }
        empty={<EmptyState icon={TabletSmartphone}>{T.empty}</EmptyState>}
      />
    </div>
  );
}
