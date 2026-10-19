export type PinProblem = "format" | "too-weak";

const FORMAT = /^\d{4,6}$/;

/**
 * Keypad shapes and picks common enough to be among the first guesses, beyond what the
 * rules below catch: 2580/0852 (the middle column), 147258 and 258369 (columns), 159753
 * (diagonals), 147852, 789456, 112233, 123321, 1122.
 */
const COMMON = new Set([
  "1122",
  "2580",
  "0852",
  "112233",
  "123321",
  "147258",
  "159753",
  "258369",
  "147852",
  "789456",
]);

const FIRST_GUESSED_YEAR = 1950;
const LAST_GUESSED_YEAR = 2029;

function isRun(pin: string, step: 1 | -1): boolean {
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]) - Number(pin[i - 1]) !== step) return false;
  }
  return true;
}

/** `1212`, `121212`, `123123`, `7777`: one short block over and over. */
function isRepeatedBlock(pin: string): boolean {
  for (let size = 1; size <= pin.length / 2; size++) {
    if (pin.length % size === 0 && pin.slice(0, size).repeat(pin.length / size) === pin)
      return true;
  }
  return false;
}

/**
 * Why a PIN cannot be set, or null if it can. A PIN is 4 to 6 digits. Refused as too
 * weak: one digit repeated (0000), a block repeated (1212, 123123), a run up or down
 * (1234, 123456, 9876), a 4-digit year 1950-2029 (birth years), and the COMMON list.
 * Together that is 196 of the 10,000 four-digit PINs, so refusing them barely shrinks
 * the space an attacker must search but removes most of what they would try first.
 */
export function pinProblem(pin: string): PinProblem | null {
  if (!FORMAT.test(pin)) return "format";
  const year = Number(pin);
  const weak =
    isRepeatedBlock(pin) ||
    isRun(pin, 1) ||
    isRun(pin, -1) ||
    (pin.length === 4 && year >= FIRST_GUESSED_YEAR && year <= LAST_GUESSED_YEAR) ||
    COMMON.has(pin);
  return weak ? "too-weak" : null;
}
