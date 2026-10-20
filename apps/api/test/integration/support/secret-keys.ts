// Words that name a secret, matched against each camelCase or snake_case part of a key.
const SECRET_WORDS = new Set([
  "hash",
  "pin",
  "token",
  "secret",
  "password",
  "salt",
  "otp",
  "credential",
  "ciphertext",
]);

/**
 * Every key, at any depth, one of whose words names a secret: an answer that leaks a PIN
 * hash or a token hash under any spelling shows up here, wherever it is nested.
 */
export function secretKeysIn(value: unknown, path = ""): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => secretKeysIn(item, `${path}.${index}`));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => {
    const words = key.split(/_|(?=[A-Z])/).map((word) => word.toLowerCase());
    const own = words.some((word) => SECRET_WORDS.has(word)) ? [`${path}.${key}`] : [];
    return [...own, ...secretKeysIn(inner, `${path}.${key}`)];
  });
}
