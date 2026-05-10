import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { requireAuth } from "./auth";
import {
  getUserByTwitterId,
  getUserByExtensionApiKey,
  updateUserWallet,
  setExtensionApiKey,
  createTransaction,
  getTransactionsByUser,
  updateTransactionStatus,
  getPendingClaimsByRecipient,
  markClaimClaimed,
} from "./storage";
import {
  activeChain,
  getPendingBalance,
  getAddressBalance,
  registerWalletOnChain,
} from "./somnia";
import { parseEther } from "viem";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateExtensionApiKey(): string {
  // 32 random bytes → 64-char hex, prefixed for easy identification
  return `xen_${crypto.randomBytes(32).toString("hex")}`;
}

function publicUserView(user: any) {
  if (!user) return null;
  const { privyId, extensionApiKey, ...publicFields } = user;
  return publicFields;
}

// ─── Auth & Config ────────────────────────────────────────────────────────────

router.get("/api/config/privy", (_req: Request, res: Response) => {
  res.json({ appId: process.env.PRIVY_APP_ID ?? null });
});

router.get("/api/auth/user", requireAuth, (req: Request, res: Response) => {
  res.json((req as any).user);
});

router.post("/api/auth/logout", (req: Request, res: Response) => {
  if (!(req as any).session) {
    return res.status(200).json({ success: true });
  }
  (req as any).session.destroy((err: any) => {
    if (err) {
      return res.status(500).json({ error: "Failed to destroy session" });
    }
    res.clearCookie("connect.sid");
    res.status(200).json({ success: true });
  });
});

// ─── Wallets ──────────────────────────────────────────────────────────────────

router.post("/api/wallets/link", requireAuth, async (req: Request, res: Response) => {
  try {
    const { address } = req.body as { address?: string };
    if (!address || typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        code: "VALIDATION_001",
        message: "Valid EVM address is required",
      });
    }
    const user = (req as any).user;
    const updated = await updateUserWallet(user.id, address, "linked");
    res.status(200).json({ success: true, user: publicUserView(updated) });
  } catch (err: any) {
    res.status(500).json({ code: "WALLET_001", message: "Failed to link wallet" });
  }
});

router.get("/api/wallets", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({
    embedded: user.embeddedWalletAddress ?? null,
    linked: user.linkedWalletAddress ?? null,
  });
});

// ─── Transactions ─────────────────────────────────────────────────────────────

router.get("/api/transactions", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 50, 200) : 50;
    const txs = await getTransactionsByUser(user.twitterId, limit);
    res.json(txs);
  } catch (err: any) {
    res.status(500).json({ code: "TX_001", message: "Failed to fetch transactions" });
  }
});

router.post("/api/tips/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { recipientTwitterId, recipientHandle, amount, tweetId } = req.body as {
      recipientTwitterId?: string;
      recipientHandle?: string;
      amount?: string | number;
      tweetId?: string;
    };

    if (!recipientTwitterId || !amount) {
      return res.status(400).json({
        code: "VALIDATION_002",
        message: "recipientTwitterId and amount are required",
      });
    }

    const amountStr = String(amount);
    if (!/^\d+(\.\d+)?$/.test(amountStr) || Number(amountStr) <= 0) {
      return res.status(400).json({
        code: "VALIDATION_003",
        message: "amount must be a positive number (in STT)",
      });
    }

    // Check if recipient is a registered user → "direct" tip vs "escrow" tip
    const recipient = await getUserByTwitterId(recipientTwitterId);
    const txType = recipient && (recipient.linkedWalletAddress || recipient.embeddedWalletAddress)
      ? "direct"
      : "escrow";

    const amountWei = parseEther(amountStr).toString();
    const fromAddress = user.linkedWalletAddress || user.embeddedWalletAddress || null;
    const toAddress =
      recipient?.linkedWalletAddress || recipient?.embeddedWalletAddress || null;

    const tx = await createTransaction({
      fromTwitterId: user.twitterId,
      toTwitterId: recipientTwitterId,
      fromAddress,
      toAddress,
      amount: amountWei,
      amountFormatted: amountStr,
      txHash: null,
      status: "pending",
      type: txType,
      tweetId: tweetId ?? null,
      createdAt: new Date(),
    } as any);

    res.status(201).json({
      txId: tx.id,
      recipientTwitterId,
      recipientHandle: recipientHandle ?? recipient?.twitterHandle ?? null,
      amount: amountStr,
      type: txType,
    });
  } catch (err: any) {
    res.status(500).json({ code: "TIP_001", message: "Failed to record tip" });
  }
});

router.put("/api/tips/:txHash/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;
    const { status, toAddress } = req.body as { status?: string; toAddress?: string };

    if (!status || !["pending", "confirmed", "failed"].includes(status)) {
      return res.status(400).json({
        code: "VALIDATION_004",
        message: "status must be pending|confirmed|failed",
      });
    }
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return res.status(400).json({
        code: "VALIDATION_005",
        message: "Valid txHash is required",
      });
    }

    await updateTransactionStatus(txHash, status);
    // Note: toAddress is captured for future use; current schema update is status-only.
    void toAddress;
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ code: "TX_002", message: "Failed to update status" });
  }
});

