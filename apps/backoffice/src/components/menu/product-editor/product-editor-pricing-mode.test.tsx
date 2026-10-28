import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../../messages/vi";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import { ProductEditorScreen } from "./product-editor-screen";

const T = vi.menu.editor;
const NEW_ID = "0190a000-0000-7000-8000-0000000000f2";

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

/** Opens the picker named `label` and takes `choice` from its list. */
function pick(label: string, choice: string) {
  const picker = screen.getByRole("combobox", { name: label });
  // The app's own picker, a button: never the system's list box.
  expect(picker.tagName).toBe("BUTTON");
  fireEvent.click(picker);
  fireEvent.click(screen.getByRole("option", { name: choice }));
}

const pickerValue = (label: string) => screen.getByRole("combobox", { name: label }).textContent;

describe("how the product editor sets a product's pricing", () => {
  it("sells a product by weight per 100 g, its price read as the price per 100 g", async () => {
    const catalog = fakeCatalog();
    await renderSignedIn(<ProductEditorScreen productId={NEW_ID} isNew />, catalog.api);
    type(await screen.findByLabelText(T.name), "Cà phê hạt Robusta");
    expect(screen.queryByRole("combobox", { name: T.measureUnit })).toBeNull();

    pick(T.pricingMode, T.pricingModes.weighed);
    expect(pickerValue(T.measureUnit)).toBe(T.measureUnits.kg);
    expect(screen.getByLabelText(T.basePriceWeighed.kg)).toBeTruthy();
    expect(screen.getByText(T.pricingModeHints.weighed)).toBeTruthy();
    pick(T.measureUnit, T.measureUnits["100g"]);
    type(screen.getByLabelText(T.basePriceWeighed["100g"]), "32.000");
    fireEvent.click(screen.getByRole("button", { name: T.save }));

    await screen.findByText(T.saved);
    const [, body] = catalog.putProduct.mock.calls[0]!;
    expect(body).toMatchObject({ pricingMode: "weighed", measureUnit: "100g", basePrice: 32_000 });
  });

  it("saves no unit on a product whose price the cashier types, and says how it sells", async () => {
    const catalog = fakeCatalog();
    await renderSignedIn(<ProductEditorScreen productId={NEW_ID} isNew />, catalog.api);
    type(await screen.findByLabelText(T.name), "Bánh kem theo yêu cầu");
    pick(T.pricingMode, T.pricingModes.weighed);
    pick(T.measureUnit, T.measureUnits["100g"]);
    pick(T.pricingMode, T.pricingModes.open_price);

    expect(screen.queryByRole("combobox", { name: T.measureUnit })).toBeNull();
    expect(screen.getByText(T.pricingModeHints.open_price)).toBeTruthy();
    expect(screen.getByText(T.basePriceOpenHint)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: T.save }));

    await screen.findByText(T.saved);
    const [, body] = catalog.putProduct.mock.calls[0]!;
    expect(body).toMatchObject({ pricingMode: "open_price", measureUnit: null, basePrice: null });
  });

  it("reads a weighed product back with its unit, and saves a fixed price without one", async () => {
    const catalog = fakeCatalog();
    const beans = { ...milkTeaDraft(), version: null, variants: [], modifierGroups: [] };
    const check = checkProductDraft({ ...beans, pricingMode: "weighed", measureUnit: "100g" });
    if (!check.ok) throw new Error("the beans do not check");
    await catalog.putProduct(TEA.product, check.body);
    catalog.putProduct.mockClear();
    await renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew={false} />, catalog.api);

    await screen.findByLabelText(T.name);
    expect(pickerValue(T.pricingMode)).toBe(T.pricingModes.weighed);
    expect(pickerValue(T.measureUnit)).toBe(T.measureUnits["100g"]);
    pick(T.pricingMode, T.pricingModes.fixed);
    fireEvent.click(screen.getByRole("button", { name: T.save }));

    await screen.findByText(T.saved);
    const [, body] = catalog.putProduct.mock.calls[0]!;
    expect(body).toMatchObject({ pricingMode: "fixed", measureUnit: null });
  });
});
