const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A business date ("2026-10-21", as the server and the tills store it) as Vietnamese readers
 * write it: "21/10/2026", day first, as on the printed slips. Text that is no real calendar
 * day is shown as it came rather than turned into a date nobody meant.
 */
export function formatBusinessDate(text: string): string {
  const parts = ISO_DATE.exec(text);
  if (parts === null) return text;
  const [, year, month, day] = parts;
  const at = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== text) return text;
  return `${day}/${month}/${year}`;
}
