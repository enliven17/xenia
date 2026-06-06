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
  getTransactionById,
  updateTransactionStatus,
  confirmTransaction,
  getPendingClaimsByRecipient,
  markClaimClaimed,
  getPendingUnnotified,
  markClaimNotified,
  indexPendingClaim,
} from "./storage";
import {
  activeChain,
  getPendingBalance,
  getAddressBalance,
  ensureWalletRegistered,
  registerScreenshotOnChain,
  getProofByTweetId,
  getBotAddress,
  getEscrowTipFromReceipt,
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

// Confirm a tip by its DB row id after the client signs the on-chain tip.
// The row is created (txHash=null) by POST /api/tips/send, then this attaches
// the real tx hash — confirming by txHash alone would never match the null row.
router.post("/api/tips/:id/confirm", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { txHash, status } = req.body as { txHash?: string; status?: string };
    const finalStatus = status ?? "confirmed";

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ code: "VALIDATION_010", message: "Valid tip id is required" });
    }
    if (!["pending", "confirmed", "failed"].includes(finalStatus)) {
      return res.status(400).json({
        code: "VALIDATION_004",
        message: "status must be pending|confirmed|failed",
      });
    }
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return res.status(400).json({ code: "VALIDATION_005", message: "Valid txHash is required" });
    }

    await confirmTransaction(id, txHash, finalStatus);

    // If this tip landed in escrow (recipient unregistered), index it as a
    // pending claim so the recipient sees + can claim it. The TipSent event is
    // only present for escrow tips; a direct transfer produces no claim row.
    if (finalStatus === "confirmed") {
      try {
        const tx = await getTransactionById(id);
        if (tx && tx.type === "escrow") {
          const escrow = await getEscrowTipFromReceipt(txHash as `0x${string}`);
          if (escrow) {
            const senderUser = await getUserByTwitterId(tx.fromTwitterId);
            await indexPendingClaim({
              recipientTwitterId: tx.toTwitterId,
              senderTwitterId: senderUser?.twitterHandle || tx.fromTwitterId,
              senderAddress: escrow.senderAddress,
              amount: escrow.amount,
              amountFormatted: escrow.amountFormatted,
              txHash,
              escrowIndex: escrow.escrowIndex,
              status: "pending",
            });
          }
        }
      } catch (indexErr) {
        // Non-fatal: the tip settled on-chain; indexing can be retried/backfilled.
      }
    }

    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ code: "TX_003", message: "Failed to confirm tip" });
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
    // Address users authorize() for Mode B bot-delegated tipping.
    botAddress: getBotAddress(),
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
    const { wallet } = req.body as { wallet?: string };

    // Escrow is keyed by the lowercased Twitter handle — the only identifier a
    // sender knows at tip time for an unregistered recipient. Always bind the
    // authenticated user's OWN handle (ignore any body twitterId) so the key
    // used here matches tip() and claim() everywhere else.
    const handleKey = String(user.twitterHandle ?? "").trim().toLowerCase();
    const targetWallet =
      wallet || user.embeddedWalletAddress || user.linkedWalletAddress;

    if (!handleKey || !targetWallet) {
      return res.status(400).json({
        code: "VALIDATION_008",
        message: "twitterHandle and wallet are required",
      });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(targetWallet)) {
      return res.status(400).json({
        code: "VALIDATION_009",
        message: "Valid EVM wallet address is required",
      });
    }

    const { txHash, alreadyRegistered } = await ensureWalletRegistered(
      handleKey,
      targetWallet as `0x${string}`
    );
    res.status(200).json({
      success: true,
      alreadyRegistered,
      txHash,
      explorer: txHash
        ? `${activeChain.blockExplorers?.default.url}/tx/${txHash}`
        : null,
    });
  } catch (err: any) {
    // A binding conflict (handle already bound to a different wallet) is a
    // client-actionable 409, not a server fault.
    if (typeof err?.message === "string" && err.message.includes("different wallet")) {
      return res.status(409).json({ code: "CHAIN_004", message: err.message });
    }
    res.status(500).json({ code: "CHAIN_003", message: "Failed to register wallet on-chain" });
  }
});

// ─── Proof of Post (ScreenshotRegistry) ─────────────────────────────────────────

