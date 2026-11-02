import { dismissRejectionCommand } from "../../../../apps/pos/src/features/sync/dismiss-rejection-command";
import { managerApproves } from "./approvals";
import type { DayContext } from "./day-context";
import type { SimDevice } from "./simulated-shop";
import { moveCash } from "./sim-commands";
import { screenOf } from "./till-screen";

/** More than a cashier moves alone in a shift (500.000 đ), so the server wants a manager. */
const PAST_THE_CAP = 900_000;

const refusalOf = async (device: SimDevice, commandId: string) =>
  (await device.till.client.rejectedCommands()).find(
    (entry) => entry.command.commandId === commandId,
  );

/**
 * A cashier keys a large cash move without the manager the till would ask for (a till of an
 * older build does not ask): the server refuses it and the drawer's book is untouched; no
 * money left the drawer. The cashier first tries to set the refusal aside alone, as that
 * older till lets them: the server refuses that too. A manager then approves setting it aside
 * for that very shift (open_drawer), and the cashier sets aside both refusals. False: the
 * till has no shift open yet, try later.
 */
export async function cashMovePastTheCap(ctx: DayContext, device: SimDevice): Promise<boolean> {
  const shiftId = device.shiftId;
  if (shiftId === null || device.staff.manager) return false;
  const move = moveCash(shiftId, "out", PAST_THE_CAP, "Trả tiền hàng cho nhà cung cấp");
  ctx.books.meantToBeRefused.add(move.commandId);
  await ctx.send(device, move);
  const reason = { code: "handled_by_hand" as const, note: "Chưa chi, quản lý chi lại sau" };
  ctx.after(3, `${device.name} sets the refused cash move aside alone`, async () => {
    const refused = await refusalOf(device, move.commandId);
    if (refused === undefined) return false;
    const { place } = await screenOf(ctx, device);
    const alone = dismissRejectionCommand(place, refused, reason, ctx.now() + device.skewMs, {
      shiftId,
    });
    ctx.books.meantToBeRefused.add(alone.commandId);
    ctx.books.unapprovedDismissals.push(alone.commandId);
    await ctx.send(device, alone);
    ctx.after(3, `a manager sets aside the refused cash move of ${device.name}`, async () => {
      const refusedAlone = await refusalOf(device, alone.commandId);
      if (refusedAlone === undefined) return false;
      const approvalId = await managerApproves(ctx, device, {
        key: "open_drawer",
        subject: { shiftId },
      });
      if (approvalId === null) return false;
      const at = ctx.now() + device.skewMs;
      await ctx.send(
        device,
        dismissRejectionCommand(place, refused, reason, at, { shiftId, approvalId }),
      );
      await device.till.client.resolveRejected(move.commandId);
      // The refused attempt moved no money: anyone sets it aside with a reason.
      const noMoney = { code: "handled_by_hand" as const, note: "Quản lý đã duyệt bỏ qua" };
      await ctx.send(device, dismissRejectionCommand(place, refusedAlone, noMoney, at));
      await device.till.client.resolveRejected(alone.commandId);
      ctx.books.dismissed += 2;
      ctx.books.shiftDismissals.push(move.commandId);
      return true;
    });
    return true;
  });
  return true;
}
