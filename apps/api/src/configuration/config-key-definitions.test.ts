import { CONFIG_SETTING_DEFAULTS, FEATURE_FLAG_KEYS, configDefaults } from "@fnb/feature-flags";
import { describe, expect, it } from "vitest";
import { CLOSE_DIFFERENCE_TOLERANCE_KEY } from "../sync/close-difference-tolerance";
import { CONFIG_KEY_DEFINITIONS, layerMaySet, systemLayer } from "./config-key-definitions";

const definition = (key: string) => {
  const found = CONFIG_KEY_DEFINITIONS.get(key);
  if (found === undefined) throw new Error(`no definition for ${key}`);
  return found;
};

describe("the keys the settings routes take", () => {
  it("are every switch, every catalog setting and the drawer tolerance, and nothing else", () => {
    expect([...CONFIG_KEY_DEFINITIONS.keys()]).toEqual([
      ...FEATURE_FLAG_KEYS,
      ...Object.keys(CONFIG_SETTING_DEFAULTS),
      CLOSE_DIFFERENCE_TOLERANCE_KEY,
    ]);
  });

  it("resolve onto the same defaults the tills run with", () => {
    expect(systemLayer()).toEqual({ ...configDefaults(), [CLOSE_DIFFERENCE_TOLERANCE_KEY]: "0" });
  });

  it("each take their own default back, so a layer can always be set to it", () => {
    for (const { key, value, systemDefault } of CONFIG_KEY_DEFINITIONS.values()) {
      expect([key, value.safeParse(systemDefault).success]).toEqual([key, true]);
    }
  });

  it("refuse a value of the wrong kind", () => {
    expect(definition("tables").value.safeParse("true").success).toBe(false);
    expect(definition("charge_profile").value.safeParse({ pricesIncludeTax: "yes" }).success).toBe(
      false,
    );
    expect(definition(CLOSE_DIFFERENCE_TOLERANCE_KEY).value.safeParse(5_000).success).toBe(false);
  });
});

describe("layerMaySet", () => {
  it("lets a key be set at its own layer and any broader one", () => {
    expect(
      ["brand", "branch", "device"].map((l) => layerMaySet(definition("tables"), l as "brand")),
    ).toEqual([true, true, false]);
    expect(layerMaySet(definition("cup_labels"), "device")).toBe(true);
    expect(layerMaySet(definition(CLOSE_DIFFERENCE_TOLERANCE_KEY), "device")).toBe(true);
  });

  it("keeps a brand decision off the branches, and a branch decision off the tills", () => {
    expect(layerMaySet(definition("happy_hour_pricing"), "branch")).toBe(false);
    expect(layerMaySet(definition("charge_profile"), "device")).toBe(false);
    expect(layerMaySet(definition("einvoice_profile"), "device")).toBe(false);
  });
});
