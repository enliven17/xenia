import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import type { Transaction } from "@shared/schema";
import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle, XCircle } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending:   { label: "Pending",   className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
    confirmed: { label: "Confirmed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    failed:    { label: "Failed",    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {status === "pending" && <Clock className="h-3 w-3" />}
      {status === "confirmed" && <CheckCircle className="h-3 w-3" />}
      {status === "failed" && <XCircle className="h-3 w-3" />}
      {s.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    direct:  "bg-primary/20 text-foreground border border-primary/40",
    escrow:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    claim:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    refund:  "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex rounded-none px-2 py-0.5 text-xs font-medium capitalize ${map[type] ?? "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

export default function Transactions() {
  const { user } = usePrivy();
  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const twitterId = (user?.twitter?.subject ?? user?.linkedAccounts?.find(a => a.type === "twitter_oauth")?.subject) as string | undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transaction History</h1>
        <p className="text-muted-foreground mt-1">All your tips sent and received on Somnia.</p>
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed text-center p-8">
          <ArrowUpRight className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">No transactions yet.</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Send your first tip to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Direction</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx) => {
                  const isSender = tx.fromTwitterId === twitterId;
                  return (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <TypeBadge type={tx.type} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isSender ? (
                            <ArrowUpRight className="h-4 w-4 text-red-500" />
                          ) : (
                            <ArrowDownLeft className="h-4 w-4 text-green-500" />
                          )}
                          <span className="text-muted-foreground text-xs">
                            {isSender ? `→ @${tx.toTwitterId}` : `← @${tx.fromTwitterId}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">
                        {isSender ? "-" : "+"}{tx.amountFormatted}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {tx.txHash ? (
                          <a
                            href={`https://shannon-explorer.somnia.network/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-xs font-mono"
                          >
                            {tx.txHash.slice(0, 8)}…
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
