import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addQuantity, quantity } from "../money";
import { reversedQuantityOf } from "../order";
import { order as draft } from "../order/order-line-test-fixtures";
import type { Order } from "../order/order-types";
import { byProduct, cancel, dish, editLine, send } from "./kitchen-test-fixtures";
import type { SentLineState } from "./kitchen-ticket-types";

const ITEMS = ["tea", "cake", "water"] as const;
type Step =
  | { kind: "add"; item: number; units: number }
  | { kind: "void"; item: number; units: number }
  | { kind: "note"; item: number; note: string | null }
  | { kind: "send" }
  | { kind: "failed_send" };

const item = fc.nat({ max: 2 });
const units = fc.integer({ min: 1, max: 3 });
const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant("add" as const), item, units }),
  fc.record({ kind: fc.constant("void" as const), item, units }),
  fc.record({
    kind: fc.constant("note" as const),
    item,
    note: fc.constantFrom(null, "less ice", "no sugar"),
  }),
  fc.record({ kind: fc.constant("send" as const) }),
  fc.record({ kind: fc.constant("failed_send" as const) }),
);

const unitsOf = (o: Order, id: string) => o.lines.find((l) => l.id === id)?.quantity ?? quantity(0);
const netOf = (o: Order, id: string) => unitsOf(o, id) - reversedQuantityOf(o.lines, id);

describe("kitchen tickets over random rounds of edits, voids and sends", () => {
  it("never prints twice, and what the stations were told adds up to the order", () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 25 }), (steps) => {
        let current: Order = draft(ITEMS.map((id) => dish(id, 1)));
        let state: readonly SentLineState[] = [];
        const made = new Map<string, bigint>();
        const stopped = new Map<string, bigint>();
        const record = (diff: ReturnType<typeof send>) => {
          for (const ticket of diff.tickets) {
            expect(ticket.lines.length).toBeGreaterThan(0);
            for (const line of ticket.lines) {
              const original = line.cancelsLineId ?? line.lineId;
              expect(ticket.stationId).toBe(
                byProduct(current.lines.find((l) => l.id === original)!),
              );
              expect(line.quantity > 0n).toBe(true);
              const book = line.kind === "new" ? made : line.kind === "cancel" ? stopped : null;
              book?.set(original, (book.get(original) ?? 0n) + line.quantity);
            }
          }
          state = diff.sentState;
        };
        const apply = (s: Step) => {
          if (s.kind === "send") return record(send(current, state));
          // A print that failed: the diff is made, and its sent state is thrown away.
          if (s.kind === "failed_send") return void send(current, state);
          const id = ITEMS[s.item] ?? "tea";
          if (s.kind === "note") return void (current = editLine(current, id, { note: s.note }));
          const n = quantity(s.units);
          if (s.kind === "add") {
            current = editLine(current, id, { quantity: addQuantity(unitsOf(current, id), n) });
          } else if (netOf(current, id) >= n) {
            current = cancel(current, state, id, s.units).order;
          }
        };
        for (const s of [...steps, { kind: "send" } as const]) {
          apply(s);
          // Sending again with nothing changed prints nothing, whatever happened before.
          expect(send(current, send(current, state).sentState).tickets).toEqual([]);
        }
        for (const id of ["tea", "cake"]) {
          expect(made.get(id) ?? 0n).toBe(unitsOf(current, id));
          expect(stopped.get(id) ?? 0n).toBe(reversedQuantityOf(current.lines, id));
        }
        expect([made.get("water"), stopped.get("water")]).toEqual([undefined, undefined]);
      }),
      { numRuns: 300 },
    );
  });
});
