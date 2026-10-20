/*
 * Menu data a shop may really type, which breaks naive layouts and naive code: names of 80
 * characters with no space to wrap at, emoji joined into one glyph, tone marks typed as
 * combining marks, and a topping group of 30 options. Special characters are built from
 * code points so the file holds no invisible characters.
 */

const ZWJ = String.fromCodePoint(0x200d);
const CIRCUMFLEX = String.fromCodePoint(0x0302);
const TILDE = String.fromCodePoint(0x0303);
const DOT_BELOW = String.fromCodePoint(0x0323);
const ACUTE = String.fromCodePoint(0x0301);

const unbroken = (seed: string, length: number) =>
  seed.repeat(Math.ceil(length / seed.length)).slice(0, length);

const FAMILY = ["👨", "👩", "👧"].join(ZWJ);

export const HOSTILE_MENU = {
  /** 80 characters, the longest product name a person is likely to type, with no space. */
  productName: unbroken("TràSữaTrânChâuĐườngĐenKemMuốiPhôMaiSiêuTo", 80),
  sizeName: unbroken("SizeKhổngLồChoCảNhà", 60),
  groupName: unbroken("ToppingThêmVàoLyKhôngGiớiHạn", 70),
  emoji: `Bé ${FAMILY} trà sữa 🧋🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑`,
  decomposed: `Nguye${CIRCUMFLEX}${TILDE}n Thi${DOT_BELOW} A${ACUTE}nh`,
} as const;

/** 30 toppings: long unbroken names, emoji and combining marks among them. */
export function hostileToppingNames(): string[] {
  return Array.from({ length: 30 }, (_, index) => {
    if (index % 10 === 3) return `${HOSTILE_MENU.emoji} ${index + 1}`;
    if (index % 10 === 7) return `${HOSTILE_MENU.decomposed} ${index + 1}`;
    return `${unbroken("ThạchTráiCâyNhiềuMàu", 50)}${index + 1}`;
  });
}
