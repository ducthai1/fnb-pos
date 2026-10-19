// JSON cannot carry bigint, so money and quantities cross the wire as decimal strings.

export interface OrderWire {
  id: string;
  device_id: string;
  business_date: string;
  status: "open" | "paid";
  total_vnd: string;
  version: number;
  updated_at: number;
}

export interface OrderLineWire {
  id: string;
  order_id: string;
  item_id: string;
  name: string;
  qty_thousandths: string;
  unit_price_vnd: string;
  line_total_vnd: string;
}

export interface OrderSnapshotWire {
  order: OrderWire;
  lines: OrderLineWire[];
}

export interface NewLineWire {
  id: string;
  item_id: string;
  name: string;
  qty_thousandths: string;
  unit_price_vnd: string;
}

export interface CreateOrderPayload {
  order_id: string;
  business_date: string;
  lines: NewLineWire[];
  client_total_vnd: string;
}

export interface AddLinePayload {
  order_id: string;
  line: NewLineWire;
  client_total_vnd: string;
}

export interface PayOrderPayload {
  order_id: string;
  client_total_vnd: string;
}

export type CommandBody =
  | { type: "order.create"; payload: CreateOrderPayload }
  | { type: "order.add_line"; payload: AddLinePayload }
  | { type: "order.pay"; payload: PayOrderPayload };

export type CommandType = CommandBody["type"];

export type CommandWire = CommandBody & {
  command_id: string;
  device_seq: number;
  created_at: number;
};

export interface PushRequestWire {
  device_id: string;
  commands: CommandWire[];
}

export type CommandResultWire =
  | { command_id: string; status: "accepted"; replayed: boolean }
  | {
      command_id: string;
      status: "rejected";
      code: string;
      replayed: boolean;
      order_id: string;
      snapshot: OrderSnapshotWire | null;
    }
  | { command_id: string; status: "retry"; code: string; expected_seq: number };

export interface PushResponseWire {
  results: CommandResultWire[];
}

export type ChangeWire =
  | { change_seq: string; entity: "order"; data: OrderWire }
  | { change_seq: string; entity: "order_line"; data: OrderLineWire };

export interface PullResponseWire {
  changes: ChangeWire[];
  next_cursor: string;
  has_more: boolean;
}
