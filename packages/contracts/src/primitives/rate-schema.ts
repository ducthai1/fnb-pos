import { type BasisPoints, basisPoints } from "@fnb/domain";
import { z } from "zod";
import { viaDomainRule } from "./domain-rule-transform";

/**
 * A rate on the wire: whole basis points (800 = 8%), already the domain's own number, so
 * it is sent as is. Which values are rates (an integer from 0 to 100%) is the domain's
 * rule, reported with its code.
 */
export const rateSchema = z
  .number()
  .transform(viaDomainRule((value: number): BasisPoints => basisPoints(value)));
