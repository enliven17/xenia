/**
 * Xenia Background Service Worker
 * Handles auth token storage and message routing between content scripts and popup.
 */

const API_BASE = "https://xenia-production.up.railway.app";

// ─── Auth Token Management ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "XENIA_AUTH_TOKEN") {
    // Received a Privy token from the auth-sync content script
    chrome.storage.local.set({ xeniaPrivyToken: msg.token });
    return;
  }

  if (msg.type === "XENIA_GET_TOKEN") {
    chrome.storage.local.get("xeniaPrivyToken", (data) => {
      sendResponse({ token: data.xeniaPrivyToken || null });
    });
    return true; // keep channel open for async response
  }

  if (msg.type === "XENIA_GET_USER") {
    chrome.storage.local.get("xeniaUser", (data) => {
      sendResponse({ user: data.xeniaUser || null });
    });
    return true;
  }

  if (msg.type === "XENIA_SEND_TIP") {
    sendTipViaBackground(msg.payload).then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
});

// ─── Tip Sending (background fetch — avoids CORS issues) ─────────────────────

async function sendTipViaBackground({ recipientTwitterId, recipientHandle, amount, tweetId }) {
  const { xeniaApiKey } = await chrome.storage.local.get("xeniaApiKey");
  if (!xeniaApiKey) throw new Error("No API key. Open the Xenia dashboard to pair.");

  const res = await fetch(`${API_BASE}/api/tips/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Extension-Key": xeniaApiKey,
    },
    body: JSON.stringify({ recipientTwitterId, recipientHandle, amount, tweetId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }

  return { ok: true, data: await res.json() };
}

// ─── Alarm: Check pending claims every 30 minutes ────────────────────────────

chrome.alarms.create("xenia-check-claims", { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "xenia-check-claims") return;

  const { xeniaApiKey } = await chrome.storage.local.get("xeniaApiKey");
  if (!xeniaApiKey) return;

  try {
    const res = await fetch(`${API_BASE}/api/claims`, {
      headers: { "X-Extension-Key": xeniaApiKey },
    });
    if (!res.ok) return;

    const claims = await res.json();
    const pending = claims.filter((c) => c.status === "pending");

    if (pending.length > 0) {
      chrome.notifications.create("xenia-pending-claims", {
        type: "basic",
        iconUrl: "../public/icon.png",
        title: "Xenia — Pending Tips",
        message: `You have ${pending.length} unclaimed tip${pending.length > 1 ? "s" : ""}! Open Xenia to claim.`,
      });
    }
  } catch {
    // Ignore network errors in background
  }
});

// ─── Extension installed / updated ───────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.tabs.create({ url: "https://xenia-production.up.railway.app" });
  }
});
