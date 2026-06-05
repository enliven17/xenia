# Xenia — Deployment Guide

Frontend → **Vercel** · Backend → **Railway** · Database → **Neon** (Postgres) · Contracts → **Somnia**

Total time: ~20 minutes if all accounts are ready.

---

## 0. Prerequisites

| Account | What you need |
|---|---|
| **GitHub** | Your `aiext` repo pushed (the `somnia/` folder must be on a branch Vercel + Railway can read) |
| **Neon** | A free Postgres database — copy the connection string (`postgresql://…?sslmode=require`) |
| **Privy** | An app — copy the App ID and App Secret from the Privy dashboard |
| **Vercel** | Free tier is fine |
| **Railway** | Free trial / Hobby plan |
| **Somnia testnet STT** | A funded wallet (for `BACKEND_WALLET_PRIVATE_KEY`) |
| **Twitter / X dev** | API keys (only needed if you want the bot / OG-fetch flows) |

---

## 1. Deploy the contracts (one time)

```powershell
cd somnia/contracts
copy .env.example .env
# Edit .env → add PRIVATE_KEY of a wallet funded with Somnia testnet STT
npm install
npx hardhat run scripts/deploy.js --network somniaTestnet
```

The script prints two addresses. Save them — they go into the backend env:

```
ESCROW_CONTRACT_ADDRESS=0x…
REGISTRY_CONTRACT_ADDRESS=0x…
```

---

## 2. Deploy the backend on Railway

### 2.1 Create the project

1. Go to <https://railway.app/new> → **Deploy from GitHub repo** → pick your repo
2. **Important:** in Railway → Service → Settings → **Root Directory** = `somnia`
3. Railway auto-detects Node + reads `somnia/railway.json`
4. It will run:
   - **Build:** `npm install && npm run build`
   - **Start:** `npm start`
   - **Healthcheck:** `GET /api/health`

### 2.2 Set environment variables on Railway

In Railway → Service → **Variables**, paste all of these (values from your `.env.example`):

```
SOMNIA_CHAIN_ID=50312
SOMNIA_RPC_URL=https://dream-rpc.somnia.network
ESCROW_CONTRACT_ADDRESS=0x…              # from step 1
REGISTRY_CONTRACT_ADDRESS=0x…            # from step 1
BACKEND_WALLET_PRIVATE_KEY=0x…           # owner of the Escrow contract
DATABASE_URL=postgresql://…?sslmode=require
SESSION_SECRET=<openssl rand -hex 32>
CORS_ORIGINS=https://your-app.vercel.app   # ← fill in after step 3
PRIVY_APP_ID=clxxxx
PRIVY_APP_SECRET=…
TWITTER_BEARER_TOKEN=…
NODE_ENV=production
```

> `PORT` is set by Railway automatically — do **not** set it manually.

### 2.3 Initialize the database

After the first deploy, run the Drizzle push to create tables. Either:

- Locally: `DATABASE_URL=… npx drizzle-kit push` from inside `somnia/`, **or**
- Add it once as a custom Railway command, then remove.

### 2.4 Grab the Railway URL

Railway → Service → **Settings → Networking → Generate Domain**.
You'll get something like `xenia-production-abcd.up.railway.app`.

**Test it:**

```
https://xenia-production-abcd.up.railway.app/api/health
→ { "success": true, "data": { "service": "xenia", … } }
```

If you see that JSON, the backend is live. ✓

---

## 3. Deploy the frontend on Vercel

### 3.1 Wire the Railway URL into `vercel.json` ⚠️ MUST-DO

