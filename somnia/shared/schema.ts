import {
  pgTable,
  text,
  serial,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * sessions — connect-pg-simple compatible session store.
 * Required columns: sid (PK), sess (jsonb), expire (timestamp).
 */
export const sessions = pgTable(
  "sessions",
  {
    sid: text("sid").primaryKey().notNull(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { mode: "date" }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  }),
);

/**
 * users — Twitter/X identity linked to a Privy embedded wallet on Somnia.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    twitterId: text("twitter_id").notNull().unique(),
    twitterHandle: text("twitter_handle").notNull(),
    twitterName: text("twitter_name"),
    twitterAvatar: text("twitter_avatar"),
    privyId: text("privy_id").unique(),
    embeddedWalletAddress: text("embedded_wallet_address"),
    linkedWalletAddress: text("linked_wallet_address"),
    extensionApiKey: text("extension_api_key").unique(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    twitterHandleIdx: index("IDX_users_twitter_handle").on(table.twitterHandle),
    privyIdIdx: index("IDX_users_privy_id").on(table.privyId),
  }),
);

/**
 * transactions — every tip attempt (direct on-chain or escrow-based).
 * status: pending | confirmed | failed
 * type:   direct | escrow | claim | refund
 */
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    fromTwitterId: text("from_twitter_id").notNull(),
    toTwitterId: text("to_twitter_id").notNull(),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    amount: text("amount").notNull(),
    amountFormatted: text("amount_formatted").notNull(),
    txHash: text("tx_hash"),
    status: text("status").notNull().default("pending"),
    type: text("type").notNull(),
    tweetId: text("tweet_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    fromIdx: index("IDX_tx_from_twitter").on(table.fromTwitterId),
    toIdx: index("IDX_tx_to_twitter").on(table.toTwitterId),
    statusIdx: index("IDX_tx_status").on(table.status),
    txHashIdx: index("IDX_tx_hash").on(table.txHash),
  }),
);

/**
 * pendingClaims — tips held in the on-chain Escrow contract for a recipient
 * who has not yet signed up. escrowIndex is the index returned by the
 * Escrow contract for the lock entry.
 */
export const pendingClaims = pgTable(
  "pending_claims",
  {
    id: serial("id").primaryKey(),
    recipientTwitterId: text("recipient_twitter_id").notNull(),
    senderTwitterId: text("sender_twitter_id").notNull(),
    senderAddress: text("sender_address").notNull(),
    amount: text("amount").notNull(),
    amountFormatted: text("amount_formatted").notNull(),
    txHash: text("tx_hash").notNull(),
    escrowIndex: integer("escrow_index").notNull(),
    status: text("status").notNull().default("pending"),
    notified: boolean("notified").default(false),
    claimedAt: timestamp("claimed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    recipientIdx: index("IDX_pc_recipient").on(table.recipientTwitterId),
    statusIdx: index("IDX_pc_status").on(table.status),
  }),
);

// ─── Zod insert schemas ──────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users, {
  twitterId: z.string().min(1),
  twitterHandle: z.string().min(1).max(64),
  twitterName: z.string().max(128).optional().nullable(),
  twitterAvatar: z.string().url().optional().nullable(),
  privyId: z.string().optional().nullable(),
  embeddedWalletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .nullable(),
  linkedWalletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .nullable(),
  extensionApiKey: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions, {
  fromTwitterId: z.string().min(1),
  toTwitterId: z.string().min(1),
  fromAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .nullable(),
  toAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .nullable(),
  amount: z.string().min(1),
  amountFormatted: z.string().min(1),
  txHash: z.string().optional().nullable(),
  status: z.enum(["pending", "confirmed", "failed"]).default("pending"),
  type: z.enum(["direct", "escrow", "claim", "refund"]),
  tweetId: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertPendingClaimSchema = createInsertSchema(pendingClaims, {
  recipientTwitterId: z.string().min(1),
  senderTwitterId: z.string().min(1),
  senderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().min(1),
  amountFormatted: z.string().min(1),
  txHash: z.string().min(1),
  escrowIndex: z.number().int().nonnegative(),
  status: z
    .enum(["pending", "claimed", "refunded", "expired"])
    .default("pending"),
  notified: z.boolean().optional(),
}).omit({
  id: true,
  createdAt: true,
  claimedAt: true,
});

// ─── TypeScript types ────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type PendingClaim = typeof pendingClaims.$inferSelect;
export type InsertPendingClaim = z.infer<typeof insertPendingClaimSchema>;

export type Session = typeof sessions.$inferSelect;