// ─── Pending Claims ───────────────────────────────────────────────────────────

router.get("/api/claims", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const claims = await getPendingClaimsByRecipient(user.twitterId);
    res.json(claims);
  } catch (err: any) {
    res.status(500).json({ code: "CLAIM_001", message: "Failed to fetch claims" });
  }
});

router.post(
  "/api/claims/:id/mark-claimed",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({
          code: "VALIDATION_006",
          message: "Valid claim id is required",
        });
      }
      await markClaimClaimed(id);
      res.status(200).json({ success: true });
    } catch (err: any) {
      res.status(500).json({ code: "CLAIM_002", message: "Failed to mark claimed" });
    }
  }
);

// ─── Extension API Key ────────────────────────────────────────────────────────

router.get("/api/extension/key", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({ key: user.extensionApiKey ?? null });
});

router.post(
  "/api/extension/key/generate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const key = generateExtensionApiKey();
      await setExtensionApiKey(user.id, key);
      res.status(201).json({ key });
    } catch (err: any) {
      res.status(500).json({ code: "EXT_001", message: "Failed to generate key" });
    }
  }
);

router.get("/api/extension/verify", async (req: Request, res: Response) => {
  try {
    const key = req.header("X-Extension-Key");
    if (!key) {
      return res.status(401).json({ valid: false, code: "AUTH_001", message: "Missing X-Extension-Key header" });
    }
    const user = await getUserByExtensionApiKey(key);
    if (!user) {
      return res.status(401).json({ valid: false, code: "AUTH_002", message: "Invalid extension key" });
    }
    res.json({ valid: true, user: publicUserView(user) });
  } catch (err: any) {
    res.status(500).json({ valid: false, code: "EXT_002", message: "Verification failed" });
  }
});

// ─── Somnia Network ───────────────────────────────────────────────────────────

router.get("/api/somnia/network", (_req: Request, res: Response) => {
  res.json({
    chainId: activeChain.id,
    name: activeChain.name,
    rpcUrl: activeChain.rpcUrls.default.http[0],
    explorer: activeChain.blockExplorers?.default.url ?? null,
    symbol: activeChain.nativeCurrency.symbol,
    testnet: activeChain.testnet ?? false,
    contracts: {
      escrow: process.env.ESCROW_CONTRACT_ADDRESS ?? null,
      registry: process.env.REGISTRY_CONTRACT_ADDRESS ?? null,
    },
  });
});

router.get("/api/somnia/pending/:twitterId", async (req: Request, res: Response) => {
  try {
    const { twitterId } = req.params;
    const balance = await getPendingBalance(twitterId);
    res.json({
      twitterId,
      pendingBalance: balance,
      symbol: activeChain.nativeCurrency.symbol,
    });
  } catch (err: any) {
    res.status(500).json({ code: "CHAIN_001", message: "Failed to read pending balance" });
  }
});

router.get("/api/somnia/balance/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        code: "VALIDATION_007",
        message: "Valid EVM address is required",
      });
    }
    const balance = await getAddressBalance(address as `0x${string}`);
    res.json({ address, balance, symbol: activeChain.nativeCurrency.symbol });
  } catch (err: any) {
    res.status(500).json({ code: "CHAIN_002", message: "Failed to read balance" });
  }
});

router.post("/api/somnia/register", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { twitterId, wallet } = req.body as { twitterId?: string; wallet?: string };

    const targetTwitterId = twitterId || user.twitterId;
    const targetWallet =
      wallet || user.embeddedWalletAddress || user.linkedWalletAddress;

    if (!targetTwitterId || !targetWallet) {
      return res.status(400).json({
        code: "VALIDATION_008",
        message: "twitterId and wallet are required",
      });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(targetWallet)) {
      return res.status(400).json({
        code: "VALIDATION_009",
        message: "Valid EVM wallet address is required",
      });
    }

    // Authorization: user can only register their own twitter id
    if (targetTwitterId !== user.twitterId) {
      return res.status(403).json({
        code: "AUTHZ_001",
        message: "Cannot register a wallet for another user",
      });
    }

    const txHash = await registerWalletOnChain(
      targetTwitterId,
      targetWallet as `0x${string}`
    );
    res.status(200).json({
      success: true,
      txHash,
      explorer: `${activeChain.blockExplorers?.default.url}/tx/${txHash}`,
    });
  } catch (err: any) {
    res.status(500).json({ code: "CHAIN_003", message: "Failed to register wallet on-chain" });
  }
});

// ─── Users (public profile) ───────────────────────────────────────────────────

router.get("/api/users/:twitterId", async (req: Request, res: Response) => {
  try {
    const { twitterId } = req.params;
    const user = await getUserByTwitterId(twitterId);
    if (!user) {
      return res.status(404).json({ code: "USER_001", message: "User not found" });
    }
    res.json(publicUserView(user));
  } catch (err: any) {
    res.status(500).json({ code: "USER_002", message: "Failed to fetch user" });
  }
});

export default router;
