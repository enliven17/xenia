import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Send, AlertCircle, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Recipient {
  id: string;
  handle: string;
  amount: string;
}

interface BatchResult {
  handle: string;
  status: "success" | "error";
  message?: string;
}

export default function BatchSend() {
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: crypto.randomUUID(), handle: "", amount: "" },
  ]);
  const [results, setResults] = useState<BatchResult[]>([]);

  function addRow() {
    setRecipients((r) => [...r, { id: crypto.randomUUID(), handle: "", amount: "" }]);
  }

  function removeRow(id: string) {
    setRecipients((r) => r.filter((x) => x.id !== id));
  }

  function updateRow(id: string, field: "handle" | "amount", value: string) {
    setRecipients((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  }

  const batchMutation = useMutation({
    mutationFn: async () => {
      const valid = recipients.filter((r) => r.handle.trim() && r.amount);
      const batchResults: BatchResult[] = [];

      for (const r of valid) {
        try {
          await apiRequest("POST", "/api/tips/send", {
            recipientTwitterId: r.handle.replace("@", ""),
            recipientHandle: r.handle.replace("@", ""),
            amount: r.amount,
          });
          batchResults.push({ handle: r.handle, status: "success" });
        } catch (e: any) {
          batchResults.push({ handle: r.handle, status: "error", message: e.message });
        }
      }

      return batchResults;
    },
    onSuccess: (data) => {
      setResults(data);
    },
  });

  const validCount = recipients.filter((r) => r.handle.trim() && Number(r.amount) > 0).length;
  const totalAmount = recipients
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    .toFixed(4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Batch Send</h1>
        <p className="text-muted-foreground mt-1">Send tips to multiple people at once.</p>
      </div>

      <div className="rounded-xl border p-4 sm:p-6 space-y-4">
        <div className="space-y-3">
          {recipients.map((r, i) => (
            <div key={r.id} className="flex gap-2 items-center">
              <span className="text-muted-foreground text-sm w-5 shrink-0">{i + 1}.</span>
              <input
                type="text"
                value={r.handle}
                onChange={(e) => updateRow(r.id, "handle", e.target.value)}
                placeholder="@twitterhandle"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="number"
                value={r.amount}
                onChange={(e) => updateRow(r.id, "amount", e.target.value)}
                placeholder="STT"
                min="0.001"
                step="0.001"
                className="w-24 sm:w-36 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={() => removeRow(r.id)}
                disabled={recipients.length === 1}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addRow}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Plus className="h-4 w-4" /> Add recipient
        </button>

        <div className="flex items-center justify-between pt-2 border-t text-sm text-muted-foreground">
          <span>{validCount} recipient{validCount !== 1 ? "s" : ""}</span>
          <span>Total: {totalAmount} STT</span>
        </div>

        <button
          onClick={() => batchMutation.mutate()}
          disabled={batchMutation.isPending || validCount === 0}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
          {batchMutation.isPending ? "Sending…" : `Send ${validCount} Tip${validCount !== 1 ? "s" : ""}`}
        </button>
      </div>

      {results.length > 0 && (
        <div className="rounded-xl border p-4 sm:p-6 space-y-3">
          <h2 className="font-semibold">Results</h2>
          {results.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {r.status === "success" ? (
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <span className="font-medium">{r.handle}</span>
              <span className="text-muted-foreground">
                {r.status === "success" ? "Tip sent" : r.message ?? "Failed"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
