# Xenia — SocialFi Tipping on Somnia Network

**Submission package — Checkpoint**
Project: **Xenia**
Network: **Somnia** (Testnet `50312` / Mainnet `50313`)
Submission date: 2026-05-27

---

## 1. TL;DR

Xenia turns every post on **X (Twitter)** into a tippable on-chain action.
A Chrome extension injects a **Tip** button into the X feed; the click triggers a transaction on **Somnia Network** that either lands instantly in the recipient's wallet or is held in an on-chain **escrow** until the recipient signs up — at which point the funds are claimed with one click.

The whole stack — contracts, backend, web dashboard, and extension — is built **specifically around Somnia's strengths**: sub-second finality and sub-cent gas make per-tweet micro-tipping economically viable for the first time, and the high-throughput EVM makes on-chain Proof-of-Post (anchoring screenshot CIDs of tipped tweets) cheap enough to do on every interaction.

---

## 2. The problem

Tipping creators on social media is broken in two ways:

1. **Web2 tipping** (Twitter Tips, Patreon, Ko-Fi) requires both sides to sign up to a platform, takes 2-30% in fees, and pays out in days.
2. **Web3 tipping** is mostly chain-native — you can only tip someone who already has a wallet on the right chain, and the gas per tip on most L1s/L2s is often greater than the tip itself.

The end result: tipping isn't a fluid, in-feed gesture. It's a friction-filled chore that almost no one does.

---

## 3. The Xenia solution

Xenia removes both walls:

- **Tip anyone, even non-crypto users.** Tips to unregistered recipients are held in an on-chain escrow. The recipient receives a notification and can claim their funds with one wallet sign-up via Privy (Twitter login + embedded wallet). Funds land instantly.
- **Tipping is a single click inside X.** The Chrome extension injects a Tip button into every tweet. Behind the scenes it auto-adds Somnia to MetaMask (`wallet_addEthereumChain`) so users never have to manually configure the network.
- **Two tipping modes, one contract.**
  - **Mode A — Direct tip:** User clicks Tip in the extension → `Escrow.tip(twitterId)` sends STT/SOMI from their wallet.
  - **Mode B — Twitter-command tip:** User pre-deposits funds with `Escrow.deposit()` and `authorize(bot)`. They then tweet `@XeniaBot tip @recipient 5`. The bot calls `tipOnBehalf()` — the bot is *only* allowed to forward tips, never to withdraw funds.
- **On-chain Proof-of-Post.** Every tipped tweet gets its screenshot CID + tweet ID anchored on Somnia via `ScreenshotRegistry.sol`, giving an immutable record. This is only feasible at Somnia's gas levels.

---

## 4. Why Somnia (and not another chain)

| Property | Typical L1/L2 | **Somnia** | Why it matters for Xenia |
|---|---|---|---|
| Finality | 2-12s | **< 1s** | Tipping in-feed feels like Web2 — no spinner, no "wait for confirmation" |
| Gas / tip | $0.05 - $1.00 | **< $0.001** | Per-tweet micro-tipping ($0.10 - $1.00 tips) is finally economically sane |
| TPS | 100 - 4,000 | **1,000,000+** | Headroom for a viral SocialFi app without congestion fee spikes |
| EVM | Yes | **Yes** | Solidity + Hardhat + Viem stack ports cleanly |

Xenia was originally built on a slower chain. **The Somnia migration is what enables the consumer-grade UX** — sub-second finality changes the gesture from "I'm sending a transaction" to "I just tapped a button."

---

## 5. Architecture overview

```
                ┌──────────────────────────────────────────────────────┐
                │                  Somnia Network                       │
                │   ┌────────────────────┐   ┌─────────────────────┐  │
                │   │   Escrow.sol       │   │ ScreenshotRegistry  │  │
                │   │   ─ tip()          │   │ ─ registerProof()   │  │
                │   │   ─ deposit()      │   │ ─ verifyProof()     │  │
                │   │   ─ authorize()    │   └─────────────────────┘  │
                │   │   ─ tipOnBehalf()  │                            │
                │   │   ─ claim()        │                            │
                │   │   ─ refund()       │                            │
                │   │   ─ registerWallet │                            │
                │   └─────────▲──────────┘                            │
                └─────────────┼───────────────────────────────────────┘
                              │ Viem (RPC)
                ┌─────────────┴───────────────┐
                │   Backend (Node / Express)  │
                │   ─ Privy server-auth       │
                │   ─ Drizzle ORM + Postgres  │
                │   ─ /api/somnia/* endpoints │
                │   ─ Twitter API listener    │
                └────────┬───────────────┬────┘
                         │               │
                ┌────────▼─────┐  ┌──────▼──────────────┐
                │ React web    │  │ Chrome extension    │
                │ (Privy +     │  │ (content script on  │
                │  Somnia      │  │  x.com — injects    │
                │  default-    │  │  Tip button + auto- │
                │  Chain)      │  │  adds Somnia to MM) │
                └──────────────┘  └─────────────────────┘
```

