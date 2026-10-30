import { SYNC_ORDER_VERSION_ERROR_CODES, saveDraftPayloadSchema } from "@fnb/contracts";
import { pick } from "../support/order-commands";
import type { DayContext } from "./day-context";
import { addItems } from "./table-service";

/**
 * A draft the server refused because another till changed the table first: the cashier's
 * till takes the refusal off the list and saves again what that draft added over the
 * server's newer copy, as the POS does. Refusals of this kind are expected and counted.
 */
export async function redoStaleDrafts(ctx: DayContext): Promise<void> {
  for (const device of ctx.shop.devices) {
    for (const refused of await device.till.client.rejectedCommands()) {
      const { command, code, entityId } = refused;
      if (
        command.type !== "order.save_draft" ||
        code !== SYNC_ORDER_VERSION_ERROR_CODES.orderVersionStale
      )
        continue;
      const order = ctx.books.orders.get(entityId);
      const payload = saveDraftPayloadSchema.safeParse(command.payload);
      if (order === undefined || !payload.success) continue;
      // Saved again over the server's copy, so it waits until none of the till's commands wait.
      const view = await ctx.openable(device, entityId);
      if (view === null) continue;
      ctx.books.meantToBeRefused.add(command.commandId);
      await device.till.client.resolveRejected(command.commandId);
      if (view.status !== "draft") continue;
      const have = new Set(view.lines.map((line) => line.id));
      const missing = payload.data.lines
        .filter((line) => !have.has(line.lineId))
        .map((line) =>
          pick(line.productId, 0, {
            lineId: line.lineId,
            variantId: line.variantId,
            quantity: line.quantity,
            note: line.note,
            modifiers: line.modifiers.map((modifier) => ({ ...modifier, shownPrice: 0 })),
          }),
        );
      if (missing.length > 0) await addItems(ctx, device, order, missing);
    }
  }
}
