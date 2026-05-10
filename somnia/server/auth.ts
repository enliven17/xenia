import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { PrivyClient } from "@privy-io/server-auth";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { users, type User } from "@shared/schema";

// ─── Privy client ───────────────────────────────────────────────────────────

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.warn(
    "[xenia/auth] PRIVY_APP_ID / PRIVY_APP_SECRET missing — token verification will fail until configured.",
  );
}

export const privyClient = new PrivyClient(
  PRIVY_APP_ID ?? "missing-app-id",
  PRIVY_APP_SECRET ?? "missing-app-secret",
);

// ─── Types ──────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      privyUserId?: string;
    }
  }
}

export interface PrivyVerifiedClaims {
  userId: string;
  appId: string;
  issuer: string;
  issuedAt: number;
  expiration: number;
  sessionId?: string;
}

// ─── Token verification ─────────────────────────────────────────────────────

/**
 * Read the Authorization: Bearer <token> header and verify it with Privy.
 * Returns the verified claims, or null when the header is missing/invalid.
 */
export async function verifyPrivyToken(
  req: Request,
): Promise<PrivyVerifiedClaims | null> {
  const header = req.headers.authorization ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  try {
    const claims = await privyClient.verifyAuthToken(token);
    return {
      userId: claims.userId,
      appId: claims.appId,
      issuer: claims.issuer,
      issuedAt: Number(claims.issuedAt),
      expiration: Number(claims.expiration),
      sessionId: (claims as { sessionId?: string }).sessionId,
    };
  } catch (err) {
    console.warn(
      "[xenia/auth] Privy token verification failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pull the linked Twitter account off a Privy user, if any.
 */
function extractTwitterFromPrivyUser(privyUser: {
  linkedAccounts?: Array<Record<string, unknown>>;
}): {
  twitterId: string;
  twitterHandle: string;
  twitterName: string | null;
  twitterAvatar: string | null;
} | null {
  const linked = privyUser.linkedAccounts ?? [];
  const twitter = linked.find(
    (a) => a.type === "twitter_oauth" || a.type === "twitter",
  );
  if (!twitter) return null;
  const subject = String(
    twitter.subject ?? twitter.id ?? twitter.username ?? "",
  );
  const username = String(twitter.username ?? "");
  if (!subject || !username) return null;
  return {
    twitterId: subject,
    twitterHandle: username,
    twitterName:
      typeof twitter.name === "string" ? (twitter.name as string) : null,
    twitterAvatar:
      typeof twitter.profilePictureUrl === "string"
        ? (twitter.profilePictureUrl as string)
        : null,
  };
}

/**
 * Pull the embedded EVM wallet address off a Privy user, if any.
 */
function extractEmbeddedWallet(privyUser: {
  linkedAccounts?: Array<Record<string, unknown>>;
}): string | null {
  const linked = privyUser.linkedAccounts ?? [];
  const wallet = linked.find(
    (a) =>
      a.type === "wallet" &&
      (a.walletClientType === "privy" || a.connectorType === "embedded"),
  );
  if (!wallet) return null;
  const addr = wallet.address;
  return typeof addr === "string" ? addr : null;
}

/**
 * Find an existing user by Privy id, or create one from the Privy profile
 * (must have a linked Twitter/X account).
 */
async function upsertUserFromPrivy(privyUserId: string): Promise<User | null> {
  // 1) Try by privyId.
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.privyId, privyUserId))
    .limit(1);
  if (existing[0]) return existing[0];

  // 2) Otherwise, hydrate from Privy.
  let privyUser: Awaited<ReturnType<typeof privyClient.getUser>>;
  try {
    privyUser = await privyClient.getUser(privyUserId);
  } catch (err) {
    console.error("[xenia/auth] privy.getUser failed:", err);
    return null;
  }

  const twitter = extractTwitterFromPrivyUser(
    privyUser as unknown as {
      linkedAccounts?: Array<Record<string, unknown>>;
    },
  );
  if (!twitter) {
    // Login required Twitter — refuse.
    return null;
  }

  const embedded = extractEmbeddedWallet(
    privyUser as unknown as {
      linkedAccounts?: Array<Record<string, unknown>>;
    },
  );

  // 3) Maybe a user already exists for this Twitter id (linked before Privy migration).
  const byTwitter = await db
    .select()
    .from(users)
    .where(eq(users.twitterId, twitter.twitterId))
    .limit(1);

  if (byTwitter[0]) {
    const updated = await db
      .update(users)
      .set({
        privyId: privyUserId,
        twitterHandle: twitter.twitterHandle,
        twitterName: twitter.twitterName,
        twitterAvatar: twitter.twitterAvatar,
        embeddedWalletAddress:
          embedded ?? byTwitter[0].embeddedWalletAddress ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byTwitter[0].id))
      .returning();
    return updated[0] ?? null;
  }

  // 4) Brand new user.
  const inserted = await db
    .insert(users)
    .values({
      twitterId: twitter.twitterId,
      twitterHandle: twitter.twitterHandle,
      twitterName: twitter.twitterName,
      twitterAvatar: twitter.twitterAvatar,
      privyId: privyUserId,
      embeddedWalletAddress: embedded,
      extensionApiKey: generateExtensionApiKey(),
    })
    .returning();

  return inserted[0] ?? null;
}

// ─── Middleware ─────────────────────────────────────────────────────────────

/**
 * requireAuth — verifies a Privy JWT and attaches `req.user` (DB User row).
 * Responds 401 if the token is missing/invalid or no Twitter account is linked.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const claims = await verifyPrivyToken(req);
  if (!claims) {
    res.status(401).json({
      success: false,
      error: {
        code: "AUTH_001",
        message: "Missing or invalid authentication token",
      },
    });
    return;
  }

  try {
    const user = await upsertUserFromPrivy(claims.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: "AUTH_002",
          message:
            "Twitter/X account is required. Link your X account via Privy and try again.",
        },
      });
      return;
    }

    req.user = user;
    req.privyUserId = claims.userId;
    next();
  } catch (err) {
    console.error("[xenia/auth] requireAuth failed:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "AUTH_500",
        message: "Authentication subsystem error",
      },
    });
  }
}

/**
 * Cryptographically strong API key for the browser extension flow.
 */
export function generateExtensionApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