---

## 6. Repository layout

```
somnia/
├── contracts/                  # Hardhat — Solidity for Somnia
│   ├── contracts/
│   │   ├── Escrow.sol                 # Tipping + escrow + bot delegation
│   │   └── ScreenshotRegistry.sol     # Proof-of-Post (CID + tweetId)
│   ├── scripts/deploy.js              # Deploy script
│   └── hardhat.config.js              # Somnia RPC + chainId config
│
├── server/                     # Node.js backend
│   ├── somnia.ts               # Viem clients, chain defs, contract helpers
│   ├── routes.ts               # REST API (incl. /api/somnia/*)
│   ├── auth.ts                 # Privy session + JWT verification
│   ├── db.ts / storage.ts      # Drizzle ORM + Postgres
│   └── index.ts                # Express bootstrap
│
├── client/src/                 # React 18 + Vite + Tailwind + shadcn/ui
│   ├── App.tsx                 # Privy w/ Somnia as defaultChain
│   └── pages/                  # landing, dashboard, send-tips, batch-send,
│                                 deposit, claims, transactions,
│                                 link-wallet, extension-key, export-key
│
├── extension/                  # Chrome extension (MV3)
│   ├── manifest.json           # Somnia host_permissions
│   └── src/
│       ├── somnia-network.js   # window.SOMNIA_CHAIN + ensureSomniaChain()
│       ├── content.js          # Injects Tip UI into x.com / twitter.com
│       ├── auth-sync.js        # Syncs Privy session from xenia.app
│       ├── background.js       # MV3 service worker
│       └── popup.js            # Side panel UI
│
└── somnia-skills/              # AI skill (Claude / OpenClaw)
    ├── SKILL.md                # Skill spec + interactive menu
    ├── api_client_cli.py       # Somnia RPC + Xenia API client
    └── requirements.txt
```

---

## 7. Smart contracts

### 7.1 `Escrow.sol`

Single contract that handles both tipping modes and the lifecycle of unclaimed funds.

**State**
- `pendingTips[twitterId][] → Tip(sender, amount, ts, claimed, refunded)`
- `pendingBalance[twitterId] → uint256`
- `registeredWallets[twitterId] → address` (immutable once set)
- `walletToTwitter[address] → string`
- `depositedBalance[user] → uint256` (Mode B)
- `authorized[user][delegate] → bool` (Mode B authorization)
- `accumulatedFees` (tracked **separately** from user funds)
- `platformFeePercent` (basis points, max 5%, default 1%)

**Key functions**

| Function | Mode | Description |
|---|---|---|
| `tip(twitterId)` payable | A | If recipient registered → direct transfer; else → push to escrow. |
| `deposit()` payable | B | Adds STT to user's internal balance. |
| `authorize(delegate)` | B | Allow `delegate` (the Xenia bot) to call `tipOnBehalf` for this user. The bot **cannot** withdraw. |
| `tipOnBehalf(sender, twitterId, amount)` | B | Bot-callable; forwards `amount` from `sender`'s deposit to `twitterId`. |
| `claim(twitterId)` | — | The registered wallet claims all pending escrow tips. |
| `refund(twitterId, idx)` | — | Sender refunds a specific tip after **90 days** of no claim. |
| `registerWallet(twitterId, wallet)` | — | `onlyOwner` (backend) — binds Twitter ID ↔ wallet permanently. |
| `setFee` / `withdrawFees` / two-step ownership | — | Admin. |

**Security**
- `nonReentrant` modifier on every external value-moving call.
- `accumulatedFees` stored separately so user funds can never be touched by fee withdrawals.
- `registeredWallets[twitterId]` is **immutable** once set (no rebind).
- `tipOnBehalf` can only push funds out to the resolved recipient (registered wallet or escrow) — it cannot route to arbitrary addresses.
- **Two-step ownership transfer** (`transferOwnership` → `acceptOwnership`).
- 90-day refund window for senders if the recipient never registers.

### 7.2 `ScreenshotRegistry.sol`

Lightweight on-chain Proof-of-Post.

| Function | Description |
|---|---|
| `registerScreenshot(cid, tweetId)` | `onlyOwner`. Stores IPFS CID + tweet ID + timestamp + recorder. Rejects duplicates on either key. |
| `verifyScreenshot(cid)` | Returns `(timestamp, tweetId, recorder)`. |
| `getProofByTweetId(tweetId)` | Reverse lookup. |
| Two-step ownership transfer | Admin. |

