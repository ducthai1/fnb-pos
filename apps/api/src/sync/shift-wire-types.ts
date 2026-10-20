/** Shift shapes sync sends, with money as whole-đồng JSON numbers like the order shapes. */

export interface DenominationCountSnapshot {
  readonly denomination: number;
  readonly pieces: number;
}

/** The lines of the cash book: what a closing slip prints above the count. */
export interface ShiftCashFiguresSnapshot {
  readonly openingCash: number;
  readonly cashSales: number;
  readonly cashRefunds: number;
  readonly cashIn: number;
  readonly cashOut: number;
  readonly expectedCash: number;
}

/** The settled close, as it was at the moment of closing; it never changes afterwards. */
export interface ShiftCloseSnapshot {
  readonly closedByStaffId: string;
  readonly countedCash: number;
  readonly expectedCash: number;
  readonly difference: number;
  readonly approvalId: string | null;
  readonly denominations: readonly DenominationCountSnapshot[];
  /** Drafts still open on the till at the close, to be settled in the next shift. */
  readonly openOrdersCarried: number;
}

/** A whole shift as one change: a till replaces its copy with this. */
export interface ShiftSnapshot {
  readonly id: string;
  readonly branchId: string;
  readonly deviceId: string | null;
  readonly status: string;
  readonly businessDate: string;
  /** Rises with every change a till must see: the row's version plus its cash book entries. */
  readonly version: number;
  readonly openedByStaffId: string;
  readonly openingDenominations: readonly DenominationCountSnapshot[];
  /** The cash book up to the close: cash that reached the server before it. */
  readonly figures: ShiftCashFiguresSnapshot;
  readonly close: ShiftCloseSnapshot | null;
  /**
   * Cash of sales made during the shift that reached the server after its close: the
   * adjustment the closed figures need, shown beside them rather than folded in.
   */
  readonly cashRecordedAfterClose: number;
}
