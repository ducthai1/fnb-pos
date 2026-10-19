import { readConfigLayersForDevice } from "@fnb/db";
import { type Vnd, vnd } from "@fnb/domain";
import { resolveConfig } from "@fnb/feature-flags";
import type pg from "pg";

/**
 * How far, in đồng either way, a counted drawer may be off before someone holding
 * accept_close_difference has to accept it. Stored as a decimal string, like every money
 * setting, at the brand, branch or till.
 */
export const CLOSE_DIFFERENCE_TOLERANCE_KEY = "shift_close_difference_tolerance";

// Zero by default: until a shop says how much it tolerates, every difference is looked at.
const SYSTEM_DEFAULTS = { [CLOSE_DIFFERENCE_TOLERANCE_KEY]: "0" };

const WHOLE_DONG = /^(0|[1-9]\d{0,17})$/;

/** The tolerance that applies to this till; a setting that is not an amount is corrupt data. */
export async function readCloseDifferenceTolerance(
  client: pg.ClientBase,
  deviceId: string,
): Promise<Vnd> {
  const layers = await readConfigLayersForDevice(client, deviceId);
  const { value } = resolveConfig(CLOSE_DIFFERENCE_TOLERANCE_KEY, {
    system: SYSTEM_DEFAULTS,
    brand: layers.brand,
    branch: layers.branch,
    device: layers.device,
  });
  if (typeof value !== "string" || !WHOLE_DONG.test(value)) {
    throw new Error(`${CLOSE_DIFFERENCE_TOLERANCE_KEY} is not an amount: ${JSON.stringify(value)}`);
  }
  return vnd(BigInt(value));
}
