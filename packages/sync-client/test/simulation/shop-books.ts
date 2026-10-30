/** What the shop itself knows happened, kept apart from the system so the two can be compared. */
export interface BookedOrder {
  readonly id: string;
  readonly openedBy: string;
  readonly deviceOrderNo: number;
  readonly kind: "counter" | "table";
  tableId: string | null;
  /** The item lines (id, with the units) the shop put on the order and did not take off. */
  readonly items: Map<string, { productId: string; quantity: string }>;
  /** Units the bar was told to make, by line. */
  readonly sent: Map<string, string>;
  state: "open" | "paid" | "cancelled";
  discounted: boolean;
  /** The bill was printed: the guest is on the way to the counter to pay. */
  billed: boolean;
  /** An order whose lines were voided is not added to again. */
  frozen: boolean;
  amountDue: number | null;
  method: "cash" | "qr_transfer" | null;
  paidOn: string | null;
  refunded: boolean;
}

export interface BookedRefund {
  readonly refundOrderId: string;
  readonly saleOrderId: string;
  readonly amount: number;
}

export interface BookedShift {
  readonly device: string;
  readonly shiftId: string;
  readonly opening: number;
  counted: number | null;
}

/** What the days before this one left on the server, for the counts that run through every day. */
export interface EarlierDays {
  readonly commands: number;
  readonly refused: number;
}

export class ShopBooks {
  readonly orders = new Map<string, BookedOrder>();
  readonly refunds: BookedRefund[] = [];
  readonly shifts: BookedShift[] = [];
  /** Which order sits at each table. */
  readonly seats = new Map<string, string>();
  voidCount = 0;
  commandsIssued = 0;
  /** Managers' approvals given to the cashiers' tills, and the refused payments set aside with one. */
  approvalsGiven = 0;
  dismissed = 0;

  constructor(readonly earlier: EarlierDays = { commands: 0, refused: 0 }) {}
  /** Commands the script means the server to refuse: the only ones "needs attention" may hold. */
  readonly meantToBeRefused = new Set<string>();

  open(
    order: Omit<
      BookedOrder,
      | "state"
      | "discounted"
      | "billed"
      | "frozen"
      | "amountDue"
      | "method"
      | "paidOn"
      | "refunded"
      | "sent"
    >,
  ): BookedOrder {
    const booked: BookedOrder = {
      ...order,
      sent: new Map(),
      state: "open",
      discounted: false,
      billed: false,
      frozen: false,
      amountDue: null,
      method: null,
      paidOn: null,
      refunded: false,
    };
    this.orders.set(booked.id, booked);
    if (booked.tableId !== null) this.seats.set(booked.tableId, booked.id);
    return booked;
  }

  /** The order leaves its table when it is settled. */
  settle(order: BookedOrder, state: "paid" | "cancelled"): void {
    order.state = state;
    if (order.tableId !== null) this.seats.delete(order.tableId);
  }

  get sales(): BookedOrder[] {
    return [...this.orders.values()].filter((order) => order.state === "paid");
  }
}
