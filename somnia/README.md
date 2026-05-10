# Xenia × Somnia Network

Xenia is a social tipping platform built on Somnia Network — tip anyone on X (Twitter) instantly with sub-second finality and near-zero fees.

## Somnia Network

| Property | Testnet | Mainnet |
|----------|---------|---------|
| Chain ID | 50312 | 50313 |
| Symbol | STT | SOMI |
| RPC | https://dream-rpc.somnia.network | https://mainnet-rpc.somnia.network |
| Explorer | https://shannon-explorer.somnia.network | https://explorer.somnia.network |

## Project Structure

```
somnia/
├── contracts/               # Hardhat — Solidity contracts for Somnia
│   ├── contracts/
│   │   ├── Escrow.sol               # Tipping + escrow system
│   │   └── ScreenshotRegistry.sol   # Proof of Post
│   ├── scripts/deploy.js            # Deploy script
│   └── hardhat.config.js            # Somnia RPC + chainId config
│
├── server/                  # Node.js backend
│   ├── somnia.ts            # Viem client, chain definitions, helpers
│   └── routes.ts            # /api/somnia/* endpoints
│
├── client/src/              # React frontend
│   └── App.tsx              # Privy — Somnia as defaultChain
│
├── extension/               # Chrome extension
│   ├── manifest.json        # Somnia host_permissions
│   └── src/
│       └── somnia-network.js    # wallet_addEthereumChain + ensureSomniaChain()
│
└── somnia-skills/           # AI Skill (OpenClaw / Claude)
    ├── SKILL.md             # Skill definition and menu
    ├── api_client_cli.py    # RPC + API client
    └── requirements.txt
```

## Setup

### 1. Deploy Contracts (Testnet)

```bash
cd somnia/contracts
cp .env.example .env
# Add PRIVATE_KEY to .env (wallet with Somnia testnet STT)
npm install
npm run deploy:testnet
# Copy ESCROW_CONTRACT_ADDRESS and REGISTRY_CONTRACT_ADDRESS from output
```

### 2. Backend

```bash
cd somnia/server
cp .env.example .env
# Fill in contract addresses, Privy keys, Twitter API keys
npm install
npm run dev
```

New endpoints:
- `GET /api/somnia/network` — Network and contract info
- `GET /api/somnia/pending/:twitterId` — Unclaimed escrow balance
- `GET /api/somnia/balance/:address` — Wallet balance
- `POST /api/somnia/register` — Register wallet after Privy login

### 3. Frontend

```bash
cd somnia/client
# App.tsx is already configured for Somnia testnet
# For mainnet: VITE_SOMNIA_CHAIN=mainnet npm run build
npm run dev
```

### 4. Extension

Merge `somnia/extension/manifest.json` and `src/somnia-network.js` into the extension build:

1. Add `src/somnia-network.js` as the first entry in `content_scripts`
2. Add Somnia RPC URLs to `host_permissions`
3. Call `window.ensureSomniaChain(provider)` before sending any transaction

### 5. AI Skill

```bash
cd somnia/somnia-skills
pip install -r requirements.txt
python api_client_cli.py --mode metrics_basic
```

## How Viral Tipping Works

1. User clicks **Tip** on a tweet inside the Xenia extension
2. Extension calls `Escrow.tip(recipientTwitterId)` on Somnia — transaction confirms in < 1 second
3. **If recipient is registered:** SOMI lands in their wallet instantly
4. **If recipient is not registered:** Funds are locked in escrow; Xenia bot tweets: *"Hey! You have a pending tip on Somnia. Connect your wallet to claim it."*
5. Recipient signs up via Privy → backend calls `registerWallet` on-chain → they claim with zero friction

## Why Somnia

| | Previous Chain | Somnia |
|---|---|---|
| Finality | ~3s | < 1s |
| Gas per tip | ~$0.05 | < $0.001 |
| TPS | ~2,000 | 1,000,000+ |
| EVM compatible | Yes | Yes |
