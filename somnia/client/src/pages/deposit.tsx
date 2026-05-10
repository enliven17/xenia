import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { Copy, CheckCheck, ExternalLink, Info } from "lucide-react";
import type { User } from "@shared/schema";

export default function Deposit() {
  const [copied, setCopied] = useState(false);
  const { data: user } = useQuery<User>({ queryKey: ["/api/auth/user"] });

  const walletAddress = user?.embeddedWalletAddress || user?.linkedWalletAddress;

  function copyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Deposit</h1>
        <p className="text-muted-foreground mt-1">Add STT to your Xenia wallet to start tipping.</p>
      </div>

      {/* Wallet Address */}
      <div className="rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold">Your Somnia Wallet</h2>

        {walletAddress ? (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3">
              <span className="font-mono text-sm flex-1 truncate">{walletAddress}</span>
              <button
                onClick={copyAddress}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? (
                  <CheckCheck className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            <a
              href={`https://shannon-explorer.somnia.network/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              View on Explorer <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        ) : (
          <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
            No wallet connected yet. Link a wallet first.
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          How to get STT (Testnet)
        </h2>
        <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside">
          <li>
            Go to the{" "}
            <a
              href="https://testnet.somnia.network"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Somnia Testnet Faucet
            </a>
          </li>
          <li>Connect your wallet and request testnet STT tokens</li>
          <li>Add Somnia Testnet to your wallet if not already added:
            <div className="mt-2 rounded-lg bg-muted p-3 font-mono text-xs space-y-1">
              <div>RPC: https://dream-rpc.somnia.network</div>
              <div>Chain ID: 50312</div>
              <div>Symbol: STT</div>
            </div>
          </li>
          <li>Send STT to your Xenia wallet address above</li>
        </ol>
      </div>

      {/* Network Info */}
      <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/10 p-4">
        <p className="text-sm text-violet-800 dark:text-violet-300">
          <strong>Powered by Somnia Network</strong> — sub-second finality, near-zero gas fees.
          Transactions confirm in under 1 second.
        </p>
      </div>
    </div>
  );
}
