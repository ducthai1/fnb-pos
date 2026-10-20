"use client";

import { useState } from "react";
import type { Device } from "../../lib/api/devices-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ConfirmPanel } from "../ui/confirm-panel";
import { SuccessNotice } from "../ui/error-notice";

const T = vi.devices;

/** The tills of the branch; revoking one asks first, then reloads the list. */
export function DevicesTable({ devices, onChanged }: { devices: readonly Device[]; onChanged: () => void }) {
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

  if (devices.length === 0) return <p className="bo-muted">{T.empty}</p>;
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
      <table className="bo-table">
        <thead>
          <tr>
            <th scope="col">{T.columns.name}</th>
            <th scope="col">{T.columns.pairedAt}</th>
            <th scope="col">{T.columns.status}</th>
            <th scope="col">{T.columns.actions}</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id} data-device-id={device.id}>
              <td data-label={T.columns.name}>{device.name}</td>
              <td data-label={T.columns.pairedAt}>{formatDateTime(device.pairedAt)}</td>
              <td data-label={T.columns.status}>
                {device.revokedAt === null ? T.active : T.revoked(formatDateTime(device.revokedAt))}
              </td>
              <td>
                {device.revokedAt === null && (
                  <button
                    type="button"
                    className="bo-button bo-button--danger"
                    aria-label={T.revokeLabel(device.name)}
                    onClick={() => {
                      setDone(null);
                      setConfirming(device);
                    }}
                  >
                    {T.revoke}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
