import { isDomainError } from "@fnb/domain";
import { z } from "zod";

/** The params of an issue raised by a domain rule: which rule the value broke. */
export interface DomainRuleIssueParams {
  domainCode: string;
}

/**
 * A domain constructor as a zod transform. The domain owns the rule (how many decimals a
 * quantity may have, which rates exist), so the wire format never restates it; a broken
 * rule becomes a custom issue carrying the domain's code, and a client learns exactly
 * which rule its value broke instead of a bare "invalid". Anything that is not a domain
 * error is a bug and is rethrown rather than reported as bad input.
 */
export function viaDomainRule<In, Out>(build: (value: In) => Out) {
  return (value: In, context: z.RefinementCtx): Out => {
    try {
      return build(value);
    } catch (error) {
      if (!isDomainError(error)) throw error;
      const params: DomainRuleIssueParams = { domainCode: error.code };
      context.addIssue({ code: z.ZodIssueCode.custom, message: error.code, params });
      return z.NEVER;
    }
  };
}
