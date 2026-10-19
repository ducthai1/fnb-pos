import { isPrintingError } from "../printing-error";

/** The PrintingError code a call throws, or undefined when it does not throw. */
export function printingCodeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isPrintingError(error) ? error.code : "not-a-printing-error";
  }
  return undefined;
}
