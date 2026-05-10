import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Inbox,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";
import type { PendingClaim, Transaction, User } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  cn,
  formatRelativeTime,
  formatSTT,
  truncateAddress,
} from "@/lib/utils";

interface BalanceResponse {
  address: string;
  balance: string;
  balanceFormatted: string;
}

export default function DashboardPage() {
  const { toast } = useToast();

  const userQuery = useQuery<User>({ queryKey: ["/api/auth/user"] });
  const txQuery = useQuery<Transaction[]>({ queryKey: ["/api/transactions"] });
  const claimsQuery = useQuery<PendingClaim[]>({ queryKey: ["/api/claims"] });

  const user = userQuery.data;
  const walletAddress =
    user?.linkedWalletAddress ?? user?.embeddedWalletAddress ?? null;

  const balanceQuery = useQuery<BalanceResponse>({
    queryKey: ["/api/somnia/balance", walletAddress],
    enabled: !!walletAddress,
  });

  const transactions = txQuery.data ?? [];
  const claims = claimsQuery.data ?? [];

  const totals = computeTotals(transactions, user?.twitterId);
  const pendingClaimsCount = claims.filter((c) => c.status === "pending").length;
  const recentTransactions = transactions.slice(0, 5);

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      toast({ title: "Address copied", variant: "success" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  if (userQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Couldn't load your profile</CardTitle>
          <CardDescription>
            {userQuery.error instanceof Error
              ? userQuery.error.message
              : "Please refresh the page and try again."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {pendingClaimsCount > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              You have {pendingClaimsCount} unclaimed tip{pendingClaimsCount === 1 ? "" : "s"}!
            </p>
            <p className="text-xs opacity-80">
              Head to Pending Claims to mark them as claimed.
            </p>
          </div>
          <Link href="/claims">
            <Button size="sm" variant="outline">
              View claims
            </Button>
          </Link>
        </div>
      ) : null}

      <Card className="overflow-hidden border-violet-500/30 bg-gradient-to-br from-violet-600/10 via-indigo-600/5 to-transparent">
        <CardHeader>
          <CardDescription>Welcome back</CardDescription>
          <CardTitle className="text-2xl md:text-3xl">
            Hey <span className="gradient-text-violet">@{user.twitterHandle}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Somnia wallet
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-sm">
                {walletAddress ? truncateAddress(walletAddress, 6) : "Not linked"}
              </code>
              {walletAddress ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={copyAddress}
                  aria-label="Copy wallet address"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              ) : (
                <Link href="/link-wallet">
                  <Button variant="outline" size="sm">
                    Link wallet
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Balance
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {balanceQuery.isLoading
                ? "..."
                : balanceQuery.data
                  ? `${formatSTT(balanceQuery.data.balanceFormatted)} STT`
                  : walletAddress
                    ? "—"
                    : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total sent"
          value={`${formatSTT(totals.sent)} STT`}
          icon={<ArrowUpRight className="h-4 w-4" />}
          accent="text-violet-600 dark:text-violet-300"
        />
        <StatCard
          label="Total received"
          value={`${formatSTT(totals.received)} STT`}
          icon={<ArrowDownLeft className="h-4 w-4" />}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label="Pending claims"
          value={String(pendingClaimsCount)}
          icon={<Inbox className="h-4 w-4" />}
          accent="text-amber-600 dark:text-amber-400"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Last 5 tips across your account.</CardDescription>
          </div>
          <Link href="/transactions">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {txQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No transactions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Send your first tip to get started.
              </p>
              <Link href="/send-tips">
                <Button size="sm" className="mt-4">
                  Send a tip
                </Button>
              </Link>
            </div>
          ) : (
            <TransactionTable
              transactions={recentTransactions}
              currentTwitterId={user.twitterId}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}

function StatCard({ label, value, icon, accent }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className={cn("rounded-md bg-muted p-2", accent)}>{icon}</div>
      </CardContent>
    </Card>
  );
}

interface TransactionTableProps {
  transactions: Transaction[];
  currentTwitterId: string;
}

function TransactionTable({ transactions, currentTwitterId }: TransactionTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Amount</th>
            <th className="py-2 pr-4 font-medium">Counterparty</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const isOutgoing = tx.fromTwitterId === currentTwitterId;
            const counterparty = isOutgoing ? tx.toTwitterId : tx.fromTwitterId;
            return (
              <tr key={tx.id} className="border-b last:border-0">
                <td className="py-3 pr-4">
                  <Badge variant={isOutgoing ? "default" : "success"}>
                    {isOutgoing ? "Sent" : "Received"}
                  </Badge>
                </td>
                <td className="py-3 pr-4 font-mono">
                  {formatSTT(tx.amountFormatted)} STT
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {counterparty ? `@${counterparty}` : "—"}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={tx.status} />
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {formatRelativeTime(tx.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === "confirmed" || lower === "success") {
    return <Badge variant="success">Confirmed</Badge>;
  }
  if (lower === "pending") {
    return <Badge variant="warning">Pending</Badge>;
  }
  if (lower === "failed" || lower === "error") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function computeTotals(
  transactions: Transaction[],
  currentTwitterId: string | undefined,
): { sent: number; received: number } {
  if (!currentTwitterId) return { sent: 0, received: 0 };
  let sent = 0;
  let received = 0;
  for (const tx of transactions) {
    const amount = parseFloat(tx.amountFormatted);
    if (Number.isNaN(amount)) continue;
    if (tx.fromTwitterId === currentTwitterId) sent += amount;
    if (tx.toTwitterId === currentTwitterId) received += amount;
  }
  return { sent, received };
}
