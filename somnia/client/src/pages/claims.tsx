import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Loader2 } from "lucide-react";
import type { PendingClaim } from "@shared/schema";
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
import { ApiError, apiRequest } from "@/lib/queryClient";
import { formatRelativeTime, formatSTT } from "@/lib/utils";

type ClaimStatus = "pending" | "claimed" | "refunded" | string;

export default function ClaimsPage() {
  const claimsQuery = useQuery<PendingClaim[]>({ queryKey: ["/api/claims"] });
  const claims = claimsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pending claims</h1>
        <p className="text-sm text-muted-foreground">
          Tips that are waiting for you to claim, and your full claim history.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All claims</CardTitle>
          <CardDescription>
            Claimable balances are held in escrow on Somnia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {claimsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : claimsQuery.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {claimsQuery.error instanceof Error
                ? claimsQuery.error.message
                : "Couldn't load claims."}
            </div>
          ) : claims.length === 0 ? (
            <EmptyState />
          ) : (
            <ClaimsTable claims={claims} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-medium">No pending tips for you yet.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        When someone tips your handle, it'll show up here.
      </p>
    </div>
  );
}

interface ClaimsTableProps {
  claims: PendingClaim[];
}

function ClaimsTable({ claims }: ClaimsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-4 font-medium">Sender</th>
            <th className="py-2 pr-4 font-medium">Amount</th>
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ClaimRowProps {
  claim: PendingClaim;
}

function ClaimRow({ claim }: ClaimRowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: () => apiRequest("POST", `/api/claims/${claim.id}/mark-claimed`),
    onSuccess: () => {
      toast({ title: "Tip claimed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : "Couldn't claim the tip. Try again.";
      toast({ title: "Claim failed", description: message, variant: "destructive" });
    },
  });

  const isPending = claim.status === "pending";

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4">@{claim.senderTwitterId}</td>
      <td className="py-3 pr-4 font-mono">{formatSTT(claim.amountFormatted)} STT</td>
      <td className="py-3 pr-4 text-muted-foreground">
        {formatRelativeTime(claim.createdAt)}
      </td>
      <td className="py-3 pr-4">
        <ClaimStatusBadge status={claim.status} />
      </td>
      <td className="py-3 pr-4 text-right">
        {isPending ? (
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Claiming
              </>
            ) : (
              "Claim"
            )}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  switch (status) {
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "claimed":
      return <Badge variant="success">Claimed</Badge>;
    case "refunded":
      return <Badge variant="secondary">Refunded</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
