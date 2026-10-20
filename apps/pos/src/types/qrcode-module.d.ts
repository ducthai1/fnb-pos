// The part of qrcode 1.5.4 the till uses: building the symbol's modules, which the screen
// draws itself as SVG. The package ships no types of its own.
declare module "qrcode" {
  interface QrModules {
    readonly size: number;
    /** 1 for a dark module, 0 for a light one. */
    get(row: number, column: number): number;
  }

  interface QrSymbol {
    readonly modules: QrModules;
  }

  const QRCode: {
    create(text: string, options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" }): QrSymbol;
  };

  export default QRCode;
}
