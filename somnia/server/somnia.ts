import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

// ─── Somnia Chain Definitions ─────────────────────────────────────────────────

export const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Shannon Testnet",
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

export const somniaMainnet = defineChain({
  id: 50313,
  name: "Somnia Network",
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

// ─── Active Chain (switch by env) ────────────────────────────────────────────

const isMainnet = process.env.SOMNIA_CHAIN_ID === "50313";
export const activeChain = isMainnet ? somniaMainnet : somniaTestnet;

// ─── Clients ──────────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(process.env.SOMNIA_RPC_URL || activeChain.rpcUrls.default.http[0]),
});

function getBackendWallet() {
  const pk = process.env.BACKEND_WALLET_PRIVATE_KEY;
  if (!pk) throw new Error("BACKEND_WALLET_PRIVATE_KEY not set");
  return privateKeyToAccount(pk as `0x${string}`);
}

export function getWalletClient() {
  const account = getBackendWallet();
  return createWalletClient({
    account,
    chain: activeChain,
    transport: http(process.env.SOMNIA_RPC_URL || activeChain.rpcUrls.default.http[0]),
  });
}

// ─── Escrow ABI (minimal) ─────────────────────────────────────────────────────

export const ESCROW_ABI = [
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
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getEscrowAddress(): `0x${string}` {
  const addr = process.env.ESCROW_CONTRACT_ADDRESS;
  if (!addr) throw new Error("ESCROW_CONTRACT_ADDRESS not set");
  return addr as `0x${string}`;
}

/**
 * Register a user's wallet on-chain after they log in via Privy.
 * Called by the backend once per new user registration.
 */
export async function registerWalletOnChain(
  twitterId: string,
  wallet: `0x${string}`
): Promise<`0x${string}`> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    address: getEscrowAddress(),
    abi: ESCROW_ABI,
    functionName: "registerWallet",
    args: [twitterId, wallet],
  });
  return hash;
}

/**
 * Fetch pending (unclaimed) balance for a Twitter user.
 */
export async function getPendingBalance(twitterId: string): Promise<string> {
  const raw = await publicClient.readContract({
    address: getEscrowAddress(),
    abi: ESCROW_ABI,
    functionName: "getPendingBalance",
    args: [twitterId],
  });
  return formatEther(raw as bigint);
}

/**
 * Get STT balance for any address.
 */
export async function getAddressBalance(address: `0x${string}`): Promise<string> {
  const raw = await publicClient.getBalance({ address });
  return formatEther(raw);
}
