// The shop's own clock: every branch is in Vietnam, so times read the same wherever the
// owner opens the backoffice from (a laptop abroad must not show the code expiring at 03:10).
const ZONE = "Asia/Ho_Chi_Minh";

const time = new Intl.DateTimeFormat("vi-VN", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
const dateTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const parsed = (iso: string): Date | null => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
};

/** "14:05"; the text itself when it is not a time, so nothing shows as "Invalid Date". */
export function formatClockTime(iso: string): string {
  const at = parsed(iso);
  return at === null ? iso : time.format(at);
}

/** "14:05 20/10/2026". */
export function formatDateTime(iso: string): string {
  const at = parsed(iso);
  return at === null ? iso : dateTime.format(at);
}
