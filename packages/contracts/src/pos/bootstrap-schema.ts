import { z } from "zod";
import { countSchema, idSchema } from "../catalog/catalog-schema-parts";
import { posDeviceConfigSchema } from "./pos-device-config-schema";
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

const staffMemberSchema = z
  .object({ id: idSchema, displayName: shownNameSchema, active: z.boolean() })
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
    staff: z.array(staffMemberSchema),
    menu: z
      .object({
        categories: z.array(posCategorySchema),
        stations: z.array(posStationSchema),
        products: z.array(posProductSchema),
        priceLists: z.array(posPriceListSchema),
        availability: z.array(posAvailabilitySchema),
      })
      .strict(),
  })
  .strict();

export type PosBootstrap = z.output<typeof posBootstrapSchema>;
/** What GET /pos/bootstrap sends. */
export type PosBootstrapWire = z.input<typeof posBootstrapSchema>;
