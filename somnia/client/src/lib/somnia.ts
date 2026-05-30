/**
 * somnia.ts — On-chain helpers for signing real Escrow transactions from a
 * Privy embedded wallet on the Somnia network.
 *
 * Design notes:
 *  - The Escrow contract address is NOT baked into the bundle; it is fetched
 *    from the backend (`GET /api/somnia/network` → `contracts.escrow`). This
 *    keeps the deployed address as a single server-side source of truth and
 *    avoids a stale `VITE_*` build constant. An optional
 *    `VITE_ESCROW_CONTRACT_ADDRESS` is honoured as a fallback for local dev.
 *  - `sendContractTx` is the low-level primitive: it encodes calldata with
 *    viem and broadcasts via the EIP-1193 provider's `eth_sendTransaction`.
 *  - All values are converted to hex before hitting the raw RPC, per the Privy
 *    v3 guidance (decimal values are rejected by some providers).
 */
import {
  encodeFunctionData,
  isAddress,
  toHex,
  type Abi,
  type Hex,
} from "viem";
import { ESCROW_ABI } from "./escrow-abi";

/** Minimal EIP-1193 provider shape we rely on (from Privy's getEthereumProvider). */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

let cachedEscrowAddress: Hex | null = null;

/**
 * Resolve the Escrow contract address.
 *
 * Order: build-time env override → backend `/api/somnia/network`.
 * Result is memoised for the session. Throws a clear error if neither yields
 * a valid address so callers can surface a useful message instead of letting
 * an empty `to` reach the RPC.
 */
export async function getEscrowAddress(): Promise<Hex> {
  if (cachedEscrowAddress) return cachedEscrowAddress;

  const envAddr = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS as
    | string
    | undefined;
  if (envAddr && ADDRESS_RE.test(envAddr)) {
    cachedEscrowAddress = envAddr as Hex;
    return cachedEscrowAddress;
  }

  let escrow: unknown = null;
  try {
    const res = await fetch("/api/somnia/network", {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as {
        contracts?: { escrow?: string | null };
      };
      escrow = data?.contracts?.escrow ?? null;
    }
  } catch {
    // fall through to the throw below
  }

  if (typeof escrow !== "string" || !ADDRESS_RE.test(escrow)) {
    throw new Error(
      "Escrow contract address is not configured. Contact support.",
    );
  }

  cachedEscrowAddress = escrow as Hex;
  return cachedEscrowAddress;
}

export interface SendContractTxArgs {
  /** ABI function name to call (typed against the Escrow ABI). */
  functionName: string;
  /** Function arguments, in ABI order. */
  args: readonly unknown[];
  /** Optional payable value, in wei. Defaults to 0. */
  valueWei?: bigint;
  /** Override the target contract. Defaults to the resolved Escrow address. */
  to?: Hex;
  /** Override the ABI. Defaults to the Escrow ABI. */
  abi?: Abi;
}

/**
 * Encode + broadcast a contract call through an EIP-1193 provider.
 *
 * Returns the broadcast transaction hash. Throws on encoding failure, missing
 * sender, or provider rejection (user cancel / revert).
 */
export async function sendContractTx(
  provider: Eip1193Provider,
  from: string,
  {
    functionName,
    args,
    valueWei = 0n,
    to,
    abi = ESCROW_ABI as unknown as Abi,
  }: SendContractTxArgs,
): Promise<Hex> {
  if (!provider) throw new Error("Wallet provider is not available.");
  if (!from || !ADDRESS_RE.test(from)) {
    throw new Error("A valid sender wallet address is required.");
  }

  const target = to ?? (await getEscrowAddress());

  const data = encodeFunctionData({
    abi,
    functionName,
    args: args as never,
  });

  const params: Record<string, string> = {
    from,
    to: target,
    data,
    value: valueWei > 0n ? toHex(valueWei) : "0x0",
  };

  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [params],
  })) as string;

  if (typeof hash !== "string" || !TX_HASH_RE.test(hash)) {
    throw new Error("Transaction was submitted but no valid hash was returned.");
  }

  return hash as Hex;
}
