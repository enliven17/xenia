const API_BASE = "https://xenia.app";

async function apiCall(path, options = {}) {
  const key = await getApiKey();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Extension-Key": key || "",
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function getApiKey() {
  return new Promise((resolve) =>
    chrome.storage.local.get("xeniaApiKey", (d) => resolve(d.xeniaApiKey || null))
  );
}

function show(id) {
  ["loading", "view-login", "view-user"].forEach((v) => {
    document.getElementById(v).style.display = v === id ? "" : "none";
  });
}

async function loadUser() {
  const key = await getApiKey();
  if (!key) { show("view-login"); return; }

  try {
    const data = await apiCall("/api/extension/verify");
    if (!data.valid) throw new Error("invalid");

    const user = data.user;
    document.getElementById("user-handle").textContent = `@${user.twitterHandle}`;

    const addr = user.linkedWalletAddress || user.embeddedWalletAddress;
    document.getElementById("user-address").textContent = addr
      ? addr.slice(0, 10) + "…" + addr.slice(-6)
      : "No wallet";

    if (addr) {
      try {
        const bal = await fetch(`https://dream-rpc.somnia.network`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", method: "eth_getBalance",
            params: [addr, "latest"], id: 1,
          }),
        }).then((r) => r.json());
        const stt = parseInt(bal.result, 16) / 1e18;
        document.getElementById("user-balance").textContent = stt.toFixed(4) + " STT";
      } catch {
        document.getElementById("user-balance").textContent = "—";
      }
    }

    chrome.storage.local.set({ xeniaUser: user });
    show("view-user");
  } catch {
    show("view-login");
  }
}

// ─── Save API key ─────────────────────────────────────────────────────────────

document.getElementById("save-key-btn").addEventListener("click", async () => {
  const key = document.getElementById("api-key-input").value.trim();
  const statusEl = document.getElementById("key-status");

  if (!key.startsWith("xen_")) {
    statusEl.style.color = "#B4302F";
    statusEl.textContent = "Key must start with xen_";
    return;
  }

  chrome.storage.local.set({ xeniaApiKey: key }, () => {
    statusEl.style.color = "#8E8383";
    statusEl.textContent = "Saved! Verifying…";
    setTimeout(() => loadUser(), 500);
  });
});

// ─── Quick tip ────────────────────────────────────────────────────────────────

document.getElementById("tip-send-btn").addEventListener("click", async () => {
  const handle = document.getElementById("tip-handle").value.trim().replace("@", "");
  const amount = document.getElementById("tip-amount").value.trim();
  const statusEl = document.getElementById("tip-status");

  if (!handle || !amount || Number(amount) <= 0) {
    statusEl.style.color = "#B4302F";
    statusEl.textContent = "Fill in handle and amount.";
    return;
  }

  document.getElementById("tip-send-btn").disabled = true;
  statusEl.style.color = "#8E8383";
  statusEl.textContent = "Sending…";

  try {
    await apiCall("/api/tips/send", {
      method: "POST",
      body: JSON.stringify({ recipientTwitterId: handle, recipientHandle: handle, amount }),
    });
    statusEl.style.color = "#C98A8A";
    statusEl.textContent = `✓ ${amount} STT sent to @${handle}`;
    document.getElementById("tip-handle").value = "";
    document.getElementById("tip-amount").value = "";
  } catch (e) {
    statusEl.style.color = "#B4302F";
    statusEl.textContent = "Failed. Check your key or balance.";
  } finally {
    document.getElementById("tip-send-btn").disabled = false;
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────

document.getElementById("logout-btn").addEventListener("click", () => {
  chrome.storage.local.remove(["xeniaApiKey", "xeniaUser"], () => {
    show("view-login");
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

show("loading");
loadUser();
