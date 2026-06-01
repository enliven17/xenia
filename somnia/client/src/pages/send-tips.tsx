import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send, Twitter } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { useEscrowContract } from "@/lib/useEscrowContract";
import { explorerTxUrl } from "@/lib/chains";

interface SendTipPayload {
  recipientTwitterId: string;
  recipientHandle: string;
  amount: string;
  tweetId?: string;
}

/** Response from POST /api/tips/send — records the tip and returns its DB id. */
interface CreateTipResponse {
  txId: number;
  recipientTwitterId: string;
  recipientHandle: string | null;
  amount: string;
  type: string;
}

/** Final result surfaced to the UI after the on-chain tip is confirmed. */
interface SendTipResult {
  txHash: string;
}

const MIN_AMOUNT = 0.001;

function extractTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export default function SendTipsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tipOnChain, canWrite } = useEscrowContract();

  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("");
  const [tweetUrl, setTweetUrl] = useState("");

  const sanitizedHandle = useMemo(() => normalizeHandle(handle), [handle]);
  const parsedAmount = useMemo(() => parseFloat(amount), [amount]);
  const tweetId = useMemo(() => extractTweetId(tweetUrl), [tweetUrl]);

  const formError = useMemo(() => {
    if (!sanitizedHandle) return null;
    if (!/^[a-z0-9_]{1,15}$/i.test(sanitizedHandle)) {
      return "Handle must be 1-15 letters, numbers, or underscores.";
    }
    return null;
  }, [sanitizedHandle]);

  const canSubmit =
    sanitizedHandle.length > 0 &&
    !formError &&
    !Number.isNaN(parsedAmount) &&
    parsedAmount >= MIN_AMOUNT;

  const mutation = useMutation<SendTipResult, Error, SendTipPayload>({
    // Three steps: (1) record the intent in the DB, (2) sign the real on-chain
    // tip from the user's embedded wallet, (3) report the tx hash back so the
    // backend can mark it confirmed.
    mutationFn: async (payload) => {
      // 1. Record the pending tip; backend returns its row id.
      const created = await apiRequest<CreateTipResponse>(
        "POST",
        "/api/tips/send",
        payload,
      );

      // 2. Sign + broadcast the on-chain tip. This moves real STT.
      const txHash = await tipOnChain(payload.recipientTwitterId, payload.amount);

      // 3. Best-effort confirmation, keyed by the row id (the row was inserted
      //    with txHash=null, so confirming by txHash would never match). The tip
      //    already settled on-chain, so a failure here is non-fatal.
      try {
        await apiRequest("POST", `/api/tips/${created.txId}/confirm`, {
          txHash,
          status: "confirmed",
        });
      } catch {
        // Non-fatal: STT already moved; the row just stays unconfirmed.
      }

      return { txHash };
    },
    onSuccess: ({ txHash }) => {
      const url = explorerTxUrl(txHash);
      toast({
        title: "Tip sent",
        description: url
          ? `Confirmed on-chain · ${txHash.slice(0, 10)}…`
          : `Tx: ${txHash.slice(0, 10)}…`,
        variant: "success",
      });
      setHandle("");
      setAmount("");
      setTweetUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : error.message || "Couldn't send the tip. Try again.";
      toast({ title: "Tip failed", description: message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate({
      recipientTwitterId: sanitizedHandle,
      recipientHandle: sanitizedHandle,
      amount: parsedAmount.toString(),
      ...(tweetId ? { tweetId } : {}),
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-violet-500" />
            Send a tip
          </CardTitle>
          <CardDescription>
            Drop STT to anyone on X. They'll get notified to claim it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="handle">Twitter handle</Label>
              <div className="relative">
                <Twitter
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="handle"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="@vitalik"
                  className="pl-9"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  aria-invalid={!!formError}
                  aria-describedby={formError ? "handle-error" : undefined}
                  required
                />
              </div>
              {formError ? (
                <p id="handle-error" className="text-xs text-destructive">
                  {formError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  We'll route via escrow if they're not on Xenia yet.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (STT)</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                step="0.001"
                min={MIN_AMOUNT}
                placeholder="0.100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Minimum {MIN_AMOUNT} STT.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tweet">Tweet URL <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="tweet"
                type="url"
                inputMode="url"
                placeholder="https://x.com/vitalik/status/1234..."
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
              />
              {tweetUrl && !tweetId ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  We couldn't parse a tweet ID. The tip will still send.
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={!canSubmit || !canWrite || mutation.isPending}
              className="w-full"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirming on-chain...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Tip
                </>
              )}
            </Button>
            {!canWrite ? (
              <p className="text-xs text-muted-foreground text-center">
                Connecting your wallet… the button activates once it's ready.
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Step number={1} title="Enter handle">
            Type any X username. No address lookup needed.
          </Step>
          <Step number={2} title="Confirm amount">
            Pick how much STT to send. We show you the gas estimate.
          </Step>
          <Step number={3} title="Done">
            Tip lands in their wallet, or sits in escrow until claimed.
          </Step>
          <div className="flex items-start gap-2 rounded-md bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            Sub-second finality on Somnia. No gas surprises.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StepProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

function Step({ number, title, children }: StepProps) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-semibold text-white">
        {number}
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
