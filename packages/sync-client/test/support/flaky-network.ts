import type { HttpSend } from "../../src";
import type { SeededRandom } from "./seeded-random";

/** Chance per request of each fault, drawn independently. */
export interface FaultPlan {
  dropRequest: number;
  /** The server applies the request but the till never hears back: the hardest case. */
  dropResponse: number;
  /** The request reaches the server twice, at the same time. */
  duplicate: number;
  /** The till gives up waiting; the request still arrives, after newer ones. */
  late: number;
  /** A flaky network still lets every few requests through; a cut cable is `online = false`. */
  maxFailuresInARow: number;
}

export const NO_FAULTS: FaultPlan = {
  dropRequest: 0,
  dropResponse: 0,
  duplicate: 0,
  late: 0,
  maxFailuresInARow: 0,
};

const lost = (why: string) => new TypeError(`fetch failed: ${why}`);

/** A till's network between it and the API, failing as the plan says. */
export class FlakyNetwork {
  /** Set to false to pull the cable: requests fail at once, answers on their way are lost. */
  online = true;
  readonly stats = { requests: 0, failed: 0, droppedResponses: 0, duplicated: 0, late: 0 };
  /** "GET /sync/changes?…" for every request the till tried, in order. */
  readonly tried: string[] = [];
  private readonly held: (() => Promise<unknown>)[] = [];
  private readonly travelling = new Set<Promise<unknown>>();
  private failuresInARow = 0;

  constructor(
    private readonly inner: HttpSend,
    private readonly random: SeededRandom,
    private readonly plan: FaultPlan,
  ) {}

  readonly send: HttpSend = async (request) => {
    // Late requests land between newer ones, the way a slow route delivers them.
    const late = this.held.shift();
    if (late !== undefined) this.track(late());
    this.stats.requests += 1;
    this.tried.push(`${request.method} ${request.path}`);
    if (!this.online) throw this.fail("offline");
    const mayFail = this.failuresInARow < this.plan.maxFailuresInARow;
    if (mayFail && this.random.chance(this.plan.dropRequest)) throw this.fail("request lost");
    if (mayFail && this.random.chance(this.plan.late)) {
      this.stats.late += 1;
      this.held.push(() => this.inner(request));
      throw this.fail("timed out, request still travelling");
    }
    if (this.random.chance(this.plan.duplicate)) {
      this.stats.duplicated += 1;
      this.track(this.inner(request));
    }
    const response = await this.inner(request);
    if (mayFail && this.random.chance(this.plan.dropResponse)) {
      this.stats.droppedResponses += 1;
      throw this.fail("response lost");
    }
    if (!this.online) throw this.fail("cable pulled while the answer was on its way");
    this.failuresInARow = 0;
    return response;
  };

  /** Delivers everything still travelling, so a check afterwards sees its effect. */
  async drain(): Promise<void> {
    while (this.held.length > 0 || this.travelling.size > 0) {
      for (let late = this.held.shift(); late !== undefined; late = this.held.shift()) {
        this.track(late());
      }
      await Promise.all([...this.travelling]);
    }
  }

  private fail(why: string): Error {
    this.failuresInARow += 1;
    this.stats.failed += 1;
    return lost(why);
  }

  private track(delivery: Promise<unknown>): void {
    const settled = delivery.catch(() => undefined);
    this.travelling.add(settled);
    void settled.finally(() => this.travelling.delete(settled));
  }
}