// Register a screenshot proof on-chain. registerScreenshot is onlyOwner on the
// contract, so this is signed by the backend (registry owner) wallet.
router.post("/api/proof/register", requireAuth, async (req: Request, res: Response) => {
  try {
    const { cid, tweetId } = req.body as { cid?: string; tweetId?: string };

    if (!cid || typeof cid !== "string" || cid.trim().length === 0) {
      return res.status(400).json({
        code: "VALIDATION_010",
        message: "cid is required",
      });
    }
    if (!tweetId || typeof tweetId !== "string" || !/^\d+$/.test(tweetId)) {
      return res.status(400).json({
        code: "VALIDATION_011",
        message: "Valid tweetId is required",
      });
    }

    const txHash = await registerScreenshotOnChain(cid.trim(), tweetId);
    res.status(201).json({
      success: true,
      cid: cid.trim(),
      tweetId,
      txHash,
      explorer: `${activeChain.blockExplorers?.default.url}/tx/${txHash}`,
    });
  } catch (err: any) {
    // Surface contract-level duplicate rejections as a 409 without leaking internals.
    const reason: string = err?.shortMessage || err?.message || "";
    if (/already registered/i.test(reason)) {
      return res.status(409).json({
        code: "CHAIN_005",
        message: "This CID or tweet is already registered on-chain",
      });
    }
    res.status(500).json({ code: "CHAIN_004", message: "Failed to register proof on-chain" });
  }
});

// Look up the on-chain proof for a tweet. Public: anyone can verify a proof.
router.get("/api/proof/:tweetId", async (req: Request, res: Response) => {
  try {
    const { tweetId } = req.params;
    if (!/^\d+$/.test(tweetId)) {
      return res.status(400).json({
        code: "VALIDATION_012",
        message: "Valid tweetId is required",
      });
    }

    const proof = await getProofByTweetId(tweetId);
    if (!proof) {
      return res.status(404).json({
        code: "PROOF_001",
        message: "No proof registered for this tweet",
      });
    }

    res.json({
      tweetId: proof.tweetId,
      cid: proof.cid,
      timestamp: proof.timestamp,
      recorder: proof.recorder,
      explorer: `${activeChain.blockExplorers?.default.url}/address/${proof.recorder}`,
    });
  } catch (err: any) {
    res.status(500).json({ code: "CHAIN_006", message: "Failed to read proof" });
  }
});

// ─── Bot (shared-key auth) ──────────────────────────────────────────────────

// The Twitter bot authenticates with a shared secret sent as X-Extension-Key,
// matched against XENIA_BOT_API_KEY. Never falls open: if the env is unset,
// every bot request is rejected.
function isBotRequest(req: Request): boolean {
  const expected = process.env.XENIA_BOT_API_KEY;
  const got = req.header("X-Extension-Key");
  return !!expected && !!got && got === expected;
}

router.get("/api/bot/pending-notifications", async (req: Request, res: Response) => {
  if (!isBotRequest(req)) {
    return res.status(401).json({ code: "AUTH_003", message: "Invalid bot key" });
  }
  try {
    const claims = await getPendingUnnotified();
    res.json(claims);
  } catch (err: any) {
    res.status(500).json({ code: "BOT_001", message: "Failed to fetch notifications" });
  }
});

router.post("/api/bot/claims/:id/notified", async (req: Request, res: Response) => {
  if (!isBotRequest(req)) {
    return res.status(401).json({ code: "AUTH_003", message: "Invalid bot key" });
  }
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ code: "VALIDATION_013", message: "Valid claim id is required" });
    }
    await markClaimNotified(id);
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ code: "BOT_002", message: "Failed to mark notified" });
  }
});

// Mode B: the bot reports an escrow tip it made via tipOnBehalf so the
// recipient sees + can claim it. Idempotent on (txHash, escrowIndex).
router.post("/api/bot/record-claim", async (req: Request, res: Response) => {
  if (!isBotRequest(req)) {
    return res.status(401).json({ code: "AUTH_003", message: "Invalid bot key" });
  }
  try {
    const b = req.body as Record<string, unknown>;
    const recipientTwitterId = String(b.recipientTwitterId ?? "").trim().toLowerCase();
    const senderTwitterId = String(b.senderTwitterId ?? "").trim();
    const senderAddress = String(b.senderAddress ?? "");
    const amount = String(b.amount ?? "");
    const amountFormatted = String(b.amountFormatted ?? "");
    const txHash = String(b.txHash ?? "");
    const escrowIndex = Number(b.escrowIndex);

    if (!recipientTwitterId || !senderTwitterId || !amount || !amountFormatted) {
      return res.status(400).json({ code: "VALIDATION_014", message: "Missing claim fields" });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(senderAddress)) {
      return res.status(400).json({ code: "VALIDATION_015", message: "Valid senderAddress required" });
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return res.status(400).json({ code: "VALIDATION_016", message: "Valid txHash required" });
    }
    if (!Number.isInteger(escrowIndex) || escrowIndex < 0) {
      return res.status(400).json({ code: "VALIDATION_017", message: "Valid escrowIndex required" });
    }

    const claim = await indexPendingClaim({
      recipientTwitterId,
      senderTwitterId,
      senderAddress: senderAddress as `0x${string}`,
      amount,
      amountFormatted,
      txHash,
      escrowIndex,
      status: "pending",
    });
    res.status(200).json({ success: true, created: !!claim });
  } catch (err: any) {
    res.status(500).json({ code: "BOT_003", message: "Failed to record claim" });
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

export function registerRoutes(app: import("express").Application) {
  app.use(router);
}
