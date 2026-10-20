/** A bank a shop may receive transfers into, by the NAPAS BIN its VietQR names it with. */
export interface VietnamBank {
  readonly bin: string;
  readonly shortName: string;
}

/**
 * Banks Vietnamese shops most often take transfers into, with their NAPAS BIN (the
 * six digits a VietQR carries). A bank missing here is still set by typing its BIN.
 */
export const VIETNAM_BANKS: readonly VietnamBank[] = [
  { bin: "970436", shortName: "Vietcombank" },
  { bin: "970415", shortName: "VietinBank" },
  { bin: "970418", shortName: "BIDV" },
  { bin: "970405", shortName: "Agribank" },
  { bin: "970407", shortName: "Techcombank" },
  { bin: "970422", shortName: "MB Bank" },
  { bin: "970416", shortName: "ACB" },
  { bin: "970432", shortName: "VPBank" },
  { bin: "970423", shortName: "TPBank" },
  { bin: "970403", shortName: "Sacombank" },
  { bin: "970437", shortName: "HDBank" },
  { bin: "970441", shortName: "VIB" },
  { bin: "970443", shortName: "SHB" },
  { bin: "970431", shortName: "Eximbank" },
  { bin: "970426", shortName: "MSB" },
  { bin: "970448", shortName: "OCB" },
  { bin: "970440", shortName: "SeABank" },
  { bin: "970449", shortName: "LPBank" },
  { bin: "970428", shortName: "Nam A Bank" },
  { bin: "970454", shortName: "BVBank" },
];

/** The bank of a BIN, or undefined for one not in the list (typed by hand). */
export const bankOfBin = (bin: string): VietnamBank | undefined =>
  VIETNAM_BANKS.find((bank) => bank.bin === bin);
