import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import { vi } from "../../../messages/vi";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { refused } from "../../../test-support/fake-backoffice-api";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import { ProductEditorScreen } from "./product-editor-screen";

const T = vi.menu.editor;
const NEW_ID = "0190a000-0000-7000-8000-0000000000f1";

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

async function seededTea() {
  const catalog = fakeCatalog();
  const check = checkProductDraft({ ...milkTeaDraft(), version: null });
  if (!check.ok) throw new Error("the milk tea does not check");
  await catalog.putProduct(TEA.product, check.body);
  catalog.putProduct.mockClear();
  return catalog;
}

describe("the product editor", () => {
  it("creates a product field by field and saves it once, as a new one", async () => {
    const catalog = fakeCatalog();
    const onSaved = mock.fn();
    await renderSignedIn(<ProductEditorScreen productId={NEW_ID} isNew onSaved={onSaved} />, catalog.api);
    type(await screen.findByLabelText(T.name), "Trà đào");
    type(screen.getByLabelText(T.basePrice), "35.000");
    fireEvent.click(screen.getByRole("button", { name: T.addGroup }));
    const group = screen.getByRole("region", { name: T.groupLabel(1) });
    type(within(group).getByLabelText(T.groupName), "Đá");
    fireEvent.click(within(group).getByRole("button", { name: T.addOption }));
    type(within(group).getByLabelText(T.optionName), "Ít đá");
    fireEvent.click(screen.getByRole("button", { name: T.save }));

    await screen.findByText(T.saved);
    expect(onSaved).toHaveBeenCalledOnce();
    const [id, body] = catalog.putProduct.mock.calls[0]!;
    expect(id).toBe(NEW_ID);
    expect(body).toMatchObject({ version: null, name: "Trà đào", basePrice: 35_000 });
    expect(body.modifierGroups).toMatchObject([{ name: "Đá", minSelect: 0, maxSelect: 1, options: [{ name: "Ít đá", priceDelta: 0 }] }]);
    // Saved: the next save is based on version 1, and the product can now be archived.
    expect(catalog.products.get(NEW_ID)?.version).toBe(1);
    expect(screen.getByRole("button", { name: T.archive })).toBeTruthy();
  });

  it("does not send a draft the rules refuse, and says so where it is wrong", async () => {
    const catalog = fakeCatalog();
    await renderSignedIn(<ProductEditorScreen productId={NEW_ID} isNew />, catalog.api);
    fireEvent.click(await screen.findByRole("button", { name: T.save }));
    expect(await screen.findByText(T.hasErrors)).toBeTruthy();
    expect(screen.getByLabelText(T.name).getAttribute("aria-invalid")).toBe("true");
    expect(catalog.putProduct).not.toHaveBeenCalled();
  });

  it("tells the person someone saved first, and reloads the newer product on request", async () => {
    const catalog = await seededTea();
    await renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew={false} />, catalog.api);
    type(await screen.findByLabelText(T.name), "Trà sữa của tôi");
    catalog.touch(TEA.product);
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.conflict);
    expect(catalog.products.get(TEA.product)?.name).toBe("Trà sữa trân châu (sửa)");

    fireEvent.click(screen.getByRole("button", { name: T.reload }));
    await mock.waitFor(() =>
      expect((screen.getByLabelText(T.name) as HTMLInputElement).value).toBe("Trà sữa trân châu (sửa)"),
    );
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.saved);
  });

  it("archives only after the second, confirming tap", async () => {
    const catalog = await seededTea();
    await renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew={false} />, catalog.api);
    fireEvent.click(await screen.findByRole("button", { name: T.archive }));
    const dialog = screen.getByRole("alertdialog", { name: T.archiveTitle("Trà sữa trân châu") });
    expect(catalog.api.archiveProduct).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: T.archive }));
    expect((await screen.findAllByText(T.archived)).length).toBeGreaterThan(0);
    expect(catalog.products.get(TEA.product)?.archivedAt).not.toBeNull();
    expect(screen.queryByRole("button", { name: T.archive })).toBeNull();
  });

  it("shows a refusal only the server could make at the save bar, with its sentence", async () => {
    const catalog = await seededTea();
    await renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew={false} />, {
      ...catalog.api,
      putProduct: async () => refused(400, "DOMAIN_CATALOG_DUPLICATE_MODIFIER_GROUP_ID"),
    });
    fireEvent.click(await screen.findByRole("button", { name: T.save }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      vi.errors.byCode.DOMAIN_CATALOG_DUPLICATE_MODIFIER_GROUP_ID,
    );
  });
});
