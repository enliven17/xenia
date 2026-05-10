import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  transactions,
  pendingClaims,
  type User,
  type InsertUser,
  type Transaction,
  type InsertTransaction,
  type PendingClaim,
  type InsertPendingClaim,
} from "../shared/schema";

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByPrivyId(privyId: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.privyId, privyId)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByTwitterId(twitterId: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.twitterId, twitterId)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByExtensionApiKey(key: string): Promise<User | null> {
  if (!key) return null;
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.extensionApiKey, key))
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateOrUpdateUserData {
  twitterId: string;
  twitterHandle: string;
  twitterName?: string | null;
  twitterAvatar?: string | null;
  privyId: string;
  embeddedWalletAddress?: string | null;
}

export async function createOrUpdateUser(data: CreateOrUpdateUserData): Promise<User> {
  const existing = await getUserByTwitterId(data.twitterId);
  const now = new Date();

  if (existing) {
    const updated = await db
      .update(users)
      .set({
        twitterHandle: data.twitterHandle,
        twitterName: data.twitterName ?? existing.twitterName,
        twitterAvatar: data.twitterAvatar ?? existing.twitterAvatar,
        privyId: data.privyId,
        embeddedWalletAddress:
          data.embeddedWalletAddress ?? existing.embeddedWalletAddress,
        updatedAt: now,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated[0];
  }

  const inserted = await db
    .insert(users)
    .values({
      twitterId: data.twitterId,
      twitterHandle: data.twitterHandle,
      twitterName: data.twitterName ?? null,
      twitterAvatar: data.twitterAvatar ?? null,
      privyId: data.privyId,
      embeddedWalletAddress: data.embeddedWalletAddress ?? null,
      linkedWalletAddress: null,
      extensionApiKey: null,
      createdAt: now,
      updatedAt: now,
    } as InsertUser)
    .returning();
  return inserted[0];
}

export async function updateUserWallet(
  userId: number,
  address: string,
  type: "embedded" | "linked"
): Promise<User> {
  const patch =
    type === "embedded"
      ? { embeddedWalletAddress: address, updatedAt: new Date() }
      : { linkedWalletAddress: address, updatedAt: new Date() };

  const updated = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning();

  if (!updated[0]) {
    throw new Error(`User ${userId} not found`);
  }
  return updated[0];
}

export async function setExtensionApiKey(userId: number, key: string): Promise<void> {
  await db
    .update(users)
    .set({ extensionApiKey: key, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function createTransaction(data: InsertTransaction): Promise<Transaction> {
  const inserted = await db.insert(transactions).values(data).returning();
  return inserted[0];
}

export async function getTransactionsByUser(
  twitterId: string,
  limit = 50
): Promise<Transaction[]> {
  // Sender side
  const sent = await db
    .select()
    .from(transactions)
    .where(eq(transactions.fromTwitterId, twitterId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);

  // Recipient side
  const received = await db
    .select()
    .from(transactions)
    .where(eq(transactions.toTwitterId, twitterId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);

  // Merge + dedupe by id, sort by createdAt desc, cap at limit
  const map = new Map<number, Transaction>();
  for (const tx of [...sent, ...received]) {
    map.set(tx.id, tx);
  }
  return Array.from(map.values())
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, limit);
}

export async function updateTransactionStatus(
  txHash: string,
  status: string
): Promise<void> {
  await db
    .update(transactions)
    .set({ status })
    .where(eq(transactions.txHash, txHash));
}

// ─── Pending Claims ───────────────────────────────────────────────────────────

export async function createPendingClaim(
  data: InsertPendingClaim
): Promise<PendingClaim> {
  const inserted = await db.insert(pendingClaims).values(data).returning();
  return inserted[0];
}

export async function getPendingClaimsByRecipient(
  recipientTwitterId: string
): Promise<PendingClaim[]> {
  return db
    .select()
    .from(pendingClaims)
    .where(
      and(
        eq(pendingClaims.recipientTwitterId, recipientTwitterId),
        eq(pendingClaims.status, "pending")
      )
    )
    .orderBy(desc(pendingClaims.createdAt));
}

export async function markClaimClaimed(id: number): Promise<void> {
  await db
    .update(pendingClaims)
    .set({ status: "claimed", claimedAt: new Date() })
    .where(eq(pendingClaims.id, id));
}

export async function markClaimNotified(id: number): Promise<void> {
  await db
    .update(pendingClaims)
    .set({ notified: true })
    .where(eq(pendingClaims.id, id));
}

export async function getPendingUnnotified(): Promise<PendingClaim[]> {
  return db
    .select()
    .from(pendingClaims)
    .where(
      and(eq(pendingClaims.status, "pending"), eq(pendingClaims.notified, false))
    )
    .orderBy(desc(pendingClaims.createdAt));
}
