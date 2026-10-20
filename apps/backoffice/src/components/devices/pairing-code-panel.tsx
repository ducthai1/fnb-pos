"use client";

import { useEffect, useState } from "react";
import type { PairingCode } from "../../lib/api/devices-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { formatClockTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ErrorNotice } from "../ui/error-notice";

const T = vi.devices;
const TICK_MS = 5_000;

/**
 * Makes a one-time code for a till of the branch and shows it large enough to read across
 * a counter. While it is live, `onTick` runs every few seconds so the till that used it
 * appears in the list without anyone reloading.
 */
export function PairingCodePanel({ branchId, onTick }: { branchId: string; onTick: () => void }) {
  const api = useApi();
  const { signedOut } = useSession();
  const [code, setCode] = useState<PairingCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const live = code !== null && new Date(code.expiresAt).getTime() > now;
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      onTick();
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [live, onTick]);

  async function create() {
    setBusy(true);
    setError(null);
    const result = await api.createPairingCode(branchId);
    setBusy(false);
    if (result.ok) {
      setNow(Date.now());
      return setCode(result.value);
    }
    if (isSignedOut(result)) signedOut();
    setError(failureMessage(result));
  }

  return (
    <section className="bo-card" aria-label={T.codeLabel}>
      <button type="button" className="bo-button bo-button--primary" disabled={busy} onClick={() => void create()}>
        {busy ? T.creatingCode : T.createCode}
      </button>
      <ErrorNotice message={error} />
      {code !== null && (
        <div className="bo-stack">
          <output className="bo-pairing-code" aria-label={T.codeLabel} data-pairing-code={code.code}>
            <span>{code.code.slice(0, 4)}</span>
            <span>{code.code.slice(4)}</span>
          </output>
          {live ? (
            <>
              <p>{T.codeExpires(formatClockTime(code.expiresAt))}</p>
              <p className="bo-muted">{T.codeHint}</p>
            </>
          ) : (
            <p className="bo-notice bo-notice--warn">{T.codeExpired}</p>
          )}
        </div>
      )}
    </section>
  );
}
