/**
 * Xenia Auth Sync — injected on xenia.app pages.
 * Reads the Privy session and forwards the auth token to the extension background.
 */
(function () {
  function sendTokenToExtension(token) {
    chrome.runtime.sendMessage({ type: "XENIA_AUTH_TOKEN", token });
  }

  // Listen for background page requesting the token
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "XENIA_REQUEST_AUTH_TOKEN") {
      // The extension content script is asking for the Privy token.
      // Forward to background via chrome.runtime.
      const stored = localStorage.getItem("privy:token");
      if (stored) sendTokenToExtension(stored);
    }
  });

  // On load, proactively push the token if available
  const token = localStorage.getItem("privy:token");
  if (token) sendTokenToExtension(token);
})();
