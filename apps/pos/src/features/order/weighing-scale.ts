/**
 * A scale on the till (serial or USB), read for what is on it in whole grams. None is wired
 * in yet: the weight drawer offers "Đọc cân" only when it is handed one (a native till's
 * bridge, later), and until then the cashier types the weight the scale shows. A reading
 * goes through the same checks as a typed weight, so a scale can never send 0 g or 100 kg+.
 */
export interface WeighingScale {
  readGrams(): Promise<number>;
}
