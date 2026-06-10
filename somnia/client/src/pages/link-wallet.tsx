import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { Wallet, CheckCircle, AlertCircle, Link } from "lucide-react";
import type { User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function LinkWallet() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const { data: user } = useQuery<User>({ queryKey: ["/api/auth/user"] });
  const { connectWallet } = usePrivy();

  const linkMutation = useMutation({
    mutationFn: (addr: string) => apiRequest("POST", "/api/wallets/link", { address: addr }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setAddress("");
      setError("");
    },
    onError: (e: any) => setError(e.message ?? "Failed to link wallet"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError("Please enter a valid EVM wallet address (0x...)");
      return;
    }
    linkMutation.mutate(address);
  }

  const linked = user?.linkedWalletAddress;
  const embedded = user?.embeddedWalletAddress;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Link Wallet</h1>
        <p className="text-muted-foreground mt-1">Connect an external wallet to send and receive tips.</p>
      </div>

      {/* Current wallets */}
      <div className="rounded-xl border p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold">Connected Wallets</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3">
            <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Embedded Wallet (Privy)</p>
              <p className="font-mono text-sm truncate">{embedded ?? "Not set"}</p>
            </div>
            {embedded && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3">
            <Link className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Linked External Wallet</p>
              <p className="font-mono text-sm truncate">{linked ?? "Not linked"}</p>
            </div>
            {linked && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
          </div>
        </div>
      </div>

      {/* Link by address */}
      <div className="rounded-xl border p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold">Link by Address</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={linkMutation.isPending || !address}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {linkMutation.isPending ? "Linking…" : "Link Wallet"}
          </button>
          {linkMutation.isSuccess && (
            <p className="text-green-600 dark:text-green-400 text-sm text-center">
              Wallet linked successfully!
            </p>
          )}
        </form>
      </div>

      {/* Connect via Privy */}
      <div className="rounded-xl border p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold">Connect via Privy</h2>
        <p className="text-sm text-muted-foreground">
          Use Privy to connect MetaMask, Coinbase Wallet, or WalletConnect directly.
        </p>
        <button
          onClick={() => connectWallet()}
          className="w-full rounded-lg border border-primary text-primary py-2.5 text-sm font-medium hover:bg-primary/5 transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    </div>
  );
}
