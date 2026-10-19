import { describe, expect, it } from "vitest";
import type { FeatureFlagDefinition, FeatureFlagKey } from "./feature-flag-catalog";
import { FEATURE_FLAGS_ERROR_CODES as CODES } from "./feature-flags-error-codes";
import { validateFlags } from "./validate-flag-constraints";

describe("validateFlags on the shipped catalog", () => {
  it("accepts the defaults, and a default turned off", () => {
    expect(validateFlags({})).toEqual([]);
    expect(validateFlags({ pay_first_counter: false, cup_labels: true })).toEqual([]);
  });

  it.each([
    ["course_firing", "tables"],
    ["qr_ordering", "tables"],
    ["auto_86_on_zero_stock", "inventory_tracking"],
    ["allow_negative_stock", "inventory_tracking"],
  ] as const)("reports %s on without %s, and accepts it with", (flag, other) => {
    expect(validateFlags({ [flag]: true })).toEqual([{ code: CODES.requiresMissing, flag, other }]);
    expect(validateFlags({ [flag]: true, [other]: false })).toEqual([
      { code: CODES.requiresMissing, flag, other },
    ]);
    expect(validateFlags({ [flag]: true, [other]: true })).toEqual([]);
  });

  it("reports selling below zero together with auto sold-out once, not once per side", () => {
    const both = {
      inventory_tracking: true,
      auto_86_on_zero_stock: true,
      allow_negative_stock: true,
    };
    expect(validateFlags(both)).toEqual([
      { code: CODES.excludesBothOn, flag: "auto_86_on_zero_stock", other: "allow_negative_stock" },
    ]);
    expect(validateFlags({ ...both, allow_negative_stock: false })).toEqual([]);
  });

  it("reports keys outside the catalog, sorted, including prototype names", () => {
    const values = JSON.parse('{"tabels": true, "__proto__": true, "constructor": false}');
    expect(validateFlags(values)).toEqual([
      { code: CODES.unknownFlag, flag: "__proto__" },
      { code: CODES.unknownFlag, flag: "constructor" },
      { code: CODES.unknownFlag, flag: "tabels" },
    ]);
  });

  it("reports a stored value that is not a boolean instead of reading it as on", () => {
    for (const value of ["true", "false", 1, 0, null]) {
      expect({ value, violations: validateFlags({ course_firing: value }) }).toEqual({
        value,
        violations: [{ code: CODES.notBoolean, flag: "course_firing" }],
      });
    }
  });
});

describe("validateFlags on a given catalog", () => {
  // Keys are borrowed from the real catalog only to satisfy the type.
  const def = (
    key: FeatureFlagKey,
    requires: FeatureFlagKey[] = [],
    excludes: FeatureFlagKey[] = [],
  ): FeatureFlagDefinition => ({ key, default: false, requires, excludes, scope: "branch" });

  it("checks each requirement where it is declared, so a chain reports its broken link", () => {
    const chain = [def("qr_ordering", ["tables"]), def("tables", ["einvoice"]), def("einvoice")];
    expect(validateFlags({ qr_ordering: true, tables: true }, chain)).toEqual([
      { code: CODES.requiresMissing, flag: "tables", other: "einvoice" },
    ]);
  });

  it("reports an exclusion declared on one side only, whichever flag declares it", () => {
    const oneSided = [def("tables"), def("einvoice", [], ["tables"])];
    expect(validateFlags({ tables: true, einvoice: true }, oneSided)).toEqual([
      { code: CODES.excludesBothOn, flag: "einvoice", other: "tables" },
    ]);
  });

  it("lists violations in catalog order with unknown keys last", () => {
    const catalog = [
      def("tables", ["einvoice"]),
      def("qr_ordering", ["einvoice"]),
      def("einvoice"),
    ];
    expect(validateFlags({ zzz: true, qr_ordering: true, tables: true }, catalog)).toEqual([
      { code: CODES.requiresMissing, flag: "tables", other: "einvoice" },
      { code: CODES.requiresMissing, flag: "qr_ordering", other: "einvoice" },
      { code: CODES.unknownFlag, flag: "zzz" },
    ]);
  });
});
