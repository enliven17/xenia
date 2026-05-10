import type { Express, Request, Response } from "express";
import { activeChain, getPendingBalance, getAddressBalance, registerWalletOnChain } from "./somnia";

export function registerSomniaRoutes(app: Express) {

  // ─── Network Info ───────────────────────────────────────────────────────────
  app.get("/api/somnia/network", (_req: Request, res: Response) => {
    res.json({
      chainId: activeChain.id,
      name: activeChain.name,
      rpcUrl: activeChain.rpcUrls.default.http[0],
      explorer: activeChain.blockExplorers?.default.url,
      symbol: activeChain.nativeCurrency.symbol,
      testnet: activeChain.testnet ?? false,
      contracts: {
        escrow: process.env.ESCROW_CONTRACT_ADDRESS || null,
        registry: process.env.REGISTRY_CONTRACT_ADDRESS || null,
      },
    });
  });

  // ─── Pending Balance ────────────────────────────────────────────────────────
  app.get("/api/somnia/pending/:twitterId", async (req: Request, res: Response) => {
    try {
      const { twitterId } = req.params;
      const balance = await getPendingBalance(twitterId);
      res.json({ twitterId, pendingBalance: balance, symbol: activeChain.nativeCurrency.symbol });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Wallet Balance ─────────────────────────────────────────────────────────
  app.get("/api/somnia/balance/:address", async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const balance = await getAddressBalance(address as `0x${string}`);
      res.json({ address, balance, symbol: activeChain.nativeCurrency.symbol });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Register Wallet (called after Privy login) ─────────────────────────────
  // In production: protect this route — verify Privy JWT first.
  app.post("/api/somnia/register", async (req: Request, res: Response) => {
    try {
      const { twitterId, wallet } = req.body as { twitterId: string; wallet: string };
      if (!twitterId || !wallet) {
        return res.status(400).json({ error: "twitterId and wallet are required" });
      }
      const txHash = await registerWalletOnChain(twitterId, wallet as `0x${string}`);
      res.json({ success: true, txHash, explorer: `${activeChain.blockExplorers?.default.url}/tx/${txHash}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
