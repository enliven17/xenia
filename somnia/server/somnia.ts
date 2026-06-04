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

// ─── ScreenshotRegistry ABI (Proof of Post) ────────────────────────────────────
// Mirrors contracts/contracts/ScreenshotRegistry.sol exactly.

export const REGISTRY_ABI = [
  {
    name: "registerScreenshot",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_cid", type: "string" },
      { name: "_tweetId", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "verifyScreenshot",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_cid", type: "string" }],
    outputs: [
      { name: "timestamp", type: "uint256" },
      { name: "tweetId", type: "string" },
      { name: "recorder", type: "address" },
    ],
  },
  {
    name: "getProofByTweetId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_tweetId", type: "string" }],
    outputs: [
      { name: "cid", type: "string" },
      { name: "timestamp", type: "uint256" },
      { name: "recorder", type: "address" },
    ],
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
  // Wait for the binding to be mined so a claim() right after won't race a
  // not-yet-registered state (Somnia finality is sub-second).
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Read the wallet currently bound to a twitterId/handle on-chain.
 * Returns the zero address if no binding exists.
 */
export async function getRegisteredWallet(twitterId: string): Promise<`0x${string}`> {
  const addr = await publicClient.readContract({
    address: getEscrowAddress(),
    abi: ESCROW_ABI,
    functionName: "getRegisteredWallet",
    args: [twitterId],
  });
  return addr as `0x${string}`;
}

/**
 * Idempotently bind a handle → wallet on-chain. Safe to call repeatedly:
 *   - already bound to this wallet → no-op, returns { alreadyRegistered: true }
 *   - bound to a different wallet  → throws (immutable binding conflict)
 *   - unbound                      → registers and waits for the receipt
 */
export async function ensureWalletRegistered(
  twitterId: string,
  wallet: `0x${string}`
): Promise<{ txHash: `0x${string}` | null; alreadyRegistered: boolean }> {
  const existing = await getRegisteredWallet(twitterId);
  if (existing && existing.toLowerCase() !== ZERO_ADDRESS) {
    if (existing.toLowerCase() === wallet.toLowerCase()) {
      return { txHash: null, alreadyRegistered: true };
    }
    throw new Error(
      `Handle is already bound to a different wallet (${existing}).`
    );
  }
  const txHash = await registerWalletOnChain(twitterId, wallet);
  return { txHash, alreadyRegistered: false };
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

// ─── Proof of Post (ScreenshotRegistry) ─────────────────────────────────────────

export function getRegistryAddress(): `0x${string}` {
  const addr = process.env.REGISTRY_CONTRACT_ADDRESS;
  if (!addr) throw new Error("REGISTRY_CONTRACT_ADDRESS not set");
  return addr as `0x${string}`;
}

export interface ProofRecord {
  cid: string;
  tweetId: string;
  timestamp: number;
  recorder: `0x${string}`;
  exists: boolean;
}

/**
 * Register a screenshot proof on-chain. registerScreenshot is onlyOwner in the
 * contract, so this MUST be signed by the backend wallet (the registry owner).
 *
 * Returns the broadcast transaction hash. Reverts on-chain if the CID or
 * tweetId was already registered (mirrors the contract's duplicate guards).
 */
export async function registerScreenshotOnChain(
  cid: string,
  tweetId: string
): Promise<`0x${string}`> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    address: getRegistryAddress(),
    abi: REGISTRY_ABI,
    functionName: "registerScreenshot",
    args: [cid, tweetId],
  });
  return hash;
}

/**
 * Verify a proof by its screenshot CID. Returns null when the CID has never
 * been registered (contract returns timestamp == 0 for unknown CIDs).
 */
export async function verifyProof(cid: string): Promise<ProofRecord | null> {
  const [timestamp, tweetId, recorder] = (await publicClient.readContract({
    address: getRegistryAddress(),
    abi: REGISTRY_ABI,
    functionName: "verifyScreenshot",
    args: [cid],
  })) as [bigint, string, `0x${string}`];

  if (timestamp === 0n) return null;

  return {
    cid,
    tweetId,
    timestamp: Number(timestamp),
    recorder,
    exists: true,
  };
}

/**
 * Look up the proof registered against a given tweet ID. Returns null when no
 * screenshot has been registered for that tweet.
 */
export async function getProofByTweetId(
  tweetId: string
): Promise<ProofRecord | null> {
  const [cid, timestamp, recorder] = (await publicClient.readContract({
    address: getRegistryAddress(),
    abi: REGISTRY_ABI,
    functionName: "getProofByTweetId",
    args: [tweetId],
  })) as [string, bigint, `0x${string}`];

  if (!cid || timestamp === 0n) return null;

  return {
    cid,
    tweetId,
    timestamp: Number(timestamp),
    recorder,
    exists: true,
  };
}
