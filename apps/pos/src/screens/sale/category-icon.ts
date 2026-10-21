import {
  Beer,
  CakeSlice,
  Coffee,
  Croissant,
  CupSoda,
  IceCreamCone,
  LayoutGrid,
  type LucideIcon,
  Soup,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import { searchKey } from "../../features/menu/search-products";

// A category has no picture of its own, so the till guesses one from words of its name; the
// first rule that matches wins, so the narrow kinds of drink go before "drinks" in general.
const RULES: readonly (readonly [RegExp, LucideIcon])[] = [
  [/\b(ca phe|cafe|coffee|espresso|latte)\b/, Coffee],
  [/\b(bia|beer|ruou|wine|cocktail)\b/, Beer],
  [/\b(kem|ice cream|yogurt|sua chua)\b/, IceCreamCone],
  [/\b(do uong|nuoc|tra|sinh to|nuoc ep|soda|drink|tea|smoothie|juice|sua)\b/, CupSoda],
  [/\b(banh ngot|cake|che|trang mieng|dessert)\b/, CakeSlice],
  [/\b(banh|bread|croissant|pastry)\b/, Croissant],
  [/\b(lau|sup|soup|pho|bun|mi|hu tieu|chao)\b/, Soup],
  [/\b(mon an|do an|com|an vat|an nhanh|food|mon chinh|khai vi|snack)\b/, UtensilsCrossed],
];

/** The icon drawn above a category's name; "all" has its own, an unknown kind a plain tag. */
export function categoryIcon(name: string | null): LucideIcon {
  if (name === null) return LayoutGrid;
  const key = searchKey(name);
  return RULES.find(([words]) => words.test(key))?.[1] ?? Tag;
}
