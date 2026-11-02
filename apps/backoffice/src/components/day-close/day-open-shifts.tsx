"use client";

import { Unplug, Wallet } from "lucide-react";
import { useId, useState } from "react";
import { formatVnd, vnd } from "@fnb/domain";
import type { DayOpenShift, DayShiftCashAfterClose, DayShiftClosedOnBehalf } from "../../lib/api/day-close-api";
import { formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { useSession } from "../shell/session-context";
import { Icon } from "../ui/icon";
import { CloseShiftOnBehalfPanel, differenceSentence } from "./close-shift-on-behalf-panel";

const T = vi.dayClose;
const money = (amount: number) => formatVnd(vnd(BigInt(amount)));

/**
 * The day's open shifts, each with its till and what its drawer should hold. A shift whose
 * till was revoked says so, with the one way left to settle it: a manager holding
 * accept_close_difference counts the drawer and closes it on the till's behalf.
 */
export function DayOpenShifts({
  shifts,
  onShiftClosed,
  onStale,
}: {
  shifts: readonly DayOpenShift[];
  onShiftClosed: (message: string) => void;
  onStale: () => void;
}) {
  const titleId = useId();
  const { user } = useSession();
  const [closing, setClosing] = useState<string | null>(null);
  const mayClose = user.permissionKeys.includes("accept_close_difference");
  if (shifts.length === 0) return null;
  return (
    <section className="bo-stack bo-day-list" aria-labelledby={titleId} data-day-list="open-shifts">
      <h3 id={titleId} className="bo-day-list__title bo-wrap">
        {T.openShiftsTitle} ({shifts.length})
      </h3>
      <ul className="bo-day-shifts">
        {shifts.map((shift) => {
          const name = T.tillName(shift.deviceName);
          return (
            <li key={shift.id} className="bo-day-shift" data-shift={shift.id} data-revoked={shift.deviceRevoked}>
              <div className="bo-day-shift__head">
                <span className="bo-day-shift__icon" aria-hidden="true">
                  <Icon of={shift.deviceRevoked ? Unplug : Wallet} size={20} />
                </span>
                <div className="bo-day-shift__text">
                  <p className="bo-day-shift__name bo-wrap">{name}</p>
                  <p className="bo-muted bo-wrap">
                    <span className="bo-day-shift__id">{T.shift(shift.id)}</span>
                    {" · "}
                    {T.openShiftMeta(formatDateTime(shift.openedAt), money(shift.expectedCash))}
                  </p>
                </div>
                {shift.deviceRevoked && (
                  <span className="bo-badge" data-tone="warn">
                    {T.revokedBadge}
                  </span>
                )}
              </div>
              {shift.deviceRevoked && (
                <div className="bo-stack bo-day-shift__revoked">
                  <p className="bo-wrap">{T.revokedNote}</p>
                  {!mayClose ? (
                    <p className="bo-muted bo-wrap">{T.needsKeyOnBehalf}</p>
                  ) : closing === shift.id ? (
                    <CloseShiftOnBehalfPanel
                      shift={shift}
                      onCancel={() => setClosing(null)}
                      onStale={onStale}
                      onClosed={(message) => {
                        setClosing(null);
                        onShiftClosed(message);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="bo-button bo-button--primary bo-day-shift__action"
                      aria-label={T.closeOnBehalfLabel(name)}
                      onClick={() => setClosing(shift.id)}
                    >
                      {T.closeOnBehalf}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Shifts closed for a revoked till today, with any cash its till sent after that close. */
export function DayClosedOnBehalf({ shifts }: { shifts: readonly DayShiftClosedOnBehalf[] }) {
  const titleId = useId();
  if (shifts.length === 0) return null;
  return (
    <section className="bo-stack bo-day-list" aria-labelledby={titleId} data-day-list="closed-on-behalf">
      <h3 id={titleId} className="bo-day-list__title bo-wrap">
        {T.closedOnBehalfTitle} ({shifts.length})
      </h3>
      <ul className="bo-day-list__items">
        {shifts.map((shift) => (
          <li key={shift.id} className="bo-wrap" data-shift={shift.id}>
            {T.closedOnBehalfRow(
              T.tillName(shift.deviceName),
              money(shift.countedCash),
              money(shift.expectedCash),
              differenceSentence(shift.difference),
            )}
            {shift.cashAfterClose !== 0 && (
              <span className="bo-day-shift__late" data-cash-after-close={shift.cashAfterClose}>
                {T.cashAfterCloseNote(money(shift.cashAfterClose))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Closed shifts whose sales' cash came in after the count: beside it, never in it. */
export function DayCashAfterShiftClose({ shifts }: { shifts: readonly DayShiftCashAfterClose[] }) {
  const titleId = useId();
  if (shifts.length === 0) return null;
  return (
    <section className="bo-stack bo-day-list" aria-labelledby={titleId} data-day-list="cash-after-shift-close">
      <h3 id={titleId} className="bo-day-list__title bo-wrap">
        {T.cashAfterShiftCloseTitle} ({shifts.length})
      </h3>
      <ul className="bo-day-list__items">
        {shifts.map((shift) => (
          <li key={shift.id} className="bo-wrap" data-shift={shift.id}>
            {T.cashAfterShiftCloseRow(T.tillName(shift.deviceName), money(shift.amount))}
          </li>
        ))}
      </ul>
    </section>
  );
}
