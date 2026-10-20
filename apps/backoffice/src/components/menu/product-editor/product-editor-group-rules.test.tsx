import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "../../../messages/vi";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import { ProductEditorScreen } from "./product-editor-screen";

const T = vi.menu.editor;
const E = vi.errors.byCode;

let catalog: ReturnType<typeof fakeCatalog>;

beforeEach(async () => {
  catalog = fakeCatalog();
  const check = checkProductDraft({ ...milkTeaDraft(), version: null });
  if (!check.ok) throw new Error("the milk tea does not check");
  await catalog.putProduct(TEA.product, check.body);
  catalog.putProduct.mockClear();
  await renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew={false} />, catalog.api);
  await screen.findByRole("region", { name: T.groupLabel(3) });
});

const group = (n: number) => screen.getByRole("region", { name: T.groupLabel(n) });
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: T.save }));
const alertsIn = (element: HTMLElement) => within(element).queryAllByRole("alert").map((alert) => alert.textContent);

async function expectRefusedAt(place: () => HTMLElement, message: string) {
  save();
  await screen.findByText(T.hasErrors);
  expect(alertsIn(place())).toEqual([message]);
  expect(catalog.putProduct).not.toHaveBeenCalled();
}

async function expectSaved() {
  save();
  await screen.findByText(T.saved);
  expect(catalog.putProduct).toHaveBeenCalledOnce();
}

describe("modifier group rules in the editor: refused where they are broken, saved once fixed", () => {
  it("min above max shows on that group only", async () => {
    type(within(group(2)).getByLabelText(T.minSelect), "2");
    await expectRefusedAt(() => group(2), E.DOMAIN_CATALOG_MIN_SELECT_ABOVE_MAX_SELECT!);
    expect(alertsIn(group(1))).toEqual([]);
    expect(alertsIn(group(3))).toEqual([]);
    type(within(group(2)).getByLabelText(T.minSelect), "1");
    await expectSaved();
  });

  it("a size's own limits show on that size's row of the group", async () => {
    const ruleL = () => within(group(3)).getByRole("group", { name: T.ruleLabel("L") });
    type(within(ruleL()).getByLabelText(T.ruleMin), "6");
    await expectRefusedAt(ruleL, E.DOMAIN_CATALOG_MIN_SELECT_ABOVE_MAX_SELECT!);
    type(within(ruleL()).getByLabelText(T.ruleMin), "1");
    await expectSaved();
    expect(catalog.products.get(TEA.product)?.modifierGroups[2]?.variantRules[TEA.sizeL]).toEqual({ minSelect: 1, maxSelect: 5 });
  });

  it("a per-option cap of zero shows on that option's field", async () => {
    const jelly = () => within(group(3)).getByRole("group", { name: T.optionLabel(2) });
    type(within(jelly()).getByLabelText(T.maxQuantity), "0");
    await expectRefusedAt(jelly, E.DOMAIN_CATALOG_INVALID_OPTION_MAX_QUANTITY!);
    expect(within(jelly()).getByLabelText(T.maxQuantity).getAttribute("aria-invalid")).toBe("true");
    type(within(jelly()).getByLabelText(T.maxQuantity), "");
    await expectSaved();
  });

  it("a required group no order can fill is refused, and accepted once repeats are allowed", async () => {
    type(within(group(1)).getByLabelText(T.minSelect), "3");
    type(within(group(1)).getByLabelText(T.maxSelect), "3");
    await expectRefusedAt(() => group(1), E.DOMAIN_CATALOG_UNSATISFIABLE_MODIFIER_GROUP!);
    fireEvent.click(within(group(1)).getByRole("checkbox", { name: T.allowDuplicates }));
    await expectSaved();
  });

  it("a required group without options is refused at the group", async () => {
    fireEvent.click(within(group(2)).getByRole("button", { name: T.removeOption("Bình thường") }));
    fireEvent.click(within(group(2)).getByRole("button", { name: T.removeOption("Không đá") }));
    await expectRefusedAt(() => group(2), E.DOMAIN_CATALOG_REQUIRED_GROUP_WITHOUT_OPTIONS!);
    type(within(group(2)).getByLabelText(T.minSelect), "0");
    await expectSaved();
  });

  it("a maximum of zero is refused at the group", async () => {
    type(within(group(3)).getByLabelText(T.maxSelect), "0");
    await expectRefusedAt(() => group(3), E.DOMAIN_CATALOG_INVALID_MAX_SELECT!);
    type(within(group(3)).getByLabelText(T.maxSelect), "2");
    await expectSaved();
  });

  it("a group hidden for a size is saved as such and left out of that size's preview", async () => {
    const ruleL = within(group(2)).getByRole("group", { name: T.ruleLabel("L") });
    fireEvent.click(within(ruleL).getByRole("checkbox", { name: T.ruleHidden }));
    await expectSaved();
    expect(catalog.products.get(TEA.product)?.modifierGroups[1]?.variantRules).toEqual({ [TEA.sizeL]: { hidden: true } });
    const preview = screen.getByRole("region", { name: vi.menu.preview.title });
    fireEvent.click(within(preview).getByRole("radio", { name: "L" }));
    expect(within(within(preview).getByRole("group", { name: "Đá" })).getByText(vi.menu.preview.hiddenForVariant)).toBeTruthy();
  });
});

describe("the preview of a customer's choices", () => {
  const preview = () => screen.getByRole("region", { name: vi.menu.preview.title });
  const previewGroup = (name: string) => within(preview()).getByRole("group", { name });
  const total = () => preview().querySelector("[data-preview-total]");
  const tap = (label: string, times: number) => {
    for (let i = 0; i < times; i++) fireEvent.click(within(preview()).getByRole("button", { name: label }));
  };

  it("lets an L carry five toppings, refuses a sixth on the topping group, and holds an M to three", () => {
    fireEvent.click(within(previewGroup("Đường")).getByRole("checkbox", { name: /^100%/ }));
    fireEvent.click(within(previewGroup("Đá")).getByRole("checkbox", { name: /^Không đá/ }));
    fireEvent.click(within(preview()).getByRole("radio", { name: "L" }));
    tap(vi.menu.preview.more("Thạch"), 3);
    tap(vi.menu.preview.more("Pudding"), 2);
    // 45.000 + 3 × 5.000 + 2 × 7.000
    expect(total()?.textContent).toMatch(/^Khách trả mỗi món: 74\.000\s₫$/);

    tap(vi.menu.preview.more("Trân châu đen"), 1);
    expect(previewGroup("Topping").textContent).toContain(vi.menu.preview.tooMany(5, 6));
    expect(total()).toBeNull();
    expect(previewGroup("Đường").textContent).not.toContain(vi.menu.preview.tooMany(5, 6));

    fireEvent.click(within(preview()).getByRole("radio", { name: "M" }));
    expect(previewGroup("Topping").textContent).toContain(vi.menu.preview.tooMany(3, 6));
  });

  it("asks for the sugar level before anything else is priced", () => {
    expect(previewGroup("Đường").textContent).toContain(vi.menu.preview.requiredMissing(1));
    expect(total()).toBeNull();
  });
});
