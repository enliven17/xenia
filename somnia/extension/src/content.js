/**
 * Xenia Content Script — runs on x.com / twitter.com
 * Injects a "Tip" button next to tweet action buttons.
 */

const API_BASE = "https://xenia.app";
const SOMNIA_EXPLORER = "https://shannon-explorer.somnia.network";

// ─── State ────────────────────────────────────────────────────────────────────

let extensionApiKey = null;
let currentUser = null;
let escrowAddress = null; // resolved lazily from backend, falls back to constant

// ─── Page-world wallet bridge ───────────────────────────────────────────────────
// MetaMask injects window.ethereum into the page's main world, which content
// scripts cannot reach. We inject wallet_inject.js into the page and talk to it
// over window.postMessage. wallet_inject.js is declared web_accessible.

let bridgeInjected = false;
const pendingBridgeCalls = new Map(); // id -> { resolve, reject }

function injectWalletBridge() {
  if (bridgeInjected) return;
  bridgeInjected = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== "xenia-page") return;

    if (msg.id === "__ready__") {
      return; // readiness is confirmed per-call via the PROBE handshake
    }
    const pending = pendingBridgeCalls.get(msg.id);
    if (!pending) return;
    pendingBridgeCalls.delete(msg.id);
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(new Error(msg.error || "Wallet request failed"));
  });

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("src/wallet_inject.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function bridgeCall(payload, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const id = `xenia-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const timer = setTimeout(() => {
      if (pendingBridgeCalls.has(id)) {
        pendingBridgeCalls.delete(id);
        reject(new Error("Wallet request timed out"));
      }
    }, timeoutMs);

    pendingBridgeCalls.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });

    window.postMessage(Object.assign({ source: "xenia-cs", id }, payload), "*");
  });
}

async function hasInjectedWallet() {
  injectWalletBridge();
  try {
    const res = await bridgeCall({ type: "PROBE" }, 4000);
    return !!(res && res.hasProvider);
  } catch (_err) {
    return false;
  }
}

/**
 * Perform a real on-chain Escrow.tip(handle) via the injected wallet.
 * Returns { txHash, from }.
 */