> 🚨 **STOP — this is the #1 thing people forget at deploy time.**
> `somnia/vercel.json` ships with a **placeholder** rewrite target:
> `https://REPLACE_WITH_RAILWAY_DOMAIN.up.railway.app`.
> If you deploy the frontend without replacing it, the page loads but **every
> `/api/*` call fails** (the browser proxies to a domain that doesn't exist),
> so login and the dashboard are dead on arrival.
>
> JSON does not allow comments, so this warning lives here in `DEPLOY.md`
> instead of inside `vercel.json`. To make sure no one ships the placeholder,
> **`npm run preflight` hard-fails** while it is still present (see §3.5).

Open `somnia/vercel.json` and replace the placeholder with your **real**
Railway domain from step 2.4:

```diff
-      "destination": "https://REPLACE_WITH_RAILWAY_DOMAIN.up.railway.app/api/:path*"
+      "destination": "https://xenia-production-abcd.up.railway.app/api/:path*"
```

Commit + push. (Vercel will pick up the change on the next deploy.)

> **Why this works:** Vercel rewrites `/api/*` calls from the browser to Railway invisibly. The frontend code keeps using bare `/api/...` paths — no code change. Cookies and CORS are simpler because the browser thinks every request is same-origin.

### 3.2 Create the Vercel project

1. <https://vercel.com/new> → import the repo
2. **Root Directory:** `somnia`
3. **Framework Preset:** Vite (auto-detected from `vercel.json`)
4. **Build Command:** `vite build` (from `vercel.json`)
5. **Output Directory:** `dist/public` (from `vercel.json`)
6. Click **Deploy**

### 3.3 Set Vercel environment variables

Vercel → Project → **Settings → Environment Variables**:

```
VITE_SOMNIA_CHAIN=testnet
```

> Only `VITE_*` variables get exposed to the browser. Backend secrets stay on Railway.

### 3.4 Update Railway's `CORS_ORIGINS`

Once Vercel gives you a URL (e.g. `https://xenia.vercel.app`):

1. Go to Railway → Service → Variables
2. Update: `CORS_ORIGINS=https://xenia.vercel.app,https://your-custom-domain.com`
3. Railway redeploys automatically.

### 3.5 Run the pre-flight gate (before every deploy)

A small zero-dependency script checks the things that silently break a deploy:
missing/placeholder env vars, the `vercel.json` placeholder, a malformed backend
wallet key, and whether your contract addresses actually have bytecode on the
configured Somnia chain.

```powershell
cd somnia
npm run preflight
```

```
✓ Pre-flight passed. Safe to deploy.      # exit 0 — go
✗ NOT READY — N blocking issue(s): …      # exit 1 — fix the listed items first
```

It reads `somnia/.env` (and falls back to real environment variables, matching
Railway/Vercel). To skip only the live RPC probe (e.g. offline):
`npm run preflight -- --no-chain`.

> Tip: wire this into CI as a required step before the deploy job so a
> placeholder or a wrong-chain contract address can never reach production.

---

## 4. Smoke test

| Check | Expected |
|---|---|
| `https://xenia.vercel.app/` | Landing page renders |
| `https://xenia.vercel.app/api/health` | JSON response (proxied via Vercel → Railway) |
| Click **Login with X** on landing | Privy popup, Twitter OAuth, redirect to `/dashboard` |
| `/dashboard` | Shows your STT balance (read from Somnia via the backend) |
| Open browser devtools → Application → Cookies | `xenia.sid` cookie set, `Secure`, `SameSite=None` |

If `/api/health` returns 404 on Vercel, the rewrite didn't take effect — recheck `vercel.json` and redeploy.

---

## 5. Optional — Custom domain

| Service | Steps |
|---|---|
| **Vercel** | Project → Domains → add `xenia.app` → follow DNS instructions |
| **Railway** | Service → Settings → Networking → add custom domain (e.g. `api.xenia.app`) |

If you point the API at `api.xenia.app`:

1. Update `vercel.json` rewrite destination → `https://api.xenia.app/api/:path*`
2. Update Railway `CORS_ORIGINS=https://xenia.app,https://www.xenia.app`

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vite build fails on Vercel: *"Could not resolve entry"* | Missing `client/index.html` | Already created in this repo — make sure it was pushed |
| `/api/*` returns 404 on Vercel | `vercel.json` rewrite still has `REPLACE_WITH_RAILWAY_DOMAIN` | Fill in the real Railway domain, redeploy. `npm run preflight` catches this before you push. |
| `npm run preflight` fails on a contract address | Address has no bytecode on the configured chain (wrong address or wrong `SOMNIA_CHAIN_ID`) | Re-check the addresses from step 1 and the chain id; redeploy contracts if needed |
| `/api/health` works but `/api/auth/user` returns 401 | CORS or session cookie not set | Check `CORS_ORIGINS` on Railway, ensure `NODE_ENV=production` so cookies are `Secure + SameSite=None` |
| Privy login popup but no session after redirect | `PRIVY_APP_ID` mismatch between frontend (`/api/config/privy`) and Privy dashboard | Verify on Railway, redeploy |
| `BACKEND_WALLET_PRIVATE_KEY not set` in Railway logs | Env var missing | Add it on Railway → redeploy |
| `registerWallet` reverts on-chain | Backend wallet is **not** the contract owner | Either redeploy contracts from the backend wallet, or `transferOwnership` to it |
| Database session errors | Missing `sessions` table | Run `drizzle-kit push` once against `DATABASE_URL` |

---

## 7. Quick checklist for your hackathon submission

- [ ] Contracts deployed → addresses noted
- [ ] `npm run preflight` passes (env complete, no placeholder, contracts have on-chain bytecode)
- [ ] Neon Postgres created → `DATABASE_URL` noted, schema pushed
- [ ] Privy app created → `PRIVY_APP_ID` + `PRIVY_APP_SECRET` noted
- [ ] Railway service live → `/api/health` returns 200
- [ ] `vercel.json` rewrite points at the real Railway domain
- [ ] Vercel deploy green → landing page loads
- [ ] `CORS_ORIGINS` on Railway includes the Vercel URL
- [ ] End-to-end login + dashboard flow works
- [ ] **A real tip transaction is verifiable on the Somnia explorer** (see §8)
- [ ] **Live link to paste in the submission form:** `https://xenia.vercel.app`

---

## 8. Real on-chain verification (after deploy)

A green landing page proves the frontend is up — it does **not** prove the app
actually writes to Somnia. Do this once after deploy to confirm a real tip
produces a real transaction on-chain.

### 8.1 Explorer URLs

| Chain | `SOMNIA_CHAIN_ID` | Explorer |
|---|---|---|
| Testnet | `50312` | <https://shannon-explorer.somnia.network> |
| Mainnet | `50313` | <https://explorer.somnia.network> |

### 8.2 Confirm the contracts are the live ones

1. Open the explorer, paste your `ESCROW_CONTRACT_ADDRESS` and
   `REGISTRY_CONTRACT_ADDRESS`.
2. Each page must show a **Contract** with bytecode and a creation tx — not an
   empty EOA. (This is exactly what `npm run preflight` probes via `eth_getCode`.)
3. Open your `BACKEND_WALLET_PRIVATE_KEY` address on the explorer and confirm it
   holds STT/SOMI for gas. If you can read the contract's `owner()`, confirm it
   equals this backend wallet — otherwise owner-only calls revert.

### 8.3 Trigger a real tip and trace the transaction

1. In the deployed app, log in with X and send a small test tip (e.g. the
   minimum amount) to a test recipient.
2. The backend broadcasts the tx and returns a **transaction hash**. Capture it:
   - from the success toast / network tab in the browser, **or**
   - from the Railway runtime logs (the `somnia.ts` calls log the broadcast hash).
3. Open `https://shannon-explorer.somnia.network/tx/<hash>` and verify:
   - **Status:** Success
   - **To:** your Escrow contract address
   - **From:** your backend wallet address
   - **Value / logs:** the tip amount and the emitted event (e.g. the
     deposit/tip event from the Escrow contract)

### 8.4 Cross-check from the chain directly (no UI)

You can confirm the same tx independently with a raw RPC call:

```powershell
curl -s -X POST https://dream-rpc.somnia.network ^
  -H "content-type: application/json" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionReceipt\",\"params\":[\"0xYOUR_TX_HASH\"]}"
```

A receipt with `"status":"0x1"` and `logs` populated = the tip is genuinely on
Somnia. `"status":"0x0"` = the tx reverted (most often: backend wallet is not the
contract owner, or out of gas — see the §6 troubleshooting table).

> Keep one verified tx hash + explorer link handy — it's the strongest proof for
> a hackathon submission that the app is truly on-chain, not mocked.
