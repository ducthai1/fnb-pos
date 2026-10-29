import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import type { PriceListDocument } from "../../../lib/api/price-list-api";
import { vi } from "../../../messages/vi";
import { BRANCHES, ok, refused } from "../../../test-support/fake-backoffice-api";
import { HOSTILE_MENU } from "../../../test-support/hostile-catalog";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { PriceListEditorScreen } from "./price-list-editor-screen";

const T = vi.priceLists.editor;
const BRAND = BRANCHES[0]?.brandId ?? "";
const ID = "0190a000-0000-7000-8000-0000000000d1";
const CATEGORIES: Category[] = [{ id: "c1", brandId: BRAND, name: "Trà sữa", sortOrder: 1, version: 1 }];
const product = (id: string, name: string, variants: ProductSummary["variants"] = []): ProductSummary => ({
  id, name, kind: "standard", categoryId: "c1", basePrice: 40000, pricingMode: "fixed", version: 1, archivedAt: null, variants,
});
const PRODUCTS = [product("p1", "Trà đào", [{ id: "v1", name: "Size L" }]), product("p2", HOSTILE_MENU.productName)];
const menu = { listCategories: async () => ok(CATEGORIES), listProducts: async () => ok(PRODUCTS) };

const choose = (box: string, option: string, within_?: HTMLElement) => {
  const scope = within_ ?? document.body;
  fireEvent.click(within(scope).getByRole("combobox", { name: box }));
  fireEvent.click(within(scope).getByRole("option", { name: option }));
};
const field = (label: string, value: string, scope: HTMLElement = document.body) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
const rule1 = () => screen.getByRole("listitem", { name: T.ruleTitle(1) });

describe("making a price list", () => {
  it("saves a weekday happy hour as the rule the till will price by", async () => {
    const putPriceList = mock.fn(async (_id: string, body: { name: string; items: unknown[]; version: number | null; brandId: string }): Promise<ReturnType<typeof ok<PriceListDocument>>> =>
      ok({ id: ID, brandId: body.brandId, name: body.name, version: 1, items: body.items as PriceListDocument["items"] }));
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew />, { ...menu, putPriceList });
    await screen.findByText(T.noRules);
    field(T.nameLabel, "Giờ vàng");
    fireEvent.click(screen.getByRole("button", { name: T.addRule }));
    const card = rule1();
    choose(T.scope, T.scopes.category, card);
    choose(T.category, "Trà sữa", card);
    field(T.percent, "20", card);
    for (const day of ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu"]) fireEvent.click(within(card).getByRole("button", { name: day }));
    field(T.start, "14:00", card);
    field(T.end, "17:00", card);
    choose(T.branch, BRANCHES[0]?.name ?? "", card);
    expect(within(card).getByText(/Giảm 20% · Trà sữa · T2–T6, 14:00–17:00 · Q1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.saved);
    const [id, body] = putPriceList.mock.calls[0] ?? [];
    expect(id).toBe(ID);
    expect(body).toMatchObject({ version: null, brandId: BRAND, name: "Giờ vàng" });
    expect(body?.items).toEqual([
      expect.objectContaining({
        scope: { kind: "category", categoryId: "c1" },
        branchId: BRANCHES[0]?.id,
        daysOfWeek: [1, 2, 3, 4, 5],
        timeWindow: { startMinute: 840, endMinute: 1020 },
        effect: { kind: "percent_off", rateBp: 2000, rounding: "half-up" },
      }),
    ]);
  });

  it("puts what is wrong on its field and sends nothing", async () => {
    const putPriceList = mock.fn();
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew />, { ...menu, putPriceList });
    await screen.findByText(T.noRules);
    fireEvent.click(screen.getByRole("button", { name: T.addRule }));
    const card = rule1();
    choose(T.scope, T.scopes.product, card);
    choose(T.effect, T.effects.fixed_price, card);
    field(T.fixedPrice, "4.5", card);
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.hasErrors);
    expect(putPriceList).not.toHaveBeenCalled();
    expect(within(card).getByText(vi.priceLists.errors.pickTarget)).toBeTruthy();
    expect(within(card).getByText(vi.priceLists.errors.priceInvalid)).toBeTruthy();
    expect(screen.getByText(vi.priceLists.errors.nameRequired)).toBeTruthy();
  });

  it("says a fixed price for a whole category belongs on a product, by the domain's rule", async () => {
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew />, { ...menu, putPriceList: mock.fn() });
    await screen.findByText(T.noRules);
    field(T.nameLabel, "Giá cố định");
    fireEvent.click(screen.getByRole("button", { name: T.addRule }));
    const card = rule1();
    choose(T.scope, T.scopes.category, card);
    choose(T.category, "Trà sữa", card);
    choose(T.effect, T.effects.fixed_price, card);
    field(T.fixedPrice, "30000", card);
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await within(card).findByText(vi.priceLists.errors.fixedOnBroadScope);
  });

  it("offers only the sizes of the chosen product and reads a size rule back", async () => {
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew />, { ...menu, putPriceList: mock.fn() });
    await screen.findByText(T.noRules);
    fireEvent.click(screen.getByRole("button", { name: T.addRule }));
    const card = rule1();
    choose(T.scope, T.scopes.variant, card);
    expect((within(card).getByRole("combobox", { name: T.variant }) as HTMLButtonElement).disabled).toBe(true);
    choose(T.product, "Trà đào", card);
    fireEvent.click(within(card).getByRole("combobox", { name: T.variant }));
    expect(within(card).getAllByRole("option").map((option) => option.textContent)).toEqual([T.pick, "Size L"]);
  });
});

