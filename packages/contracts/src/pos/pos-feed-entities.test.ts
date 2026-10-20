import { describe, expect, it } from "vitest";
import { posBootstrapSchema } from "./bootstrap-schema";
import { POS_FEED_ENTITY, POS_FEED_SNAPSHOT_SCHEMAS } from "./pos-feed-entities";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const menu = posBootstrapSchema.shape.menu.shape;

describe("the menu and settings entities of the change feed", () => {
  it("parse each copy with the very schema the bootstrap holds it in", () => {
    // A till keeps one copy per entity, whichever way it came; two shapes would drift apart.
    const held = {
      [POS_FEED_ENTITY.product]: menu.products.element,
      [POS_FEED_ENTITY.category]: menu.categories.element,
      [POS_FEED_ENTITY.station]: menu.stations.element,
      [POS_FEED_ENTITY.availability]: menu.availability.element,
      [POS_FEED_ENTITY.priceList]: menu.priceLists.element,
      [POS_FEED_ENTITY.deviceConfig]: posBootstrapSchema.shape.config,
    };
    expect(Object.keys(POS_FEED_SNAPSHOT_SCHEMAS).sort()).toEqual(Object.keys(held).sort());
    for (const [entity, schema] of Object.entries(held)) {
      expect(POS_FEED_SNAPSHOT_SCHEMAS[entity as keyof typeof held]).toBe(schema);
    }
  });

  it("never share a name with the order entities a till already pulls", () => {
    const names = Object.values(POS_FEED_ENTITY);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("order");
    expect(names).not.toContain("shift");
  });

  it("accept a versioned copy and refuse one without the version it is ordered by", () => {
    const station = { id: id(30), version: 57, branchId: id(3), name: "Bar" };
    const schema = POS_FEED_SNAPSHOT_SCHEMAS[POS_FEED_ENTITY.station];
    expect(schema.safeParse(station).success).toBe(true);
    const { version, ...unversioned } = station;
    expect(version).toBe(57);
    expect(schema.safeParse(unversioned).success).toBe(false);
    expect(schema.safeParse({ ...station, version: -1 }).success).toBe(false);
  });
});
