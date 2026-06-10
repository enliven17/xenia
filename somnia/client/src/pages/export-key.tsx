import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { ShieldAlert, Eye, EyeOff, Copy, CheckCheck } from "lucide-react";
import type { User } from "@shared/schema";

export default function ExportKey() {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const { exportWallet } = usePrivy();
  const { data: user } = useQuery<User>({ queryKey: ["/api/auth/user"] });

  async function handleExport() {
    try {
      await exportWallet();
    } catch (e) {
      console.error("Export failed", e);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Export Private Key</h1>
        <p className="text-muted-foreground mt-1">
          Export your embedded wallet's private key for use in external wallets.
        </p>
      </div>

      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 flex gap-3">
        <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm text-destructive space-y-1">
          <p className="font-semibold">Security Warning</p>
          <p>Never share your private key. Anyone with it has full control of your wallet and funds.</p>
        </div>
      </div>

      <div className="rounded-xl border p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold">Embedded Wallet</h2>
        <div className="rounded-lg bg-muted px-4 py-3 font-mono text-sm truncate">
          {user?.embeddedWalletAddress ?? "No embedded wallet found"}
        </div>

        {user?.embeddedWalletAddress ? (
          <button
            onClick={handleExport}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Export via Privy (Secure)
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">
            You don't have an embedded wallet. Log in with Privy to create one.
          </p>
        )}
      </div>

      <div className="rounded-xl border p-4 sm:p-6 space-y-2">
        <h2 className="font-semibold">After Exporting</h2>
        <p className="text-sm text-muted-foreground">
          Import your key into MetaMask, Rabby, or any EVM wallet. Add the Somnia Testnet network:
        </p>
        <div className="rounded-lg bg-muted p-3 font-mono text-xs space-y-1 mt-2 break-all">
          <div>RPC: https://dream-rpc.somnia.network</div>
          <div>Chain ID: 50312</div>
          <div>Symbol: STT</div>
          <div>Explorer: https://shannon-explorer.somnia.network</div>
        </div>
      </div>
    </div>
  );
}