const stored: PriceListDocument = {
  id: ID,
  brandId: BRAND,
  name: "Grab",
  version: 3,
  items: [
    {
      id: "0190a000-0000-7000-8000-0000000000e1",
      scope: { kind: "variant", variantId: "v1" },
      branchId: null,
      channelKey: "grab",
      validFrom: null,
      validTo: null,
      daysOfWeek: null,
      timeWindow: null,
      effect: { kind: "fixed_price", price: 52000 },
      priority: 1,
    },
  ],
};

describe("editing a saved price list", () => {
  it("opens it with the rule's product and size picked, and saves under its version", async () => {
    const putPriceList = mock.fn(async (_id: string, body: { name: string }) => ok({ ...stored, name: body.name, version: 4 }));
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew={false} />, { ...menu, getPriceList: async () => ok(stored), putPriceList });
    await screen.findByDisplayValue("Grab");
    const card = rule1();
    expect(within(card).getByRole("combobox", { name: T.product }).textContent).toContain("Trà đào");
    expect(within(card).getByRole("combobox", { name: T.variant }).textContent).toContain("Size L");
    expect((within(card).getByLabelText(T.fixedPrice) as HTMLInputElement).value).toBe("52.000");
    field(T.nameLabel, "Grab mới");
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.saved);
    expect(putPriceList.mock.calls[0]?.[1]).toMatchObject({ version: 3, name: "Grab mới", items: [stored.items[0]] });
  });

  it("offers the newer version after a 409 instead of merging", async () => {
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew={false} />, {
      ...menu,
      getPriceList: async () => ok(stored),
      putPriceList: async () => refused(409, "API_CATALOG_VERSION_CONFLICT"),
    });
    await screen.findByDisplayValue("Grab");
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.conflict);
    expect(screen.getByRole("button", { name: T.reload })).toBeTruthy();
  });

  it("puts a pricing rule only the server could judge on the rule it names", async () => {
    const refusal = { ok: false as const, status: 400, code: "DOMAIN_PRICING_INVALID_TIME_WINDOW", body: { code: "DOMAIN_PRICING_INVALID_TIME_WINDOW", details: { priceListItemId: stored.items[0]?.id } } };
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew={false} />, { ...menu, getPriceList: async () => ok(stored), putPriceList: async () => refusal });
    await screen.findByDisplayValue("Grab");
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await within(rule1()).findByText(vi.priceLists.errors.timeWindow);
  });

  it("shows a list that is gone", async () => {
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew={false} />, { ...menu, getPriceList: async () => refused(404, "API_CATALOG_PRICE_LIST_NOT_FOUND") });
    await screen.findByText(vi.errors.byCode.API_CATALOG_PRICE_LIST_NOT_FOUND as string);
  });
});

describe("a list with many rules and hostile names", () => {
  it("shows 60 rules, each its own card with a one-line summary, and removes one", async () => {
    const many: PriceListDocument = {
      ...stored,
      items: Array.from({ length: 60 }, (_, at) => ({
        ...(stored.items[0] as PriceListDocument["items"][number]),
        id: `0190a000-0000-7000-8000-${String(at + 1).padStart(12, "0")}`,
        scope: { kind: "product" as const, productId: at % 2 === 0 ? "p2" : "p1" },
        effect: { kind: "percent_off" as const, rateBp: 1000 + at, rounding: "down" as const },
      })),
    };
    await renderSignedIn(<PriceListEditorScreen id={ID} isNew={false} />, { ...menu, getPriceList: async () => ok(many) });
    await screen.findByDisplayValue("Grab");
    expect(screen.getAllByRole("listitem", { name: /^Quy tắc \d+$/ })).toHaveLength(60);
    expect(within(screen.getByRole("listitem", { name: T.ruleTitle(1) })).getAllByText(new RegExp(HOSTILE_MENU.productName)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: T.removeRule(60) }));
    await waitFor(() => expect(screen.getAllByRole("listitem", { name: /^Quy tắc \d+$/ })).toHaveLength(59));
  });
});
