/**
 * useEscrowContract — central hook for signing real Escrow transactions from
 * the user's Privy embedded wallet.
 *
 * Privy v3 flow (per official docs):
 *   1. Wait for usePrivy().ready + authenticated
 *   2. Wait for useWallets().ready
 *   3. Pick the embedded wallet (walletClientType === 'privy'), never wallets[0]
 *   4. await wallet.switchChain(50312)         ← MUST switch before sending
 *   5. await wallet.getEthereumProvider()      ← EIP-1193 provider
 *   6. encode calldata + provider.request('eth_sendTransaction')
 *
 * Returns typed helpers for each supported on-chain action plus a `canWrite`
 * flag callers can use to gate UI.
 */
import { useCallback, useMemo } from "react";
import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { parseEther, type Hex } from "viem";
import { DEFAULT_CHAIN } from "./chains";
import { sendContractTx, type Eip1193Provider } from "./somnia";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Parse a human STT amount string into wei, throwing on bad input. */
function toWei(amountStt: string): bigint {
  const trimmed = (amountStt ?? "").trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new Error("Enter a valid positive amount.");
  }
  return parseEther(trimmed);
}

export function useEscrowContract() {
  const { ready, authenticated } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();

  // Prefer the Privy embedded wallet; fall back to any connected wallet so a
  // user who linked an external wallet can still sign.
  const wallet = useMemo<ConnectedWallet | undefined>(() => {
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    return embedded ?? wallets[0];
  }, [wallets]);

  const canWrite = ready && authenticated && walletsReady && !!wallet;

  /**
   * Acquire a chain-switched EIP-1193 provider + the signer address.
   * Centralises all the Privy readiness guards so each action stays small.
   */
  const getSigner = useCallback(async (): Promise<{
    provider: Eip1193Provider;
    address: string;
  }> => {
    if (!ready) throw new Error("Wallet is still loading. Try again in a moment.");
    if (!authenticated) throw new Error("Please sign in first.");
    if (!walletsReady) throw new Error("Wallet is still loading. Try again in a moment.");
    if (!wallet) throw new Error("No wallet found. Link or create a wallet first.");

    // Ensure we are on Somnia before broadcasting (avoids wrong-chain sends).
    try {
      await wallet.switchChain(DEFAULT_CHAIN.id);
    } catch {
      throw new Error(`Couldn't switch to ${DEFAULT_CHAIN.name}. Approve the network switch and retry.`);
    }

    const provider = (await wallet.getEthereumProvider()) as Eip1193Provider;
    const address = wallet.address;
    if (!address || !ADDRESS_RE.test(address)) {
      throw new Error("Wallet address is unavailable.");
    }
    return { provider, address };
  }, [ready, authenticated, walletsReady, wallet]);

  /** Mode A: send a tip held in escrow for a Twitter handle. */
  const tipOnChain = useCallback(
    async (recipientTwitterId: string, amountStt: string): Promise<Hex> => {
      const value = toWei(amountStt);
      const { provider, address } = await getSigner();
      return sendContractTx(provider, address, {
        functionName: "tip",
        args: [recipientTwitterId],
        valueWei: value,
      });
    },
    [getSigner],
  );

  /** Mode A: claim escrowed tips for the signed-in user's Twitter id. */
  const claimOnChain = useCallback(
    async (twitterId: string): Promise<Hex> => {
      if (!twitterId) throw new Error("Your Twitter id is unavailable.");
      const { provider, address } = await getSigner();
      return sendContractTx(provider, address, {
        functionName: "claim",
        args: [twitterId],
      });
    },
    [getSigner],
  );

  /** Mode B: deposit STT into escrow for delegated tipping. */
  const depositOnChain = useCallback(
    async (amountStt: string): Promise<Hex> => {
      const value = toWei(amountStt);
      const { provider, address } = await getSigner();
      return sendContractTx(provider, address, {
        functionName: "deposit",
        args: [],
        valueWei: value,
      });
    },
    [getSigner],
  );

  /** Mode B: authorize a delegate (the Xenia bot) to tip on the user's behalf. */
  const authorizeOnChain = useCallback(
    async (delegate: string): Promise<Hex> => {
      if (!delegate || !ADDRESS_RE.test(delegate)) {
        throw new Error("Enter a valid bot wallet address (0x…).");
      }
      const { provider, address } = await getSigner();
      return sendContractTx(provider, address, {
        functionName: "authorize",
        args: [delegate as Hex],
      });
    },
    [getSigner],
  );

  return {
    canWrite,
    walletAddress: wallet?.address,
    tipOnChain,
    claimOnChain,
    depositOnChain,
    authorizeOnChain,
  };
}
