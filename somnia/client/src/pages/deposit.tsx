import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, CheckCheck, ExternalLink, Info, Loader2, Wallet, ShieldCheck } from "lucide-react";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/queryClient";
import { useEscrowContract } from "@/lib/useEscrowContract";
import { explorerTxUrl } from "@/lib/chains";

const ENV_BOT_ADDRESS = (import.meta.env.VITE_XENIA_BOT_ADDRESS as string | undefined) ?? "";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export default function Deposit() {
  const [copied, setCopied] = useState(false);
  const { data: user } = useQuery<User>({ queryKey: ["/api/auth/user"] });
  const { toast } = useToast();
  const { depositOnChain, authorizeOnChain, canWrite } = useEscrowContract();

  const walletAddress = user?.embeddedWalletAddress || user?.linkedWalletAddress;

  // The bot address (= contract owner / backend wallet) comes from the backend
  // so users never have to find or paste it. Env var is a build-time override.
  const { data: network } = useQuery<{ botAddress?: string | null }>({
    queryKey: ["/api/somnia/network"],
  });

  const [depositAmount, setDepositAmount] = useState("");
  const [botAddress, setBotAddress] = useState(ENV_BOT_ADDRESS);
  const [botAddressTouched, setBotAddressTouched] = useState(false);

  useEffect(() => {
    if (!botAddressTouched && !botAddress && network?.botAddress) {
      setBotAddress(network.botAddress);
    }
  }, [network, botAddress, botAddressTouched]);

  function copyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function notifyError(error: unknown, fallback: string) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : fallback;
    toast({ title: "Transaction failed", description: message, variant: "destructive" });
  }

  function notifySuccess(title: string, txHash: string) {
    const url = explorerTxUrl(txHash);
    toast({
      title,
      description: url ? `Confirmed · ${txHash.slice(0, 10)}…` : `Tx: ${txHash.slice(0, 10)}…`,
      variant: "success",
    });
  }

  const depositMutation = useMutation<string, Error, void>({
    mutationFn: () => depositOnChain(depositAmount),
    onSuccess: (txHash) => {
      notifySuccess("Deposit confirmed", txHash);
      setDepositAmount("");
    },
    onError: (error) => notifyError(error, "Couldn't deposit. Try again."),
  });

  const authorizeMutation = useMutation<string, Error, void>({
    mutationFn: () => authorizeOnChain(botAddress),
    onSuccess: (txHash) => notifySuccess("Bot authorized", txHash),
    onError: (error) => notifyError(error, "Couldn't authorize the bot. Try again."),
  });

  const canDeposit =
    canWrite &&
    !!depositAmount &&
    /^\d+(\.\d+)?$/.test(depositAmount.trim()) &&
    Number(depositAmount) > 0;

  const canAuthorize = canWrite && ADDRESS_RE.test(botAddress.trim());

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

      {/* On-chain Deposit (Mode B) */}
      <div className="rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Deposit to Escrow
        </h2>
        <p className="text-sm text-muted-foreground">
          Lock STT in the escrow contract so the Xenia bot can tip on your behalf from tweets.
        </p>
        <div className="space-y-2">
          <Label htmlFor="deposit-amount">Amount (STT)</Label>
          <Input
            id="deposit-amount"
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0"
            placeholder="0.500"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
        </div>
        <Button
          onClick={() => depositMutation.mutate()}
          disabled={!canDeposit || depositMutation.isPending}
          className="w-full"
        >
          {depositMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Confirming on-chain...
            </>
          ) : (
            "Deposit"
          )}
        </Button>
      </div>

      {/* Authorize Bot (Mode B) */}
      <div className="rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Authorize Xenia Bot
        </h2>
        <p className="text-sm text-muted-foreground">
          Let the bot spend from your escrow deposit when you tip via X commands. You stay in
          control — revoke any time.
        </p>
        <div className="space-y-2">
          <Label htmlFor="bot-address">Bot wallet address</Label>
          <Input
            id="bot-address"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            className="font-mono text-sm"
            value={botAddress}
            onChange={(e) => { setBotAddressTouched(true); setBotAddress(e.target.value); }}
          />
          {botAddress && !ADDRESS_RE.test(botAddress.trim()) ? (
            <p className="text-xs text-destructive">Enter a valid 0x address (40 hex chars).</p>
          ) : null}
        </div>
        <Button
          onClick={() => authorizeMutation.mutate()}
          disabled={!canAuthorize || authorizeMutation.isPending}
          className="w-full"
        >
          {authorizeMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Confirming on-chain...
            </>
          ) : (
            "Authorize Bot"
          )}
        </Button>
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
      <div className="border border-primary/40 bg-primary/10 p-4">
        <p className="text-sm text-foreground">
          <strong>Powered by Somnia Network</strong> — sub-second finality, near-zero gas fees.
          Transactions confirm in under 1 second.
        </p>
      </div>
    </div>
  );
}
