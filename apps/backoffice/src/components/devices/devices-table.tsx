"use client";

import { SendHorizontal, TabletSmartphone, Unplug } from "lucide-react";
import { useState } from "react";
import type { Device, FlushGrant } from "../../lib/api/devices-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { type DataColumn, DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import { FlushGrantPanel } from "./flush-grant-panel";

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
  const [granted, setGranted] = useState<{ device: Device; grant: FlushGrant } | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  // A revoked till may send what it still holds once, under a code for that till alone.
  async function grantFlush(device: Device) {
    setGranting(device.id);
    setGrantError(null);
    setDone(null);
    const result = await api.createFlushGrant(device.id);
    setGranting(null);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      return setGrantError(failureMessage(result));
    }
    setGranted({ device, grant: result.value });
  }

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
      <ErrorNotice message={grantError} />
      {granted !== null && (
        <FlushGrantPanel
          key={granted.grant.code}
          deviceName={granted.device.name}
          grant={granted.grant}
          onClose={() => setGranted(null)}
        />
      )}
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
          device.revokedAt !== null ? (
            <div>
              <button
                type="button"
                className="bo-button bo-button--sm"
                aria-label={T.flushGrantLabel(device.name)}
                disabled={granting !== null}
                onClick={() => void grantFlush(device)}
              >
                <Icon of={SendHorizontal} size={16} />
                {granting === device.id ? T.flushGranting : T.flushGrant}
              </button>
            </div>
          ) : (
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
