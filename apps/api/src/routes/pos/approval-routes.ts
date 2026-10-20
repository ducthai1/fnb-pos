import { appendAudit, recordApproval, withTenant } from "@fnb/db";
import {
  type BasisPoints,
  PERMISSION_DEFINITIONS,
  type PermissionAction,
  authorize,
  canApprove,
  isPermissionKey,
  vnd,
} from "@fnb/domain";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { deviceAuth } from "../../devices/device-auth-hook";
import {
  APPROVAL_ERROR_CODES,
  PERMISSION_ERROR_CODES,
  clientPermissionErrorCode,
} from "../../permissions/permission-error-codes";
import { loadRoleGrants } from "../../permissions/role-grants-store";
import { verifySecret } from "../../security/secret-hash";
import { STAFF_SESSION_HEADER, findCurrentStaffSession } from "../../staff/current-staff-session";
import { claimPinAttempt, clearPinAttempts, refusePinGate } from "../../staff/pin-attempt-gate";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";
import { uuidJsonSchema } from "../../http/uuid-schema";

interface ApprovalBody {
  action: { key: string; discountRate?: number; amount?: string; difference?: string };
  approverStaffId: string;
  approverPin: string;
}

const approvalBody = {
  type: "object",
  additionalProperties: false,
  required: ["action", "approverStaffId", "approverPin"],
  properties: {
    action: {
      type: "object",
      additionalProperties: false,
      required: ["key"],
      properties: {
        key: { type: "string", maxLength: 64 },
        discountRate: { type: "integer" },
        // Money travels as a decimal string: a JSON number rounds past 2^53.
        amount: { type: "string", pattern: "^(0|[1-9][0-9]{0,18})$" },
        // A close difference is signed: counted − expected, short below zero.
        difference: { type: "string", pattern: "^(0|-?[1-9][0-9]{0,18})$" },
      },
    },
    approverStaffId: uuidJsonSchema,
    approverPin: { type: "string", maxLength: 16 },
  },
} as const;

/**
 * A manager standing at the till approves, with their PIN, an action the signed-in staff
 * member may not do alone. Every refusal that does not depend on the approver's PIN is
 * answered before an attempt is counted, so a request that could never succeed cannot be
 * used to lock a manager out. What the approver may do is checked only after the PIN,
 * so the endpoint does not tell anyone without it who can approve what.
 */
export function registerApprovalRoutes(app: FastifyInstance, context: ApiContext): void {
  const { pool, clock, policy } = context;

  app.post<{ Body: ApprovalBody }>(
    "/pos/approvals",
    { onRequest: context.requireDevice, schema: { body: approvalBody } },
    async (request, reply) => {
      const device = deviceAuth(request);
      const now = clock.now();
      const { action: sent, approverStaffId, approverPin } = request.body;
      const requester = await withTenant(pool, device.tenantId, (client) =>
        findCurrentStaffSession(client, device, request.headers[STAFF_SESSION_HEADER], now),
      );
      if (requester === undefined) {
        return reply.code(401).send({ code: STAFF_ERROR_CODES.sessionInvalid });
      }
      if (!isPermissionKey(sent.key)) {
        return reply.code(400).send({ code: PERMISSION_ERROR_CODES.unknownKey });
      }
      // The rate is branded unchecked here: authorize, just below, is what range-checks it
      // and answers with the permissions code a bad action gets.
      const action: PermissionAction = {
        key: sent.key,
        ...(sent.discountRate === undefined
          ? {}
          : { discountRate: sent.discountRate as BasisPoints }),
        ...(sent.amount === undefined ? {} : { amount: vnd(BigInt(sent.amount)) }),
        ...(sent.difference === undefined ? {} : { difference: vnd(BigInt(sent.difference)) }),
      };
      try {
        // With no grants this only checks the action carries the value its key needs.
        authorize(action, []);
      } catch (error) {
        const code = clientPermissionErrorCode(error);
        if (code === null) throw error;
        return reply.code(400).send({ code });
      }
      if (!PERMISSION_DEFINITIONS[action.key].approvable) {
        return reply.code(403).send({ code: APPROVAL_ERROR_CODES.notApprovable });
      }
      if (approverStaffId === requester.staffId) {
        return reply.code(403).send({ code: APPROVAL_ERROR_CODES.selfApproval });
      }
      const gate = await claimPinAttempt(pool, device, approverStaffId, now, policy.pin);
      if (gate.kind !== "allowed") return refusePinGate(reply, gate, now);
      if (!(await verifySecret(approverPin, gate.pinHash))) {
        return reply.code(401).send({ code: STAFF_ERROR_CODES.pinInvalid });
      }
      const approvalId = await withTenant(pool, device.tenantId, async (client) => {
        await clearPinAttempts(client, approverStaffId, gate.claimedAttempts);
        // Read in the transaction that records the approval, so a role narrowed a moment
        // ago is the role that is judged.
        if (!canApprove(action, await loadRoleGrants(client, gate.roleId))) return null;
        const id = await recordApproval(client, {
          actionKey: action.key,
          requestedByStaffId: requester.staffId,
          approvedByStaffId: approverStaffId,
          deviceId: device.deviceId,
          branchId: device.branchId,
          payload: {
            discountRate: action.discountRate,
            amount: action.amount,
            difference: action.difference,
          },
          createdAt: now,
        });
        await appendAudit(client, {
          actor: { kind: "staff", id: approverStaffId },
          action: "approval.granted",
          entityKind: "approval",
          entityId: id,
          payload: { actionKey: action.key, requestedByStaffId: requester.staffId },
        });
        return id;
      });
      if (approvalId === null) {
        return reply.code(403).send({ code: APPROVAL_ERROR_CODES.approverNotPermitted });
      }
      return reply.code(201).send({ approvalId });
    },
  );
}
