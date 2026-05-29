import { defineChain } from "viem";

/**
 * Somnia network chain definitions.
 *
 * Centralised here so both the Privy provider (App.tsx) and the on-chain
 * contract hook (useEscrowContract.ts) share a single source of truth.
 *
 * Using viem's `defineChain` gives us a fully-typed `Chain` object that viem's
 * `createWalletClient` accepts directly.
 */

export const SOMNIA_TESTNET = defineChain({
  id: 50312,
  name: "Somnia Shannon Testnet",
  network: "somnia-testnet",
  nativeCurrency: {
    name: "Somnia Test Token",
    symbol: "STT",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://dream-rpc.somnia.network"] },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
});

export const SOMNIA_MAINNET = defineChain({
  id: 50313,
  name: "Somnia Network",
  network: "somnia",
  nativeCurrency: {
    name: "SOMI",
    symbol: "SOMI",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://mainnet-rpc.somnia.network"] },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://explorer.somnia.network",
    },
  },
  testnet: false,
});

// Use testnet by default; switch to mainnet via env var at build time.
export const DEFAULT_CHAIN =
  import.meta.env.VITE_SOMNIA_CHAIN === "mainnet" ? SOMNIA_MAINNET : SOMNIA_TESTNET;

/** Build an explorer transaction URL for the active default chain. */
export function explorerTxUrl(txHash: string): string {
  const base = DEFAULT_CHAIN.blockExplorers?.default.url;
  return base ? `${base}/tx/${txHash}` : "";
}
