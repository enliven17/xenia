// Xenia popup — a backend-independent "home" panel. The actual tipping happens
// on the X page via the content script + injected wallet, so this view always
// renders useful content and never blocks on the backend.

function openUrl(url) {
  if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  else window.open(url, "_blank");
}

// Quick-link buttons.
document.querySelectorAll("[data-url]").forEach((btn) => {
  btn.addEventListener("click", () => openUrl(btn.dataset.url));
});

// Best-effort: if an account was paired/synced from the web app, show it.
// No network call — just reads what auth-sync stored.
chrome.storage.local.get(["xeniaUser"], (data) => {
  const user = data.xeniaUser;
  if (!user) return;

  const acc = document.getElementById("account");
  document.getElementById("acc-handle").textContent = "@" + (user.twitterHandle || "");

  const addr = user.linkedWalletAddress || user.embeddedWalletAddress;
  document.getElementById("acc-address").textContent = addr
    ? addr.slice(0, 10) + "…" + addr.slice(-6)
    : "No wallet linked";

  acc.style.display = "";
});

document.getElementById("logout-btn")?.addEventListener("click", () => {
  chrome.storage.local.remove(["xeniaApiKey", "xeniaUser"], () => {
    const acc = document.getElementById("account");
    if (acc) acc.style.display = "none";
  });
});
