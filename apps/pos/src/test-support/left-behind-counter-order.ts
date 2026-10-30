import type { SyncCommandEnvelope } from "@fnb/contracts";
import { DOMAIN_VERSION } from "@fnb/domain";
import { businessDateAt } from "../features/order/till-command";
import { CREDENTIAL } from "./fake-pos-server";
import { MENU, tid } from "./till-fixtures";
import type { TableServer } from "./table-cafe-server";

let seeded = 0;

/**
 * A counter order of this till that was never paid (a reload happened under it): saved with
 * `coffees` milk coffees, and carried to the till by the change feed as the server stores it.
 */
export function counterOrderLeftBehind(
  server: TableServer,
  options: { coffees?: number; deviceOrderNo?: number; businessDate?: string } = {},
) {
  seeded += 1;
  const orderId = tid(0xa000 + seeded);
  const deviceOrderNo = options.deviceOrderNo ?? seeded;
  const place = {
    deviceId: CREDENTIAL.deviceId,
    branchId: CREDENTIAL.branchId,
    utcOffsetMinutes: 420,
    businessDayStartMinute: 240,
  };
  const command: SyncCommandEnvelope = {
    commandId: tid(0xa200 + seeded),
    deviceSeq: 500 + seeded,
    type: "order.save_draft",
    payload: {
      orderId,
      deviceOrderNo,
      serviceType: "takeaway",
      channelKey: null,
      tableId: null,
      tableTag: null,
      lines: [
        {
          lineId: tid(0xa100 + seeded),
          productId: MENU.coffee,
          variantId: null,
          modifiers: [],
          quantity: String(options.coffees ?? 2),
          note: null,
        },
      ],
    },
    businessDate: options.businessDate ?? businessDateAt(place, Date.now()),
    domainVersion: DOMAIN_VERSION,
    createdAt: new Date().toISOString(),
  };
  const answered = server.answer(command);
  if (answered === undefined) throw new Error("the fake server did not store the order");
  const row = { ...answered, deviceId: CREDENTIAL.deviceId };
  server.rows.set(orderId, row);
  server.state.feed.push({ entity: "order", entityId: orderId, snapshot: row });
  return { orderId, deviceOrderNo };
}
