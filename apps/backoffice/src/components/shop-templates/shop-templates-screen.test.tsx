import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { ShopTemplate, ShopTemplatePlan } from "../../lib/api/shop-template-api";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { HOSTILE_MENU } from "../../test-support/hostile-catalog";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { ShopTemplatesScreen } from "./shop-templates-screen";

const T = vi.shopTemplates;
const BRANCH = BRANCHES[0]!;
const template = (id: string, name: string): ShopTemplate => ({ id, name, description: `Mô tả ${name}`, categories: ["A", "B", "C"], stations: ["Bar"], flags: { tables: true } });
const TEMPLATES = [template("cafe", "Cà phê"), template("restaurant", "Quán ăn")];
const plan = (templateId: string, changes: ShopTemplatePlan["changes"], kept: ShopTemplatePlan["kept"] = []): ShopTemplatePlan => ({ templateId, branchId: BRANCH.id, changes, kept });
const FULL = plan("restaurant", [
  { kind: "add_category", name: "Khai vị" },
  { kind: "add_category", name: "Món chính" },
  { kind: "add_station", name: "Bếp nóng" },
  { kind: "set_flag", flag: "tables", value: true },
  { kind: "set_flag", flag: "kitchen_routing", value: true },
], [
  { flag: "course_firing", wanted: true, current: false, reason: "breaks_a_rule" },
  { flag: "cup_labels", wanted: false, current: true, reason: "chosen_by_shop" },
  { flag: "pay_first_counter", wanted: false, current: true, reason: "locked" },
]);

const pick = (name: string) => fireEvent.click(screen.getByRole("radio", { name: new RegExp(name) }));

describe("the shop template page", () => {
  it("offers each kind of shop with what it holds, and shows nothing to apply until one is picked", async () => {
    await renderSignedIn(<ShopTemplatesScreen />, { listShopTemplates: async () => ok(TEMPLATES) });
    await screen.findByRole("radiogroup", { name: T.pickTitle });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("Mô tả Cà phê")).toBeTruthy();
    expect(screen.getAllByText(T.includes(3, 1))).toHaveLength(2);
    expect(screen.queryByRole("button", { name: T.apply(BRANCH.name) })).toBeNull();
  });

  it("previews what applying would add and what it keeps, in the app's own words", async () => {
    const getShopTemplatePlan = mock.fn(async () => ok(FULL));
    await renderSignedIn(<ShopTemplatesScreen />, { listShopTemplates: async () => ok(TEMPLATES), getShopTemplatePlan });
    await screen.findAllByRole("radio");
    pick("Quán ăn");
    await screen.findByText(T.previewTitle("Quán ăn", BRANCH.name));
    expect(getShopTemplatePlan).toHaveBeenCalledWith("restaurant", BRANCH.id);
    expect(within(screen.getByRole("list", { name: T.addsCategories(2) })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Khai vị", "Món chính"]);
    expect(within(screen.getByRole("list", { name: T.addsStations(1) })).getByText("Bếp nóng")).toBeTruthy();
    expect(screen.getByText(T.flagOn("Quản lý bàn"))).toBeTruthy();
    expect(screen.getByText(T.flagOn("Chia phiếu theo trạm pha chế/bếp"))).toBeTruthy();
    expect(screen.queryByText(T.flagOff("Quầy trả tiền trước"))).toBeNull();
    expect(screen.getByText(T.keptLocked("Quầy trả tiền trước"))).toBeTruthy();
    expect(screen.getByText(T.keptRule("Ra món theo lượt", false, true))).toBeTruthy();
    expect(screen.getByText(T.keptChosen("In tem ly", true, false))).toBeTruthy();
  });

  it("asks first, applies, says what was added, and shows nothing left to add", async () => {
    let applied = false;
    const applyShopTemplate = mock.fn(async () => {
      applied = true;
      return ok(FULL);
    });
    await renderSignedIn(<ShopTemplatesScreen />, {
      listShopTemplates: async () => ok(TEMPLATES),
      getShopTemplatePlan: async () => ok(applied ? plan("restaurant", [], FULL.kept) : FULL),
      applyShopTemplate,
    });
    await screen.findAllByRole("radio");
    pick("Quán ăn");
    fireEvent.click(await screen.findByRole("button", { name: T.apply(BRANCH.name) }));
    expect(applyShopTemplate).not.toHaveBeenCalled();
    await screen.findByText(T.confirmTitle("Quán ăn", BRANCH.name));
    fireEvent.click(screen.getByRole("button", { name: T.confirm }));
    await screen.findByText(T.applied(2, 1, 2));
    expect(applyShopTemplate).toHaveBeenCalledWith("restaurant", BRANCH.id);
    await screen.findByText(T.nothing);
    expect(screen.queryByRole("button", { name: T.apply(BRANCH.name) })).toBeNull();
  });

  it("says there is nothing to add on a branch that has it all", async () => {
    await renderSignedIn(<ShopTemplatesScreen />, { listShopTemplates: async () => ok(TEMPLATES), getShopTemplatePlan: async () => ok(plan("cafe", [])) });
    await screen.findAllByRole("radio");
    pick("Cà phê");
    await screen.findByText(T.nothing);
  });

  it("shows why an apply failed and keeps the preview", async () => {
    await renderSignedIn(<ShopTemplatesScreen />, {
      listShopTemplates: async () => ok(TEMPLATES),
      getShopTemplatePlan: async () => ok(FULL),
      applyShopTemplate: async () => refused(409, "API_SHOP_TEMPLATE_FLAG_RULE_BROKEN"),
    });
    await screen.findAllByRole("radio");
    pick("Quán ăn");
    fireEvent.click(await screen.findByRole("button", { name: T.apply(BRANCH.name) }));
    fireEvent.click(screen.getByRole("button", { name: T.confirm }));
    await screen.findByText(vi.errors.byCode.API_SHOP_TEMPLATE_FLAG_RULE_BROKEN as string);
    expect(screen.getByRole("button", { name: T.apply(BRANCH.name) })).toBeTruthy();
  });

  it("refuses to preview for a member without the keys and says so", async () => {
    await renderSignedIn(<ShopTemplatesScreen />, { listShopTemplates: async () => ok(TEMPLATES), getShopTemplatePlan: async () => refused(403, "API_PERMISSION_DENIED") });
    await screen.findAllByRole("radio");
    pick("Cà phê");
    await screen.findByText(new RegExp(vi.errors.byCode.API_PERMISSION_DENIED as string));
  });

  it("lays out 50 hostile category names and long switch names without a break", async () => {
    const many = plan("cafe", Array.from({ length: 50 }, (_, at) => ({ kind: "add_category" as const, name: `${HOSTILE_MENU.productName}${at}` })));
    await renderSignedIn(<ShopTemplatesScreen />, { listShopTemplates: async () => ok([template("cafe", HOSTILE_MENU.productName)]), getShopTemplatePlan: async () => ok(many) });
    await screen.findAllByRole("radio");
    pick(HOSTILE_MENU.productName.slice(0, 20));
    const list = await screen.findByRole("list", { name: T.addsCategories(50) });
    expect(within(list).getAllByRole("listitem")).toHaveLength(50);
  });

  it("shows a failed template list with a retry", async () => {
    await renderSignedIn(<ShopTemplatesScreen />, { listShopTemplates: async () => refused(null) });
    await screen.findByText(vi.errors.network);
  });
});
