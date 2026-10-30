import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Station } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { BRANCHES, ok } from "../../../test-support/fake-backoffice-api";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { openPicker } from "../../../test-support/pick-from-listbox";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import { ProductEditorScreen } from "./product-editor-screen";

const T = vi.menu.editor;
const BRANCH = BRANCHES[0]?.id ?? "";
const station = (id: string, name: string, archivedAt: string | null): Station => ({ id, branchId: BRANCH, name, version: 1, archivedAt });
const BAR = station("0190a000-0000-7000-8000-0000000000b1", "Bar", null);
const OLD = station("0190a000-0000-7000-8000-0000000000b2", "Bếp cũ", "2026-10-30T03:00:00.000Z");
const NEW_ID = "0190a000-0000-7000-8000-0000000000f2";

describe("the station choice of the product editor", () => {
  it("offers the stations in use and none that is archived", async () => {
    const catalog = fakeCatalog();
    await renderSignedIn(
      <ProductEditorScreen productId={NEW_ID} isNew />,
      { ...catalog.api, listStations: async () => ok([BAR, OLD]) },
    );
    await screen.findByLabelText(T.name);
    expect(openPicker(document, T.station)).toEqual([T.noStation, "Bar"]);
  });

  it("shows the archived station a retired product still names, marked as archived", async () => {
    const catalog = fakeCatalog();
    const check = checkProductDraft({ ...milkTeaDraft(), stationId: OLD.id, version: null });
    if (!check.ok) throw new Error("the milk tea does not check");
    await catalog.putProduct(TEA.product, check.body);
    await renderSignedIn(
      <ProductEditorScreen productId={TEA.product} isNew={false} />,
      { ...catalog.api, listStations: async () => ok([BAR, OLD]) },
    );
    await screen.findByLabelText(T.name);
    expect(openPicker(document, T.station)).toEqual([T.noStation, "Bar", T.stationArchived("Bếp cũ")]);
  });
});
