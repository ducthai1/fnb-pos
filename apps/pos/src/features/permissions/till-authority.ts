import {
  type AuthorizationResult,
  type Grant,
  type PermissionAction,
  authorize,
  quantityToDecimalString,
} from "@fnb/domain";
import type { ApiResult } from "../api/api-result";
import type { ApprovalRequest } from "../api/pos-api";
import type { BootstrapStaff } from "../bootstrap/bootstrap-source";

/**
 * What the staff member at the till may do, judged on the till by the domain's authorize()
 * with the grants the server sent at sign-in, so the till knows before it records a command
 * whether a manager must agree; the server judges the command again when it arrives.
 */
export interface TillAuthority {
  readonly staffId: string;
  readonly grants: readonly Grant[];
  /**
   * Who may be asked: everyone active at the branch but the person asking. The till does
   * not know other people's roles, so the server says whether the one chosen may approve.
   */
  readonly approvers: readonly BootstrapStaff[];
  decide(action: PermissionAction): AuthorizationResult;
  /** POST /pos/approvals for exactly `action`, its rate, amount or difference included. */
  approve(
    action: PermissionAction,
    approverStaffId: string,
    pin: string,
  ): Promise<ApiResult<string>>;
}

/**
 * The action as the approval route reads it: money as a decimal string, like every amount,
 * units as a decimal quantity, and the order (and line) or shift it is done to.
 */
export function actionOnWire(action: PermissionAction): ApprovalRequest["action"] {
  const { refundAmount, voidedQuantity, subject } = action;
  return {
    key: action.key,
    ...(action.discountRate === undefined ? {} : { discountRate: action.discountRate }),
    ...(action.amount === undefined ? {} : { amount: action.amount.toString() }),
    ...(action.difference === undefined ? {} : { difference: action.difference.toString() }),
    ...(refundAmount === undefined ? {} : { refundAmount: refundAmount.toString() }),
    ...(voidedQuantity === undefined
      ? {}
      : { voidedQuantity: quantityToDecimalString(voidedQuantity) }),
    ...(subject === undefined ? {} : { subject: { ...subject } }),
  };
}

export function tillAuthority(input: {
  staffId: string;
  grants: readonly Grant[];
  staff: readonly BootstrapStaff[];
  requestApproval(request: ApprovalRequest): Promise<ApiResult<string>>;
}): TillAuthority {
  const { staffId, grants } = input;
  return {
    staffId,
    grants,
    approvers: input.staff.filter((member) => member.active && member.id !== staffId),
    // An action without the value its key is judged by is a bug of the till: it throws.
    decide: (action) => authorize(action, grants),
    approve: (action, approverStaffId, pin) =>
      input.requestApproval({ action: actionOnWire(action), approverStaffId, approverPin: pin }),
  };
}
