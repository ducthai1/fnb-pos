/**
 * Data that breaks naive slips: a name with no space to break at, emoji, tone marks typed
 * decomposed, a multi-line note, a note carrying printer commands.
 */
export const HOSTILE = {
  longName: "TràSữaTrânChâuĐườngĐenKemCheeseMatchaĐậuĐỏThạchDừaPuddingTrứngNướngSiêuTo",
  emojiName: "Trà đào 🍑🧋 cam sả 👨\u200d👩\u200d👧 size khủng",
  decomposedName: "Ca\u0300 phe\u0302 su\u031b\u0303a đa\u0301",
  multiLineNote: "Ít đá\nKhông đường\n\nGiao trước 9h",
  commandNote: "ít ngọt\x1b@\x1dV\x00\x1bp\x00\x19\xfa",
  thirtyToppings: Array.from({ length: 30 }, (_, i) => `Topping số ${i + 1}`),
} as const;
