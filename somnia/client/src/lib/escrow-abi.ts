/**
 * Escrow contract ABI (client-side subset).
 *
 * Mirrors the on-chain `Escrow.sol` deployed on Somnia. Declared with
 * `as const` so viem can fully infer argument and return types for
 * `encodeFunctionData` / `writeContract`.
 *
 * Two tipping modes are supported by the contract:
 *  - Mode A (direct):  `tip(string)` payable + `claim(string)`
 *  - Mode B (delegated): `deposit()` payable + `authorize(address)` so a bot
 *    can `tipOnBehalf(...)` later.
 */
export const ESCROW_ABI = [
  // ── Registration ──
  {
    name: "registerWallet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "twitterId", type: "string" },
      { name: "wallet", type: "address" },
    ],
    outputs: [],
  },

  // ── Mode A: Direct Tip ──
  {
    name: "tip",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "recipientTwitterId", type: "string" }],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "twitterId", type: "string" }],
    outputs: [],
  },
  {
    name: "refund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "twitterId", type: "string" },
      { name: "tipIndex", type: "uint256" },
    ],
    outputs: [],
  },

  // ── Mode B: Deposit & Authorize ──
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    name: "authorize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "delegate", type: "address" }],
    outputs: [],
  },
  {
    name: "deauthorize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "delegate", type: "address" }],
    outputs: [],
  },
  {
    name: "withdrawDeposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "tipOnBehalf",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sender", type: "address" },
      { name: "recipientTwitterId", type: "string" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },

  // ── Views ──
  {
    name: "getPendingBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "twitterId", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getRegisteredWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "twitterId", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getTwitterId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "getTipCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "twitterId", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isAuthorized",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "delegate", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "depositedBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "platformFeePercent",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