async function sendOnChainTip(handle, amount) {
  injectWalletBridge();

  if (!escrowAddress) {
    escrowAddress = await window.fetchEscrowAddress(API_BASE);
  }

  // Escrow is keyed by the lowercased handle everywhere (web send + claim +
  // backend register). Normalize here too so a tip from the extension lands in
  // the same bucket the recipient claims from.
  const normalizedHandle = String(handle || "").trim().replace(/^@+/, "").toLowerCase();
  const data = window.encodeTipCall(normalizedHandle);
  const value = window.sttToWeiHex(amount);

  return bridgeCall({
    type: "TIP",
    to: escrowAddress,
    value,
    data,
    chain: window.SOMNIA_CHAIN,
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.storage.local.get(["xeniaApiKey", "xeniaUser"], (data) => {
  extensionApiKey = data.xeniaApiKey || null;
  currentUser = data.xeniaUser || null;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.xeniaApiKey) extensionApiKey = changes.xeniaApiKey.newValue;
  if (changes.xeniaUser) currentUser = changes.xeniaUser.newValue;
});

// Inject the page-world wallet bridge once, up front, so window.ethereum is
// reachable by the time the user opens a tip modal.
injectWalletBridge();

// ─── Tip Button Injection ──────────────────────────────────────────────────────

function getTweetId(articleEl) {
  const timeEl = articleEl.querySelector("time");
  if (!timeEl) return null;
  const link = timeEl.closest("a");
  if (!link) return null;
  const m = link.href.match(/status\/(\d+)/);
  return m ? m[1] : null;
}

function getTwitterHandle(articleEl) {
  const userLink = articleEl.querySelector("a[href^='/'] span");
  if (!userLink) return null;
  const spans = articleEl.querySelectorAll("a[href^='/']");
  for (const a of spans) {
    if (a.href && !a.href.includes("/status/")) {
      const m = a.href.match(/\.com\/([^/]+)/);
      if (m) return m[1];
    }
  }
  return null;
}

function createTipButton(tweetId, handle) {
  const btn = document.createElement("button");
  btn.className = "xenia-tip-btn";
  btn.title = `Tip @${handle} via Xenia`;
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
    </svg>
    <span>Tip</span>
  `;
  btn.style.cssText = `
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 11px; border-radius: 0; border: 1px solid #F5AFAF;
    background: transparent; color: #C07A7A; cursor: pointer;
    font-size: 13px; font-weight: 600; letter-spacing: 0.02em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    transition: background 0.12s, color 0.12s;
  `;
  btn.addEventListener("mouseenter", () => { btn.style.background = "#FBEFEF"; btn.style.color = "#A85F5F"; });
  btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; btn.style.color = "#C07A7A"; });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openTipModal(tweetId, handle);
  });
  return btn;
}

function injectTipButton(articleEl) {
  if (articleEl.dataset.xeniaInjected) return;
  articleEl.dataset.xeniaInjected = "1";

  const tweetId = getTweetId(articleEl);
  const handle = getTwitterHandle(articleEl);
  if (!tweetId || !handle) return;

  const actionBar = articleEl.querySelector("[role='group']");
  if (!actionBar) return;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display: inline-flex; align-items: center; margin-left: 4px;";
  wrapper.appendChild(createTipButton(tweetId, handle));
  actionBar.appendChild(wrapper);
}

function scanTweets() {
  document.querySelectorAll("article[data-testid='tweet']").forEach(injectTipButton);
}

// ─── Tip Modal ────────────────────────────────────────────────────────────────

function openTipModal(tweetId, handle) {
  const existing = document.getElementById("xenia-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "xenia-modal";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(15,13,13,0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 99999;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #FCF8F8; color: #2D2D2D; border: 1px solid #F5AFAF;
    border-radius: 0; padding: 24px; width: 320px;
    box-shadow: 0 12px 40px rgba(45,45,45,0.25); position: relative;
  `;

  modal.innerHTML = `
    <button id="xenia-close" style="position:absolute;top:12px;right:14px;background:none;border:none;cursor:pointer;font-size:16px;color:#8E8383;font-family:inherit;">✕</button>
    <div style="text-align:center;margin-bottom:18px;">
      <div style="width:38px;height:38px;background:#F5AFAF;border:1px solid #F9DFDF;border-radius:0;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;">
        <span style="color:#2D2D2D;font-weight:700;font-size:17px;">X</span>
      </div>
      <h2 style="margin:0;font-size:17px;font-weight:700;color:#2D2D2D;letter-spacing:0.02em;">Tip @${handle}</h2>
      <p style="margin:5px 0 0;font-size:11px;color:#8E8383;letter-spacing:0.02em;">powered by somnia network</p>
    </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:10px;color:#8E8383;margin-bottom:5px;letter-spacing:0.08em;text-transform:uppercase;">Amount (STT)</label>
        <input id="xenia-amount" type="number" min="0.001" step="0.001" placeholder="0.1"
          style="width:100%;padding:10px;border:1px solid #F9DFDF;border-radius:0;background:#FBEFEF;color:#2D2D2D;font-family:inherit;font-size:15px;box-sizing:border-box;outline:none;" />
      </div>
      <button id="xenia-send" style="width:100%;padding:11px;background:#F5AFAF;color:#2D2D2D;border:1px solid #F9DFDF;border-radius:0;font-family:inherit;font-size:14px;font-weight:700;letter-spacing:0.02em;cursor:pointer;">
        Send Tip
      </button>
      <div id="xenia-status" style="margin-top:12px;text-align:center;font-size:12px;min-height:20px;line-height:1.5;"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.getElementById("xenia-close")?.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById("xenia-send")?.addEventListener("click", async () => {
      const amountInput = document.getElementById("xenia-amount");
      const amount = amountInput?.value;
      const statusEl = document.getElementById("xenia-status");
      const sendBtn = document.getElementById("xenia-send");

      const setStatus = (color, html) => {
        if (statusEl) { statusEl.style.color = color; statusEl.innerHTML = html; }
      };

      if (!amount || Number(amount) <= 0) {
        setStatus("#B4302F", "Enter a valid amount.");
        return;
      }

      if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Connecting wallet…"; }

      // No injected wallet (MetaMask) → keep the existing Xenia-app fallback.
      const walletAvailable = await hasInjectedWallet();
      if (!walletAvailable) {
        setStatus(
          "#B4302F",
          `MetaMask required for on-chain tips. ` +
            `<a href="${API_BASE}/send-tips?to=${encodeURIComponent(handle)}&amount=${encodeURIComponent(amount)}" ` +
            `target="_blank" style="color:#A85F5F;font-weight:700;">Open Xenia →</a>`
        );
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send Tip"; }
        return;
      }

      try {
        if (sendBtn) sendBtn.textContent = "Confirm in wallet…";
        setStatus("#8E8383", "Awaiting wallet confirmation…");

        // 1. Real on-chain Escrow.tip(handle) with value = amount (wei).
        const { txHash } = await sendOnChainTip(handle, amount);

        const explorerUrl = `${SOMNIA_EXPLORER}/tx/${txHash}`;
        setStatus(
          "#A85F5F",
          `✓ ${amount} STT sent to @${handle}!<br/>` +
            `<a href="${explorerUrl}" target="_blank" style="color:#A85F5F;font-weight:700;">View on explorer →</a>`
        );

        // 2. Record the tip with the real txHash (best-effort, non-blocking UX).
        if (sendBtn) sendBtn.textContent = "Recording…";
        try {
          await fetch(`${API_BASE}/api/tips/send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Extension-Key": extensionApiKey,
            },
            body: JSON.stringify({
              recipientTwitterId: handle,
              recipientHandle: handle,
              amount,
              tweetId,
              txHash,
            }),
          });
        } catch (_recordErr) {
          // On-chain tip already succeeded — surface a soft note, don't fail.
          setStatus(
            "#A85F5F",
            `✓ ${amount} STT sent to @${handle}! ` +
              `<a href="${explorerUrl}" target="_blank" style="color:#A85F5F;font-weight:700;">View →</a><br/>` +
              `<span style="color:#8E8383;">Couldn't sync to Xenia, but the tip is on-chain.</span>`
          );
        }

        if (sendBtn) sendBtn.textContent = "Done";
        setTimeout(() => overlay.remove(), 4000);
      } catch (err) {
        const rejected = err && (err.message || "").toLowerCase().includes("user rejected");
        setStatus("#B4302F", rejected ? "Transaction rejected." : "Transaction failed. Try again.");
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send Tip"; }
      }
    });
}

