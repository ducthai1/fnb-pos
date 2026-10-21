import type { ApprovalSubject, PermissionAction } from "./authorize";
import {
  type ApprovalFigureKind,
  type ApprovalSubjectKind,
  PERMISSION_DEFINITIONS,
} from "./permission-catalog";

/**
 * What an approval of an action must name and does not: the order (and line) or shift it is
 * for, or the figure the manager agrees to (see PermissionDefinition).
 */
export type MissingApprovalTerm = "subject" | "figure";

/**
 * What an approval of `action` would leave out that its key needs, or null when it names
 * everything. An approval naming no order would cover the same action on any order, and one
 * naming no figure any amount: "Hoàn 25.000 đ cho đơn số 12" spent on 2.000.000 đ of another
 * sale. A subject of the wrong kind (a shift on a refund) counts as missing.
 */
export function missingApprovalTerm(action: PermissionAction): MissingApprovalTerm | null {
  const definition = PERMISSION_DEFINITIONS[action.key];
  if (!subjectFits(definition.subject, action.subject)) return "subject";
  if (!figureNamed(definition.figure, action)) return "figure";
  return null;
}

/** covers, or why not: the approval was for another action or figure, or another subject. */
export type ApprovalJudgement = "covers" | "another_action" | "another_subject";

/**
 * Whether an approval given for `approved` lets `attempted` through. Both must name their
 * subject, the same one, and the same figures to the đồng (an approval for 600.000 đ covers
 * neither 500.000 đ nor 800.000 đ): the manager agreed to what they were shown. The one
 * exception is a discount rate: bound to its order (and line), an approval is "up to" its
 * rate, because another till adding goods to the order lowers the share the same discount
 * takes, which needs no new approval; a higher share was never agreed to. Who approved is not
 * judged again here: that was checked, under lock, when the approval was given.
 */
export function judgeApproval(
  approved: PermissionAction,
  attempted: PermissionAction,
): ApprovalJudgement {
  if (approved.key !== attempted.key) return "another_action";
  const missing = [missingApprovalTerm(approved), missingApprovalTerm(attempted)];
  if (missing.includes("subject") || !sameSubject(approved.subject, attempted.subject)) {
    return "another_subject";
  }
  if (missing.includes("figure")) return "another_action";
  const sameFigures =
    approved.amount === attempted.amount &&
    approved.difference === attempted.difference &&
    approved.refundAmount === attempted.refundAmount &&
    approved.voidedQuantity === attempted.voidedQuantity;
  return sameFigures && rateCovered(approved, attempted) ? "covers" : "another_action";
}

function rateCovered(approved: PermissionAction, attempted: PermissionAction): boolean {
  const given = approved.discountRate;
  const asked = attempted.discountRate;
  if (given === undefined || asked === undefined) return given === asked;
  // Unbound, "up to" would let one approval serve any order; only a bound one is widened.
  const bound = PERMISSION_DEFINITIONS[approved.key].subject !== undefined;
  return bound ? asked <= given : asked === given;
}

function sameSubject(a: ApprovalSubject | undefined, b: ApprovalSubject | undefined): boolean {
  return a?.orderId === b?.orderId && a?.lineId === b?.lineId && a?.shiftId === b?.shiftId;
}

const named = (id: string | undefined): boolean => typeof id === "string" && id.length > 0;

function subjectFits(kind: ApprovalSubjectKind | undefined, subject: ApprovalSubject | undefined) {
  if (kind === undefined) return subject === undefined;
  if (subject === undefined) return false;
  const { orderId, lineId, shiftId } = subject;
  if (kind === "shift") return named(shiftId) && orderId === undefined && lineId === undefined;
  if (shiftId !== undefined || !named(orderId)) return false;
  return kind === "order_line" ? named(lineId) : lineId === undefined;
}

function figureNamed(kind: ApprovalFigureKind | undefined, action: PermissionAction): boolean {
  if (kind === "difference") return action.difference !== undefined;
  if (kind === "refund_amount") return action.refundAmount !== undefined;
  if (kind === "voided_quantity") return action.voidedQuantity !== undefined;
  return true;
}
