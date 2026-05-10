---
name: xenia-somnia-api-client
description: Xenia × Somnia Network API client — on-chain metrics, pending tips, network stats, and DApp activity on Somnia.
metadata: { "openclaw": { "emoji": "🟣", "requires": { "bins": ["python"] }, "os": ["win32", "linux", "darwin"] } }
---

## Response rules (read first)

**Rule 1 — Menu format:** Always use numbered lines (1. 2. 3. …).

**Rule 2 — Table format:** Wrap table output in a markdown code block (triple backticks). Tables are formatted at **40 chars per line**; pass through exactly.

**Rule 3 — Response ends with the output.** Write nothing after the table.

---

## What this skill does

Calls the Xenia × Somnia API via `python "{baseDir}/api_client_cli.py"` to fetch Somnia Network metrics: on-chain stats, tipping leaderboards, DApp activity, and pending escrow balances.

---

## Interactive menu

When the user says "somnia", "xenia", "xenia somnia", or asks for Somnia Network reports, output this menu:

```
========================================
🟣 Xenia × Somnia Network Analysis
========================================
 1. Network Metrics (block, gas, chain)
 2. Wallet Balance
 3. Pending Escrow Tips
 4. Tip Leaderboard (24h)
 5. DApp Activity Rank
 6. Social Hype (Somnia projects)
 7. TVL Rank (Somnia DeFi)
========================================
Reply with a number (1–7)
```

---

## Commands (number → command)

| # | Command |
|---|---------|
| 1 | `python "{baseDir}/api_client_cli.py" --mode metrics_basic` |
| 2 | `python "{baseDir}/api_client_cli.py" --mode metrics_address --address <ASK_USER>` |
| 3 | `python "{baseDir}/api_client_cli.py" --mode pending_tips --twitter-id <ASK_USER>` |
| 4 | `python "{baseDir}/api_client_cli.py" --mode somnia --analysis-type tip_leaderboard --interval 24h --timezone UTC` |
| 5 | `python "{baseDir}/api_client_cli.py" --mode somnia --analysis-type dapp_activity --interval 24h --timezone UTC` |
| 6 | `python "{baseDir}/api_client_cli.py" --mode somnia --analysis-type social_hype --interval 24 --timezone UTC` |
| 7 | `python "{baseDir}/api_client_cli.py" --mode somnia --analysis-type tvl_rank --timezone UTC` |

For options 2 and 3: ask the user for the wallet address or Twitter ID before running.

---

## Displaying results

1. Run the command.
2. For tabular output: wrap in triple backticks.
3. For JSON (options 1, 2, 3): summarize in plain language. Example for option 1:

> **Somnia Network** | Block: 4,201,337 | Gas: 0.0001 Gwei | Chain ID: 50312 (Testnet)

---

## Environment

| Env Var | Default | Purpose |
|---------|---------|---------|
| `XENIA_SOMNIA_API_BASE` | `https://skill.xenia.app` | API base URL |
| `SOMNIA_RPC_URL` | `https://dream-rpc.somnia.network` | Somnia RPC endpoint |

---

## Network reference

| Property | Testnet | Mainnet |
|----------|---------|---------|
| Chain ID | 50312 | 50313 |
| Symbol | STT | SOMI |
| RPC | dream-rpc.somnia.network | mainnet-rpc.somnia.network |
| Explorer | shannon-explorer.somnia.network | explorer.somnia.network |