---

## 8. Backend

- **Framework:** Node + Express, ESM, TypeScript, `tsx watch` in dev.
- **Chain client:** Viem with `defineChain` for both **Somnia Testnet (50312, STT)** and **Somnia Mainnet (50313, SOMI)**. Active chain picked from `SOMNIA_CHAIN_ID` env at boot.
- **Auth:** Privy server-auth verifies session JWTs. Twitter login is the default sign-in path; embedded wallet is created on first login.
- **DB:** Drizzle ORM on Neon-compatible Postgres (`@neondatabase/serverless`) with `connect-pg-simple` sessions.
- **Twitter:** `twitter-api-v2` powers the bot listener for Mode B and the post-tip notification ("Hey, you have a pending tip on Somnia, claim it…").

### REST endpoints (selected)

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/config/privy` | Boot config for the React app. |
| `GET`  | `/api/auth/user` | Current user from session. |
| `POST` | `/api/wallets/link` | Link an additional wallet. |
| `POST` | `/api/tips/send` | Server-assisted tip path. |
| `GET`  | `/api/claims` | List unclaimed escrow tips for the user. |
| `GET`  | `/api/transactions` | Tip history. |
| `GET`  | `/api/somnia/network` | Chain ID, RPC, contract addresses. |
| `GET`  | `/api/somnia/pending/:twitterId` | Pending escrow balance for a Twitter ID. |
| `GET`  | `/api/somnia/balance/:address` | Native STT/SOMI balance. |
| `POST` | `/api/somnia/register` | Backend calls `registerWallet(twitterId, wallet)` on-chain after Privy sign-up. |
| `GET`  | `/api/extension/key` / `/api/extension/verify` | Pairing key for the Chrome extension. |

---

## 9. Frontend (web dashboard)

- **Stack:** React 18 + Vite + Tailwind v4 (alpha) + shadcn/ui (Radix primitives) + Wouter routing + TanStack Query.
- **Auth:** `@privy-io/react-auth` with `loginMethods: ["twitter", "wallet"]`, `defaultChain` set to Somnia (testnet or mainnet via `VITE_SOMNIA_CHAIN` build var).
- **Pages**

| Route | Purpose |
|---|---|
| `/` | Landing — explains Xenia + Somnia |
| `/dashboard` | Balance, recent activity, quick actions |
| `/send-tips` | Single tip flow (X handle → STT amount) |
| `/batch-send` | Multi-recipient tipping |
| `/deposit` | Deposit + authorize bot for Mode B |
| `/claims` | Claim pending escrow tips |
| `/transactions` | On-chain history (links to Somnia explorer) |
| `/link-wallet` | Bind an external wallet alongside the Privy embedded wallet |
| `/export-key` / `/extension-key` | Self-custody export + extension pairing |

---

## 10. Chrome extension (MV3)

- **Name:** `Xenia — Tip on Somnia` (v2.0.0)
- **Injects on:** `x.com` and `twitter.com`
- **Critical file:** `extension/src/somnia-network.js` — runs **before** `content.js` and exposes:

```js
window.SOMNIA_CHAIN = {
  chainId: "0xC488",          // 50312
  chainName: "Somnia Shannon Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: ["https://dream-rpc.somnia.network"],
  blockExplorerUrls: ["https://shannon-explorer.somnia.network"],
};

