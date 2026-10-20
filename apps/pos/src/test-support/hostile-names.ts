/**
 * Names a shop may really type, which break naive layouts: 80 characters (the API's limit)
 * with no space to wrap at, emoji with joiners, and tone marks typed as combining marks.
 */
const unbroken = (seed: string, length: number) =>
  seed.repeat(Math.ceil(length / seed.length)).slice(0, length);

export const HOSTILE_NAMES = {
  staff: unbroken("NguyễnThịThanhThảoCaSáng", 80),
  branch: unbroken("ChiNhánhQuậnBìnhThạnhĐườngXôViếtNghệTĩnh", 80),
  emoji: "Bé 🧋👨\u200d👩\u200d👧 Trà sữa 🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑",
  decomposed: "Nguye\u0302\u0303n Thi\u0323 A\u0301nh Hoa\u0300ng",
  /** A cash move's reason at the contract's 200 characters, with nowhere to wrap. */
  reason: unbroken("TrảTiềnĐáChoNhàCungCấpQuậnBìnhThạnh", 200),
  /** A server error code the POS does not know yet, shown as it came. */
  unknownCode: unbroken("DOMAIN_SOME_FUTURE_REFUSAL_CODE_", 80),
} as const;
