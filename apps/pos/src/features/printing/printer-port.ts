/** What the till prints: a sale's slips, a refund's slip, the shift's closing report. */
export type SaleSlipKind =
  "bill" | "cup_label" | "kitchen" | "pre_bill" | "refund" | "shift_report";

/** One slip ready for a printer: its bytes for the hardware, its text for a person. */
export interface PrintJob {
  /** Made on the till and kept across retries, so a report of the job names one job. */
  readonly jobId: string;
  readonly kind: SaleSlipKind;
  /** The printer as the till's settings name it. */
  readonly printerKey: string;
  /** The slip line for line as it prints (renderPreview / renderLabelPreview). */
  readonly preview: string;
  /** ESC/POS or TSPL, one chunk per write, as the printing package rendered them. */
  readonly chunks: readonly Uint8Array[];
}

export type PrintOutcome =
  | { readonly status: "printed"; readonly attempts: number }
  | { readonly status: "failed"; readonly attempts: number; readonly errorCode: string }
  /** Nothing was sent to a printer: the slip is only shown. Never counts as printed. */
  | { readonly status: "preview_only" };

/**
 * Whether a kitchen slip counts as handed over: a printer took it, or no printer exists to
 * take it and the slip was shown on screen (the web build). Only a printer that answered
 * with a failure leaves the items unsent, so they print again and show in the failed slips.
 */
export const kitchenSlipHandedOver = (outcome: PrintOutcome): boolean =>
  outcome.status !== "failed";

/**
 * The till's printers. The native shells (Windows, Android) send the bytes to the printer
 * and say whether it took them; the web build has no printer and only shows the preview.
 */
export interface PrinterPort {
  print(job: PrintJob): Promise<PrintOutcome>;
}

/** The web build: every slip is shown on screen, none is printed. */
export const previewOnlyPrinter: PrinterPort = {
  print: async () => ({ status: "preview_only" }),
};

/**
 * For end-to-end runs only (VITE_FNB_SIMULATED_PRINTER=prints at build time): a printer that
 * takes every job, so the commands that follow a real print can be tested without hardware.
 */
export const simulatedPrinterThatPrints: PrinterPort = {
  print: async () => ({ status: "printed", attempts: 1 }),
};

/** The port a build uses: the simulated printer only when the build asked for it by name. */
export function printerForBuild(flag: string | undefined): PrinterPort {
  return flag === "prints" ? simulatedPrinterThatPrints : previewOnlyPrinter;
}
