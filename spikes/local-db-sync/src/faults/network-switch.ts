import type { SeededRandom } from "../shared/seeded-random";

export interface NetworkSwitch {
  online: boolean;
}

export interface UnplugPlan {
  times: number;
  gapMs: readonly [number, number];
  downMs: readonly [number, number];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Pulls the cable `times` times at random moments. While it is out, new requests fail at
 * once and responses still in flight are lost: the server may have applied them anyway.
 */
export async function unplugRandomly(
  network: NetworkSwitch,
  random: SeededRandom,
  plan: UnplugPlan,
): Promise<number> {
  let unplugs = 0;
  for (let i = 0; i < plan.times; i += 1) {
    await sleep(random.int(plan.gapMs[0], plan.gapMs[1]));
    network.online = false;
    unplugs += 1;
    await sleep(random.int(plan.downMs[0], plan.downMs[1]));
    network.online = true;
  }
  return unplugs;
}
