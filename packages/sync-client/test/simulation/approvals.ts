import type { LocalCommand } from "../../src";
import type { DayContext } from "./day-context";
import type { SimDevice } from "./simulated-shop";

/** What a manager is asked to approve: the same words the approval sheet sends. */
export interface ApprovalAction {
  readonly key: string;
  readonly discountRate?: number;
  readonly refundAmount?: string;
  readonly voidedQuantity?: string;
  readonly subject: { readonly orderId: string; readonly lineId?: string };
}

/** A manager at the till types their PIN: the approval's id, or null when the till cannot reach the server. */
export async function managerApproves(
  ctx: DayContext,
  device: SimDevice,
  action: ApprovalAction,
): Promise<string | null> {
  // Nobody can be asked over a network that is down: the cashier waits for it.
  if (!device.till.network.online) return null;
  const manager = ctx.shop.devices.find((other) => other.staff.manager)?.staff;
  if (manager === undefined) throw new Error("the shop has no manager to approve");
  const answer = await ctx.shop.server.send({
    method: "POST",
    path: "/pos/approvals",
    headers: {
      authorization: `Device ${device.record.deviceToken}`,
      "x-staff-session": device.record.staffToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action, approverStaffId: manager.id, approverPin: manager.pin }),
  });
  if (answer.status !== 201) {
    throw new Error(
      `${device.name}: the approval of ${action.key} answered ${answer.status} ${answer.body}`,
    );
  }
  ctx.books.approvalsGiven += 1;
  return (JSON.parse(answer.body) as { approvalId: string }).approvalId;
}

/**
 * Records `command` at `device`; a cashier's goes with a manager's approval of `action`, as
 * the till's approval sheet obtains it first. False: nothing was recorded (the cashier could
 * not reach a manager) and the action is to be tried again later.
 */
export async function sendApproved(
  ctx: DayContext,
  device: SimDevice,
  command: LocalCommand,
  action: ApprovalAction,
): Promise<boolean> {
  if (device.staff.manager) {
    await ctx.send(device, command);
    return true;
  }
  const approvalId = await managerApproves(ctx, device, action);
  if (approvalId === null) return false;
  await ctx.send(device, { ...command, payload: { ...command.payload, approvalId } });
  return true;
}
