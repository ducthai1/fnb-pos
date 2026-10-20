import type { EntitySnapshot } from "@fnb/contracts";
import { DOMAIN_VERSION, type Vnd, businessDate } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import { newId } from "../ids/new-id";

/** Where the till sells: what every command it records is stamped with. */
export interface TillPlace {
  readonly deviceId: string;
  readonly branchId: string;
  readonly utcOffsetMinutes: number;
  readonly businessDayStartMinute: number;
}

interface PayloadContract {
  safeParse(value: unknown): { success: boolean };
}

/** A command whose payload breaks its contract: a bug on the till, never sent. */
export class InvalidPayloadError extends Error {
  constructor(readonly commandType: string) {
    super(`${commandType}: the payload breaks its contract`);
    this.name = "InvalidPayloadError";
  }
}

/** Money as the wire carries it: whole đồng as a JSON number. */
export function moneyToWire(amount: Vnd): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new RangeError(`amount out of safe range: ${amount}`);
  return value;
}

/** The sale's day: before the branch's day start it still counts toward the day before. */
export function businessDateAt(place: TillPlace, at: number): string {
  return businessDate(at, {
    utcOffsetMinutes: place.utcOffsetMinutes,
    dayStartMinute: place.businessDayStartMinute,
  });
}

/**
 * A command as the outbox records it, its payload checked against the command's contract
 * first: the server would refuse a malformed one, and it would sit in "needs attention".
 */
export function tillCommand(
  place: TillPlace,
  type: string,
  contract: PayloadContract,
  payload: Record<string, unknown>,
  at: number,
  target: { entity: string; entityId: string; optimistic: EntitySnapshot },
): LocalCommand {
  if (!contract.safeParse(payload).success) throw new InvalidPayloadError(type);
  return {
    commandId: newId(),
    type,
    payload,
    businessDate: businessDateAt(place, at),
    domainVersion: DOMAIN_VERSION,
    createdAt: new Date(at).toISOString(),
    target,
  };
}
