#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Xenia — Pre-flight deploy check
// ═══════════════════════════════════════════════════════════════════════════
//
// Run before every deploy:   npm run preflight
//
// It verifies, WITHOUT touching production:
//   1. Required env vars are present (root .env or process.env)
//   2. BACKEND_WALLET_PRIVATE_KEY looks like a valid 0x-prefixed 32-byte key
//   3. vercel.json no longer contains the REPLACE_WITH_RAILWAY_DOMAIN placeholder
//   4. ESCROW / REGISTRY contract addresses are real, deployed contracts on the
//      configured Somnia chain (eth_getCode returns non-empty bytecode)
//
// Exit code 0 = ready to deploy. Non-zero = fix the reported issues first.
//
// Usage:
//   node scripts/preflight.mjs            # full check (incl. on-chain RPC probe)
//   node scripts/preflight.mjs --no-chain # skip the RPC contract-code probe
// ═══════════════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SKIP_CHAIN = process.argv.includes("--no-chain");

// ── tiny logger ────────────────────────────────────────────────────────────
const errors = [];
const warnings = [];
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => {
  errors.push(m);
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
};
const warn = (m) => {
  warnings.push(m);
  console.log(`  \x1b[33m!\x1b[0m ${m}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// ── minimal .env loader (no dependency) ─────────────────────────────────────
function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// Merge: real environment wins over .env file (matches Railway/Vercel behaviour).
const fileEnv = loadEnvFile(path.join(ROOT, ".env"));
const env = { ...fileEnv, ...process.env };

// A value is "missing" if absent OR still set to an obvious placeholder.
const PLACEHOLDER_RE =
  /^(0xYour|0xabc|0xYOUR|replace-with|change-me|your-|clxxxx|privy-app-secret|0x\.\.\.)/i;
function present(key) {
  const v = env[key];
  return typeof v === "string" && v.length > 0 && !PLACEHOLDER_RE.test(v);
}

console.log("\n\x1b[1m🛫 Xenia pre-flight check\x1b[0m");

// ── 1. required env vars ────────────────────────────────────────────────────
section("1. Backend environment variables");
const REQUIRED = [
  "SOMNIA_CHAIN_ID",
  "SOMNIA_RPC_URL",
  "ESCROW_CONTRACT_ADDRESS",
  "REGISTRY_CONTRACT_ADDRESS",
  "BACKEND_WALLET_PRIVATE_KEY",
  "DATABASE_URL",
  "SESSION_SECRET",
  "CORS_ORIGINS",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
];
for (const key of REQUIRED) {
  if (present(key)) ok(`${key} set`);
  else fail(`${key} missing or still a placeholder`);
}

// optional-but-recommended
for (const key of ["TWITTER_BEARER_TOKEN", "SOMNIA_EXPLORER_URL"]) {
  if (present(key)) ok(`${key} set`);
  else warn(`${key} not set (only needed for bot / explorer-link features)`);
}

// ── 2. backend wallet key shape ─────────────────────────────────────────────
section("2. Backend wallet key");
const pk = env.BACKEND_WALLET_PRIVATE_KEY;
if (present("BACKEND_WALLET_PRIVATE_KEY")) {
  if (/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    ok("BACKEND_WALLET_PRIVATE_KEY is a valid 0x 32-byte key");
    warn(
      "Reminder: this wallet MUST be the Escrow/Registry contract OWNER, " +
        "and funded with STT/SOMI for gas. registerWallet/registerScreenshot " +
        "revert otherwise.",
    );
  } else {
    fail(
      "BACKEND_WALLET_PRIVATE_KEY is not a 0x-prefixed 64-hex-char key",
    );
  }
}

// ── 3. vercel.json placeholder ──────────────────────────────────────────────
section("3. vercel.json rewrite target");
const vercelPath = path.join(ROOT, "vercel.json");
if (!fs.existsSync(vercelPath)) {
  fail("vercel.json not found");
} else {
  const raw = fs.readFileSync(vercelPath, "utf8");
  if (raw.includes("REPLACE_WITH_RAILWAY_DOMAIN")) {
    fail(
      "vercel.json still contains REPLACE_WITH_RAILWAY_DOMAIN — replace it with " +
        "your real Railway domain (see DEPLOY.md §3.1) before deploying the frontend",
    );
  } else {
    ok("vercel.json rewrite target has been filled in");
    const m = raw.match(/"destination":\s*"https:\/\/([^/"]+)/);
    if (m) ok(`  → proxying /api/* to https://${m[1]}`);
  }
}

// ── 4. on-chain contract code probe ─────────────────────────────────────────
async function probeContracts() {
  section("4. On-chain contract code (RPC probe)");
  if (SKIP_CHAIN) {
    warn("--no-chain passed; skipping RPC probe");
    return;
  }
  const rpc = env.SOMNIA_RPC_URL;
  if (!present("SOMNIA_RPC_URL")) {
    warn("SOMNIA_RPC_URL not set; skipping RPC probe");
    return;
  }
  if (typeof fetch !== "function") {
    warn("global fetch unavailable (need Node 18+); skipping RPC probe");
    return;
  }

  async function getCode(address) {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [address, "latest"],
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "RPC error");
    return json.result;
  }

  const targets = [
    ["ESCROW_CONTRACT_ADDRESS", env.ESCROW_CONTRACT_ADDRESS],
    ["REGISTRY_CONTRACT_ADDRESS", env.REGISTRY_CONTRACT_ADDRESS],
  ];

  for (const [label, addr] of targets) {
    if (!addr || PLACEHOLDER_RE.test(addr)) {
      fail(`${label} not set — cannot verify on-chain`);
      continue;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      fail(`${label} (${addr}) is not a valid 0x address`);
      continue;
    }
    try {
      const code = await getCode(addr);
      if (!code || code === "0x" || code === "0x0") {
        fail(
          `${label} (${addr}) has NO bytecode on chain ${env.SOMNIA_CHAIN_ID} ` +
            `— not a deployed contract on this RPC. Check address + chain id.`,
        );
      } else {
        ok(`${label} (${addr}) is a live contract (${code.length} bytes of code)`);
      }
    } catch (e) {
      warn(`RPC probe for ${label} failed: ${e.message}`);
    }
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
await probeContracts();

section("Summary");
if (warnings.length) console.log(`  ${warnings.length} warning(s)`);
if (errors.length) {
  console.log(`\n\x1b[31m✗ NOT READY — ${errors.length} blocking issue(s):\x1b[0m`);
  for (const e of errors) console.log(`    • ${e}`);
  process.exit(1);
} else {
  console.log("\n\x1b[32m✓ Pre-flight passed. Safe to deploy.\x1b[0m");
  process.exit(0);
}
