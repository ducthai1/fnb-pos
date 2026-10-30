import type { EntitySnapshot } from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import type { LocalCommand, RejectedCommand } from "@fnb/sync-client";
import { describe, expect, it } from "vitest";
import { PLACE } from "../../test-support/paid-sale-fixture";
import { tid } from "../../test-support/till-fixtures";
import {
  BEANS,
  BIRTHDAY_CAKE,
  typedAndWeighedBootstrap,
} from "../../test-support/typed-and-weighed-menu";
import { NO_MENU_COPIES, buildTillMenu } from "../menu/till-menu";
import type { CounterOrder } from "../order/counter-order";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import { priceCounterOrder } from "../order/price-counter-order";
import { draftPayload } from "../order/save-draft-command";
import { ORDER_VERSION_STALE } from "../table-order/redo-stale-draft";
import { redoRefusedDraft } from "./redo-refused-draft";

const AT = Date.UTC(2026, 9, 20, 3, 0);
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };
const MENU = buildTillMenu(typedAndWeighedBootstrap(), NO_MENU_COPIES, new Set());

const order = (lines: CounterOrder["lines"]): CounterOrder => ({
  orderId: tid(0x900),
  deviceOrderNo: 7,
  serviceType: "dine_in",
  tableTag: null,
  table: { id: tid(0x710), name: "5" },
  lines,
});
const beans = {
  lineId: tid(0x901),
  productId: BEANS.id,
  grams: 351,
  variantId: null,
  modifiers: [],
  quantity: 1,
  note: null,
};
const cake = {
  lineId: tid(0x902),
  productId: BIRTHDAY_CAKE.id,
  enteredPrice: vnd(180_000),
  variantId: null,
  modifiers: [],
  quantity: 1,
  note: null,
};

/** The order as the server holds it at `version`, in `status`, with `lines`. */
const serverRow = (
  lines: CounterOrder["lines"],
  status: "draft" | "paid" | "cancelled",
  version = 5,
) => {
  const placed = order(lines);
  return tillOrderSnapshot(PLACE, placed, priceCounterOrder(MENU, placed, PROFILE, AT), {
    status,
    version,
    businessDate: "2026-10-20",
    chargeProfile: PROFILE,
    payments: [],
    sent: [],
  });
};

/** A draft of beans and a cake that the server refused because another till got in first. */
const refused = (): RejectedCommand =>
  ({
    entity: "order",
    entityId: tid(0x900),
    code: ORDER_VERSION_STALE,
    serverSnapshot: null,
    command: {
      commandId: tid(0xc01),
      type: "order.save_draft",
      payload: draftPayload(
        order([beans, cake]),
        priceCounterOrder(MENU, order([beans, cake]), PROFILE, AT),
      ),
    },
  }) as unknown as RejectedCommand;

/** A ticket for the cake the printer took, which the server refused to record: no cake yet. */
const refusedTicket = (kind: "new" | "cancel" = "new"): RejectedCommand =>
  ({
    entity: "order",
    entityId: tid(0x900),
    code: "SYNC_KITCHEN_NOT_OWED",
    serverSnapshot: null,
    command: {
      commandId: tid(0xc02),
      type: "order.mark_sent_to_kitchen",
      payload: {
        orderId: tid(0x900),
        ticketId: tid(0xc03),
        stations: [
          {
            stationId: tid(0xc04),
            lines: [{ lineId: cake.lineId, kind, quantity: "1", note: null }],
          },
        ],
      },
    },
  }) as unknown as RejectedCommand;

function clientHolding(row: EntitySnapshot | null, refusals: RejectedCommand[] = []) {
  const enqueued: LocalCommand[] = [];
  const resolved: string[] = [];
  return {
    enqueued,
    resolved,
    client: {
      rejectedCommands: async () => refusals,
      resolveRejected: async (commandId: string) => {
        resolved.push(commandId);
        return true;
      },
      snapshot: async () =>
        row === null
          ? null
          : {
              entity: "order",
              entityId: tid(0x900),
              snapshot: row,
              source: "server" as const,
              serverVersion: 5,
            },
      enqueue: async (command: LocalCommand) => {
        enqueued.push(command);
        return command as never;
      },
    },
  };
}

describe("saving a refused draft again over the order as the server holds it", () => {
  it("adds what this till put in that the server lacks, keeping what the server has", async () => {
    const held = clientHolding(serverRow([beans], "draft"));
    expect(await redoRefusedDraft(held.client, PLACE, MENU, refused(), AT)).toBe("sent");
    expect(held.enqueued).toHaveLength(1);
    const lines = (held.enqueued[0]?.payload as { lines: { lineId: string }[] }).lines;
    expect(lines.map((line) => line.lineId)).toEqual([beans.lineId, cake.lineId]);
    expect(held.enqueued[0]?.payload).toMatchObject({ expectedVersion: 5 });
  });

  it("records the ticket the stations hold for an item it saves, and takes its refusal off", async () => {
    const held = clientHolding(serverRow([beans], "draft"), [refusedTicket()]);
    expect(await redoRefusedDraft(held.client, PLACE, MENU, refused(), AT)).toBe("sent");
    expect(held.enqueued.map((command) => command.type)).toEqual([
      "order.save_draft",
      "order.mark_sent_to_kitchen",
    ]);
    expect(held.enqueued[1]?.payload).toMatchObject({
      ticketId: tid(0xc03),
      stations: [{ lines: [{ lineId: cake.lineId, kind: "new", quantity: "1" }] }],
    });
    expect(held.resolved).toEqual([tid(0xc02)]);
  });

  it("leaves the refusal of a cancel ticket to be read, not recorded again", async () => {
    const held = clientHolding(serverRow([beans], "draft"), [refusedTicket("cancel")]);
    await redoRefusedDraft(held.client, PLACE, MENU, refused(), AT);
    expect(held.enqueued.map((command) => command.type)).toEqual(["order.save_draft"]);
    expect(held.resolved).toEqual([]);
  });

  it("sends nothing when the server already has every item", async () => {
    const held = clientHolding(serverRow([beans, cake], "draft"));
    expect(await redoRefusedDraft(held.client, PLACE, MENU, refused(), AT)).toBe("nothing_to_add");
    expect(held.enqueued).toHaveLength(0);
  });

  it.each(["paid", "cancelled"] as const)(
    "sends nothing to an order paid or cancelled elsewhere (%s)",
    async (status) => {
      const held = clientHolding(serverRow([beans], status));
      expect(await redoRefusedDraft(held.client, PLACE, MENU, refused(), AT)).toBe("not_a_draft");
      expect(held.enqueued).toHaveLength(0);
    },
  );

  it("waits for a server copy when the till has none", async () => {
    const held = clientHolding(null);
    expect(await redoRefusedDraft(held.client, PLACE, MENU, refused(), AT)).toBe("no_server_copy");
  });
});
