// The spike lives outside the pnpm workspace, so it reaches the domain package by path.
// Money and quantity math goes through it exactly as the POS and the API will.
export * from "../../../../packages/domain/src/index";
