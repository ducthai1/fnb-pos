import pg from "pg";
import { quantity, vnd } from "../shared/domain";
import { computeLineTotal } from "../shared/order-rows";
import type {
  CommandWire,
  NewLineWire,
  PullResponseWire,
  PushResponseWire,
} from "../shared/sync-wire-types";
import { uuidV7 } from "../shared/uuid-v7";
import {
  type RunningPostgres,
  makePostgresDir,
  removePostgresDir,
  startEmbeddedPostgres,
} from "./start-embedded-postgres";

/** One Postgres per test file; each test gets its own database so tables never leak. */
export async function startTestPostgres(): Promise<{
  postgres: RunningPostgres;
  freshDatabase: () => Promise<string>;
  stop: () => Promise<void>;
}> {
  const dir = makePostgresDir("test");
  const postgres = await startEmbeddedPostgres(dir, { fsync: false });
  let counter = 0;
  return {
    postgres,
    freshDatabase: async () => {
      counter += 1;
      const name = `spike_${counter}`;
      const admin = new pg.Client({ connectionString: postgres.connectionString });
      await admin.connect();
      await admin.query(`CREATE DATABASE ${name}`);
      await admin.end();
      return postgres.connectionString.replace(/\/postgres$/, `/${name}`);
    },
    stop: async () => {
      await postgres.stop();
      removePostgresDir(dir);
    },
  };
}

export function coffeeLine(): NewLineWire {
  return {
    id: uuidV7(),
    item_id: "cf-sua-da",
    name: "Cà phê sữa đá",
    qty_thousandths: quantity("2").toString(),
    unit_price_vnd: "29000",
  };
}

export function createCommand(
  seq: number,
  orderId = uuidV7(),
  clientTotal = "58000",
  businessDate = "2026-10-20",
): CommandWire {
  return {
    command_id: uuidV7(),
    device_seq: seq,
    created_at: 0,
    type: "order.create",
    payload: {
      order_id: orderId,
      business_date: businessDate,
      lines: [coffeeLine()],
      client_total_vnd: clientTotal,
    },
  };
}

export function addLineCommand(seq: number, orderId: string): CommandWire {
  const line = coffeeLine();
  const total = computeLineTotal(vnd(BigInt(line.unit_price_vnd)), quantity("2"));
  return {
    command_id: uuidV7(),
    device_seq: seq,
    created_at: 0,
    type: "order.add_line",
    payload: { order_id: orderId, line, client_line_total_vnd: total.toString() },
  };
}

export function payCommand(seq: number, orderId: string, clientTotal: string): CommandWire {
  return {
    command_id: uuidV7(),
    device_seq: seq,
    created_at: 0,
    type: "order.pay",
    payload: { order_id: orderId, client_total_vnd: clientTotal },
  };
}

export async function push(
  url: string,
  deviceId: string,
  commands: CommandWire[],
): Promise<PushResponseWire> {
  const response = await fetch(`${url}/commands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, commands }),
  });
  if (!response.ok) throw new Error(`push failed with HTTP ${response.status}`);
  return (await response.json()) as PushResponseWire;
}

export async function pull(url: string, cursor: string, limit = 1000): Promise<PullResponseWire> {
  const response = await fetch(`${url}/changes?cursor=${cursor}&limit=${limit}`);
  return (await response.json()) as PullResponseWire;
}