// ─── Profile tip button ─────────────────────────────────────────────────────────

const RESERVED_PATHS = new Set([
  "home", "explore", "notifications", "messages", "settings", "i", "search",
  "compose", "bookmarks", "lists", "communities", "jobs", "tos", "privacy",
  "login", "signup", "intent", "hashtag", "about", "download",
]);

// On a profile page the path is a single segment = the handle.
function getProfileHandle() {
  const seg = location.pathname.split("/").filter(Boolean);
  if (seg.length === 1 && !RESERVED_PATHS.has(seg[0].toLowerCase())) return seg[0];
  return null;
}

function createProfileTipButton(handle) {
  const btn = document.createElement("button");
  btn.className = "xenia-profile-tip";
  btn.textContent = `Tip @${handle}`;
  btn.style.cssText = `
    display:inline-flex; align-items:center; height:36px; padding:0 16px; margin-right:8px;
    border-radius:0; border:1px solid #F5AFAF; background:#F5AFAF; color:#2D2D2D; cursor:pointer;
    font-size:14px; font-weight:700; letter-spacing:0.02em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  `;
  btn.addEventListener("mouseenter", () => { btn.style.background = "#F9DFDF"; });
  btn.addEventListener("mouseleave", () => { btn.style.background = "#F5AFAF"; });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openTipModal(null, handle);
  });
  return btn;
}

function injectProfileTipButton() {
  const handle = getProfileHandle();
  if (!handle) return;
  // Anchor beside the profile's action buttons (the "..." kebab / Follow).
  const anchor =
    document.querySelector("[data-testid='userActions']") ||
    document.querySelector("[data-testid$='-follow']") ||
    document.querySelector("[data-testid='placementTracking']");
  if (!anchor || !anchor.parentElement) return;
  const container = anchor.parentElement;
  if (container.querySelector(".xenia-profile-tip")) return;
  container.insertBefore(createProfileTipButton(handle), container.firstChild);
}

// ─── Observe DOM changes ───────────────────────────────────────────────────────

function scan() {
  scanTweets();
  injectProfileTipButton();
}

const observer = new MutationObserver(scan);
observer.observe(document.body, { childList: true, subtree: true });
scan();
