import { CircleAlert, CircleCheck } from "lucide-react";
import { useId } from "react";
import { formatVnd, vnd } from "@fnb/domain";
import type { DayInvoice, DayOrder, DayQrRefund, DayStatus } from "../../lib/api/day-close-api";
import type { DayCloseBlockers } from "../../lib/day-close/day-close-refusal";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";
import { DayCashAfterShiftClose, DayClosedOnBehalf, DayOpenShifts } from "./day-open-shifts";

const T = vi.dayClose;

interface ListItem {
  readonly key: string;
  readonly text: string;
}

/** One titled list of a day; nothing at all when it is empty. */
function DayList({ list, title, items }: { list: string; title: string; items: readonly ListItem[] }) {
  const titleId = useId();
  if (items.length === 0) return null;
  return (
    <section className="bo-stack bo-day-list" aria-labelledby={titleId} data-day-list={list}>
      <h3 id={titleId} className="bo-day-list__title bo-wrap">
        {title} ({items.length})
      </h3>
      <ul className="bo-day-list__items">
        {items.map((item) => (
          <li key={item.key} className="bo-wrap">
            {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

const orders = (list: readonly DayOrder[]) =>
  list.map((order) => ({ key: order.id, text: T.order(order.deviceId, order.deviceOrderNo) }));
const invoices = (list: readonly DayInvoice[]) =>
  list.map((invoice) => ({ key: invoice.id, text: T.invoice(invoice.orderId, invoice.status, invoice.lastErrorCode) }));
const qrRefunds = (list: readonly DayQrRefund[]) =>
  list.map((refund) => ({ key: refund.intentId, text: T.qrRefund(refund.intentId, formatVnd(vnd(refund.amount))) }));
const shifts = (list: readonly string[]) => list.map((id) => ({ key: id, text: T.shift(id) }));

/** The three things a close waits for, each ticked or with how many are left. */
function DayChecklist({ status }: { status: DayStatus }) {
  const checks = [
    { key: "shifts", label: T.checks.shifts, left: status.openShiftIds.length },
    { key: "drafts", label: T.checks.drafts, left: status.openDrafts.length },
    { key: "invoices", label: T.checks.invoices, left: status.unissuedInvoices.length },
  ];
  return (
    <ul className="bo-checklist" aria-label={T.checklistTitle}>
      {checks.map((check) => (
        <li key={check.key} className="bo-checklist__item" data-check={check.key} data-done={check.left === 0}>
          <Icon of={check.left === 0 ? CircleCheck : CircleAlert} size={20} />
          <span className="bo-wrap">{check.label}</span>
          <span className="bo-badge" data-tone={check.left === 0 ? "ok" : "warn"}>
            {check.left === 0 ? T.checkDone : T.checkLeft(check.left)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const NO_ACTION = () => undefined;

/** What still stops the day closing, and what needs a person even once it is closed. */
export function DayStatusLists({
  status,
  onShiftClosed = NO_ACTION,
  onStale = NO_ACTION,
}: {
  status: DayStatus;
  /** A revoked till's shift was closed from here; the message says what was settled. */
  onShiftClosed?: (message: string) => void;
  onStale?: () => void;
}) {
  const blocking = status.openShiftIds.length + status.openDrafts.length + status.unissuedInvoices.length;
  return (
    <div className="bo-stack">
      {status.dayClose === null && <DayChecklist status={status} />}
      {status.dayClose === null && blocking === 0 && <p className="bo-muted">{T.nothingOpen}</p>}
      {status.openShifts.length > 0 ? (
        <DayOpenShifts shifts={status.openShifts} onShiftClosed={onShiftClosed} onStale={onStale} />
      ) : (
        // An older API names the open shifts by id only.
        <DayList list="open-shifts" title={T.openShiftsTitle} items={shifts(status.openShiftIds)} />
      )}
      <DayList list="open-drafts" title={T.openDraftsTitle} items={orders(status.openDrafts)} />
      <DayList list="unissued-invoices" title={T.unissuedTitle} items={invoices(status.unissuedInvoices)} />
      <DayList list="failed-invoices" title={T.failedTitle} items={invoices(status.failedInvoices)} />
      <DayList list="unsent-invoices" title={T.unsentTitle} items={invoices(status.unsentInvoices)} />
      <DayList list="paid-after-close" title={T.paidAfterTitle} items={orders(status.paidAfterClose)} />
      <DayList list="qr-refunded-after-close" title={T.qrRefundedAfterTitle} items={qrRefunds(status.qrRefundedAfterClose)} />
      <DayClosedOnBehalf shifts={status.closedOnBehalf} />
      <DayCashAfterShiftClose shifts={status.cashAfterShiftClose} />
    </div>
  );
}

/** The list a refused close came back with, under the refusal's own sentence. */
export function DayCloseBlockersList({ blockers }: { blockers: DayCloseBlockers }) {
  if (blockers.kind === "shifts") {
    return <DayList list="blocking-shifts" title={T.openShiftsTitle} items={shifts(blockers.shiftIds)} />;
  }
  if (blockers.kind === "drafts") {
    return <DayList list="blocking-drafts" title={T.openDraftsTitle} items={orders(blockers.drafts)} />;
  }
  return <DayList list="blocking-invoices" title={T.unissuedTitle} items={invoices(blockers.invoices)} />;
}
