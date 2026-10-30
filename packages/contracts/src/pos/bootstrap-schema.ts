import { z } from "zod";
import { countSchema, idSchema } from "../catalog/catalog-schema-parts";
import { entitySnapshotSchema } from "../sync/entity-snapshot-schema";
import { posDeviceConfigSchema } from "./pos-device-config-schema";
import { posFloorPlanSchema } from "./pos-floor-schemas";
import { feedCursorSchema } from "./pos-feed-version-schema";
import {
  posAvailabilitySchema,
  posCategorySchema,
  posPriceListSchema,
  posStationSchema,
} from "./pos-menu-schemas";
import { posProductSchema } from "./pos-product-schema";

/*
 * Names of shops, branches, tills and staff are shown as typed; the backoffice decides
 * their limits, and a till must not refuse its whole start-up over a long branch name.
 */
const shownNameSchema = z.string();

/**
 * Someone who may sign in at the branch's tills. Only staff still allowed to sign in are
 * sent; `active` stays for tills that look at it.
 */
export const posStaffMemberSchema = z
  .object({ id: idSchema, displayName: shownNameSchema, active: z.boolean() })
  .strict();

/**
 * The change feed entity of a staff member at a branch, by the staff id: the copy as the
 * bootstrap sends it with the staff row's version, which orders copies of one person, or
 * null once they may no longer sign in there (locked).
 */
export const STAFF_MEMBER_ENTITY = "staff_member";

export const posStaffMemberCopySchema = posStaffMemberSchema
  .extend({ version: z.number().int().nonnegative() })
  .strict();

/**
 * The place of a till among its branch's tills for calling numbers: its index (1 to 9, the
 * hundreds digit) when it has one, and how many tills of the branch have one. Calls carry
 * the index from two tills on; one till keeps the plain numbers 1 to 99.
 */
export const posCallNumberingSchema = z
  .object({
    deviceIndex: z.number().int().min(1).max(9).nullable(),
    tillsInBranch: z.number().int().min(1),
  })
  .strict();

/**
 * Everything a till needs to start selling, read as of one moment: who and where it is,
 * its settings, who may sign in on it (the PIN screen lists them before anyone has signed
 * in), and its brand's whole menu as the domain prices it. Every copy is versioned by
 * `cursor`, and the till pulls the change feed from `cursor` on, so nothing that changed
 * after the read is missed. Objects are strict: a field the contract does not name (a
 * stored PIN hash, a credential) fails the parse instead of reaching the till's storage.
 */
export const posBootstrapSchema = z
  .object({
    cursor: feedCursorSchema,
    device: z.object({ id: idSchema, name: shownNameSchema, branchId: idSchema }).strict(),
    branch: z
      .object({
        id: idSchema,
        brandId: idSchema,
        name: shownNameSchema,
        /** The branch's local time is UTC plus this; Vietnam is 420. */
        utcOffsetMinutes: countSchema,
        /** Local minute the business day starts at: sales before it count for the day before. */
        businessDayStartMinute: countSchema,
      })
      .strict(),
    brand: z.object({ id: idSchema, name: shownNameSchema }).strict(),
    config: posDeviceConfigSchema,
    staff: z.array(posStaffMemberSchema),
    menu: z
      .object({
        categories: z.array(posCategorySchema),
        stations: z.array(posStationSchema),
        products: z.array(posProductSchema),
        priceLists: z.array(posPriceListSchema),
        availability: z.array(posAvailabilitySchema),
      })
      .strict(),
    /**
     * The branch's drafts still open, each the change feed's order snapshot: a till paired
     * while guests sit at a table can open their order. Optional for servers that send none.
     */
    openOrders: z.array(entitySnapshotSchema).optional(),
    /** The branch's floor plan, kept current by the floor_area and floor_table feed. */
    floor: posFloorPlanSchema.optional(),
    /**
     * How this till numbers the drinks it calls out, sent only to a till that asks for it
     * (the `call-numbering` query): a till of an older release parses this object strictly
     * and would refuse an answer that names a field it does not know.
     */
    callNumbering: posCallNumberingSchema.optional(),
  })
  .strict();

export type PosBootstrap = z.output<typeof posBootstrapSchema>;
/** What GET /pos/bootstrap sends. */
export type PosBootstrapWire = z.input<typeof posBootstrapSchema>;