window.ensureSomniaChain = async (provider) => {
  // 1. eth_chainId
  // 2. wallet_switchEthereumChain
  // 3. on 4902 → wallet_addEthereumChain
};
```

Every transaction in the extension flow calls `ensureSomniaChain(provider)` first — so a user with MetaMask but no Somnia config gets the network added automatically the first time they tip. No manual chain setup ever.

- **Side panel** for the wallet view (`sidePanel` API).
- **Pairing** with the web app via `/api/extension/key` so the extension can authenticate against the backend without re-logging-in to Privy.

---

## 11. AI skill (`somnia-skills/`)

A Claude / OpenClaw skill (`SKILL.md` + `api_client_cli.py`) that exposes Somnia data programmatically. The interactive menu lets an AI agent query:

1. Network metrics (block height, gas, chain ID)
2. Wallet balance
3. Pending escrow tips for a Twitter ID
4. 24h tip leaderboard
5. DApp activity rank
6. Social hype for Somnia projects
7. TVL rank for Somnia DeFi

This means Xenia's data is directly accessible from any Claude / Claude Code session — useful for analytics, support agents, and dashboards.

---

## 12. End-to-end "tip a stranger" flow

1. **Alice** is browsing X, sees a great tweet from `@bob_unregistered`.
2. She clicks the **Tip** button injected by the Xenia extension.
3. Extension calls `ensureSomniaChain(provider)` — if her MetaMask doesn't have Somnia, it's added in one click.
4. Extension calls `Escrow.tip("bob_unregistered_twitter_id")` with `value = 1 STT`.
5. Tx is mined on Somnia in **< 1 second**. Because Bob is not registered, the contract pushes the tip into `pendingTips["bob_twitter_id"]`.
6. Xenia's bot tweets at Bob: *"Hey @bob_unregistered, you got 0.99 STT on Somnia from @alice. Claim → xenia.app."*
7. Bob signs up via Privy (Twitter login → embedded wallet auto-created).
8. Backend calls `Escrow.registerWallet("bob_twitter_id", bobsWallet)` — **immutable** binding on-chain.
9. Bob calls `Escrow.claim("bob_twitter_id")` from the dashboard. **0.99 STT lands in his wallet.**
10. Total elapsed time on chain: a few seconds. Total wallet config Bob had to do: zero.

---

## 13. End-to-end "Twitter-command" flow (Mode B)

1. Carol calls `Escrow.deposit()` with `value = 50 STT` from the dashboard.
2. Carol calls `Escrow.authorize(XENIA_BOT_ADDRESS)`.
3. Carol tweets: `@XeniaBot tip @dave 5`
4. Bot detects the tweet, resolves `@dave` → Twitter ID, calls `Escrow.tipOnBehalf(carol, dave_id, 5e18)`.
5. Contract verifies `authorized[carol][bot] == true`, debits `depositedBalance[carol]`, and either pays Dave directly (if registered) or escrows the tip.
6. Bot replies under the tweet with the tx hash on Somnia explorer.

Bot **cannot** withdraw, **cannot** route to arbitrary addresses, and Carol can `deauthorize` or `withdrawDeposit` at any time.

---

## 14. Security checklist

- [x] `nonReentrant` on every value-moving external call (`tip`, `claim`, `refund`, `deposit`, `withdrawDeposit`, `tipOnBehalf`, `withdrawFees`).
- [x] Fee accounting **separated** from user funds (`accumulatedFees` is its own variable; `withdrawFees` never touches user balances).
- [x] Wallet binding immutable (`registeredWallets[twitterId]` cannot be overwritten).
- [x] Bot delegation is scoped to forwarding only — `tipOnBehalf` cannot move funds to arbitrary addresses.
- [x] 90-day sender refund safety net (`REFUND_DELAY`) for unclaimed escrow.
- [x] Two-step ownership transfer on both contracts.
- [x] `setFee` capped at 5% (500 bps).
- [x] Backend never holds user private keys — Privy embedded wallets stay client-side.
- [x] Extension uses `declarativeNetRequest` + scoped `host_permissions` (only x.com, twitter.com, Somnia RPC, Somnia explorer, xenia.app).
- [x] CSP locks down extension pages (`script-src 'self'; object-src 'self'`).

---

## 15. What's done at this checkpoint

- [x] Two production-grade Solidity contracts (`Escrow.sol` + `ScreenshotRegistry.sol`) compiled, tested, and ready to deploy via `npm run deploy:testnet` on Somnia.
- [x] Backend wired end-to-end to Somnia via Viem, with both testnet and mainnet chain definitions.
- [x] React frontend with Privy + Somnia as default chain, all major user flows (send, batch, deposit, claim, transactions) implemented.
- [x] Chrome extension MV3 with auto-add-Somnia logic and content-script tip UI.
- [x] AI skill for Somnia metrics / leaderboards / on-chain data.
- [x] Two-mode tipping (direct + bot-delegated) sharing the same escrow.

---

## 16. Roadmap after checkpoint

- Public mainnet deployment of both contracts (chainId `50313`, native SOMI).
- Public web release at `xenia.app` and Chrome Web Store listing.
- Mode B Twitter bot launch (`@XeniaBot`).
- Integration with a Somnia indexer for richer leaderboard / activity analytics.
- Audit pass on `Escrow.sol` before opening high-value flows.

---

## 17. Network reference

| Property | Testnet | Mainnet |
|---|---|---|
| Chain ID | `50312` | `50313` |
| Symbol | STT | SOMI |
| RPC | `https://dream-rpc.somnia.network` | `https://mainnet-rpc.somnia.network` |
| Explorer | `https://shannon-explorer.somnia.network` | `https://explorer.somnia.network` |

---

## 18. Contact

Built by **@vibeeval** — tarikkiziltan@gmail.com

> Xenia × Somnia — *tip the post, not the platform.*
