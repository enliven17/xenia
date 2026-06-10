import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Inbox,
  Loader2,
  PlusCircle,
  Send,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import type { PendingClaim, Transaction, User } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
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
      <div className="mx-auto max-w-md border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-primary">
          Couldn't load your profile
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {userQuery.error instanceof Error
            ? userQuery.error.message
            : "Please refresh the page and try again."}
        </p>
      </div>
    );
  }

  const balanceDisplay = balanceQuery.isLoading
    ? "..."
    : balanceQuery.data
      ? formatSTT(balanceQuery.data.balanceFormatted)
      : "—";

  return (
    <div className="flex flex-col gap-6 font-mono">
      {/* Heading */}
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {"// DASHBOARD"}
        </p>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">
          Hey <span className="text-primary">@{user.twitterHandle}</span>
        </h1>
      </div>

      {/* Unclaimed banner */}
      {pendingClaimsCount > 0 ? (
        <div className="flex items-start gap-3 border border-primary/40 bg-primary/10 px-4 py-3">
          <AlertCircle
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-sm font-bold">
              You have {pendingClaimsCount} unclaimed tip
              {pendingClaimsCount === 1 ? "" : "s"}.
            </p>
            <p className="text-xs text-muted-foreground">
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

      {/* Overview grid: balance hero + wallet + stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Balance hero */}
        <div className="flex flex-col justify-between border border-primary/40 bg-primary/5 p-6 lg:col-span-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Wallet balance
          </p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-bold tabular-nums md:text-5xl">
              {balanceDisplay}
            </span>
            <span className="mb-1 text-lg text-primary">STT</span>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Somnia wallet:</span>
            {walletAddress ? (
              <>
                <code className="border border-border bg-card px-2 py-0.5 text-xs">
                  {truncateAddress(walletAddress, 6)}
                </code>
                <button
                  type="button"
                  onClick={copyAddress}
                  aria-label="Copy wallet address"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <Link href="/link-wallet">
                <Button variant="outline" size="sm">
                  Link wallet
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-col border border-border bg-card">
          <p className="border-b border-border px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
            Quick actions
          </p>
          <div className="flex flex-1 flex-col">
            <QuickAction
              href="/send-tips"
              icon={<Send className="h-4 w-4" />}
              label="Send tips"
            />
            <QuickAction
              href="/deposit"
              icon={<PlusCircle className="h-4 w-4" />}
              label="Deposit funds"
            />
            <QuickAction
              href="/claims"
              icon={<Inbox className="h-4 w-4" />}
              label="Pending claims"
              badge={pendingClaimsCount > 0 ? pendingClaimsCount : undefined}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total sent"
          value={`${formatSTT(totals.sent)} STT`}
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <StatCard
          label="Total received"
          value={`${formatSTT(totals.received)} STT`}
          icon={<ArrowDownLeft className="h-4 w-4" />}
        />
        <StatCard
          label="Pending claims"
          value={String(pendingClaimsCount)}
          icon={<Inbox className="h-4 w-4" />}
        />
      </div>

      {/* Recent activity */}
      <div className="border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-bold">Recent activity</h2>
            <p className="text-xs text-muted-foreground">
              Last 5 tips across your account.
            </p>
          </div>
          <Link href="/transactions">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>
        <div className="p-4">
          {txQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-bold">No transactions yet</p>
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
        </div>
      </div>
    </div>
  );
}

interface QuickActionProps {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: number;
}

function QuickAction({ href, icon, label, badge }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-accent"
    >
      <span className="text-primary">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined ? (
        <span className="flex h-5 min-w-5 items-center justify-center bg-primary px-1 text-xs font-bold text-primary-foreground">
          {badge}
        </span>
      ) : (
        <span aria-hidden="true" className="text-muted-foreground">
          &rarr;
        </span>
      )}
    </Link>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="flex items-center justify-between border border-border bg-card p-5">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      </div>
      <div className="border border-border bg-secondary p-2 text-primary">
        {icon}
      </div>
    </div>
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
          <tr className="border-b border-border">
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
              <tr key={tx.id} className="border-b border-border last:border-0">
                <td className="py-3 pr-4">
                  <Badge variant={isOutgoing ? "default" : "success"}>
                    {isOutgoing ? "Sent" : "Received"}
                  </Badge>
                </td>
                <td className="py-3 pr-4 font-mono tabular-nums">
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
