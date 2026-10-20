import { z } from "zod";
import { quantitySchema } from "../../primitives/quantity-schema";
import { uuidSchema } from "../../primitives/uuid-schema";

/** One line of a printed kitchen ticket, as the till's diffKitchenTicket built it. */
const sentLineSchema = z.object({
  /** For a cancel, the negative line voidLine made; otherwise the item line itself. */
  lineId: uuidSchema,
  kind: z.enum(["new", "cancel", "note_changed"]),
  // A failed quantity transform leaves the value unparsed, so the check guards its type.
  quantity: quantitySchema.refine((units) => typeof units === "bigint" && units > 0n, {
    message: "a ticket line has at least one unit",
  }),
  /** The note as printed, so a note changed after printing goes out again. */
  note: z.string().max(500).nullable(),
});

/**
 * order.mark_sent_to_kitchen: a ticket the till printed, sent only once the printer took
 * it, so a ticket lost to a jammed printer is printed again on the next send instead of
 * being recorded as made. The ticket id is the till's (it is on the slip). A line appears
 * once per kind on a ticket: the same units printed twice would be counted twice.
 */
export const markSentToKitchenPayloadSchema = z
  .object({
    orderId: uuidSchema,
    ticketId: uuidSchema,
    stations: z
      .array(z.object({ stationId: uuidSchema, lines: z.array(sentLineSchema).min(1).max(200) }))
      .min(1)
      .max(20),
  })
  .superRefine((ticket, context) => {
    const seen = new Set<string>();
    for (const [s, station] of ticket.stations.entries()) {
      for (const [l, line] of station.lines.entries()) {
        const key = `${line.lineId}:${line.kind}`;
        if (seen.has(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "a line is printed once per kind on a ticket",
            path: ["stations", s, "lines", l],
          });
        }
        seen.add(key);
      }
    }
  });

export type MarkSentToKitchenPayload = z.infer<typeof markSentToKitchenPayloadSchema>;
export type SentTicketLine = MarkSentToKitchenPayload["stations"][number]["lines"][number];
