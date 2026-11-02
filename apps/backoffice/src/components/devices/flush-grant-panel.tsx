"use client";

import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FlushGrant } from "../../lib/api/devices-api";
import { formatClockTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";

const T = vi.devices;
const TICK_MS = 5_000;

/**
 * The code that lets one revoked till send what it still holds, shown large enough to read
 * out across a counter, with the time it stops working. It belongs to that till alone.
 */
export function FlushGrantPanel({
  deviceName,
  grant,
  onClose,
}: {
  deviceName: string;
  grant: FlushGrant;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const panel = useRef<HTMLElement>(null);
  const live = new Date(grant.expiresAt).getTime() > now;
  useEffect(() => {
    panel.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [live]);

  return (
    <section ref={panel} className="bo-card bo-pairing bo-flush-grant" aria-label={T.flushTitle(deviceName)}>
      <div className="bo-pairing__head">
        <span className="bo-pairing__icon" aria-hidden="true">
          <Icon of={SendHorizontal} size={22} />
        </span>
        <h2 className="bo-flush-grant__title bo-wrap">{T.flushTitle(deviceName)}</h2>
        <button type="button" className="bo-button" onClick={onClose}>
          {T.flushClose}
        </button>
      </div>
      <output className="bo-pairing-code" aria-label={T.flushTitle(deviceName)} data-flush-code={grant.code}>
        <span>{grant.code.slice(0, 4)}</span>
        <span>{grant.code.slice(4)}</span>
      </output>
      {live ? (
        <>
          <p>{T.flushExpires(formatClockTime(grant.expiresAt))}</p>
          <p className="bo-muted bo-wrap">{T.flushHint}</p>
        </>
      ) : (
        <p className="bo-notice bo-notice--warn">{T.flushExpired}</p>
      )}
    </section>
  );
}
