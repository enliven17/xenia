import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Copy, CheckCheck, RefreshCw, AlertCircle } from "lucide-react";
import type { User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function ExtensionKey() {
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();

  const { data: keyData, isLoading } = useQuery<{ key: string | null }>({
    queryKey: ["/api/extension/key"],
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/extension/key/generate"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/extension/key"] }),
  });

  const key = keyData?.key;

  function copy() {
    if (!key) return;
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Extension API Key</h1>
        <p className="text-muted-foreground mt-1">
          This key links the Xenia browser extension to your account.
        </p>
      </div>

      <div className="rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Your API Key</h2>
        </div>

        {isLoading ? (
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
        ) : key ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3">
            <span className="font-mono text-sm flex-1 truncate">{key}</span>
            <button onClick={copy} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              {copied ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No key generated yet.</div>
        )}

        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 rounded-lg border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary/5 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
          {key ? "Regenerate Key" : "Generate Key"}
        </button>

        {key && (
          <div className="flex gap-2 text-sm text-muted-foreground rounded-lg bg-muted/50 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-500" />
            Regenerating will invalidate the current key. Update the extension with the new key.
          </div>
        )}
      </div>

      <div className="rounded-xl border p-6 space-y-3">
        <h2 className="font-semibold">How to Use</h2>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Install the Xenia Chrome extension</li>
          <li>Open the extension popup → Settings</li>
          <li>Paste this API key into the "Account Key" field</li>
          <li>The extension will auto-sync with your Xenia account</li>
        </ol>
      </div>
    </div>
  );
}
