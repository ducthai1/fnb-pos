import { type SecretVerifier, verifySecret } from "../../../src/security/secret-hash";

export interface ObservedSecretCheck {
  /** Pass to buildApp: the real hash check, recorded and holdable. */
  verify: SecretVerifier;
  /** The stored hash of every check made, in order. */
  checkedHashes: string[];
  /**
   * Makes the next check of `secret` wait, as a slow hash would, until released. `reached`
   * resolves once that check has begun, which is after its attempt was counted.
   */
  hold(secret: string): { reached: Promise<void>; release(): void };
}

/**
 * The real secret check, watched: tests count what a route really verifies, and open the
 * window between counting an attempt and finishing its check on purpose instead of by luck.
 */
export function observedSecretCheck(): ObservedSecretCheck {
  const checkedHashes: string[] = [];
  let held: { secret: string; begin: () => void; until: Promise<void> } | null = null;
  return {
    checkedHashes,
    verify: async (secret, stored) => {
      checkedHashes.push(stored);
      const current = held;
      if (current !== null && current.secret === secret) {
        held = null;
        current.begin();
        await current.until;
      }
      return verifySecret(secret, stored);
    },
    hold(secret) {
      let begin = () => {};
      let release = () => {};
      const reached = new Promise<void>((resolve) => (begin = resolve));
      const until = new Promise<void>((resolve) => (release = resolve));
      held = { secret, begin, until };
      return { reached, release };
    },
  };
}
