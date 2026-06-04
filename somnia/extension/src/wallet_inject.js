/**
 * Xenia wallet bridge — injected into the PAGE (main world) by content.js.
 *
 * Content scripts run in an isolated world and cannot see the page's
 * window.ethereum (injected by MetaMask / other EIP-1193 wallets). This script
 * runs in the page context, talks to window.ethereum, and relays results back to
 * the content script over window.postMessage.
 *
 * MV3 CSP-safe: no eval, no inline handlers. All payloads are plain JSON.
 *
 * Protocol:
 *   page <- content : { source: "xenia-cs", id, type: "TIP", to, value, data, chain }
 *   page -> content : { source: "xenia-page", id, ok, result } | { ..., ok:false, error }
 */

(function () {
  const REQ = "xenia-cs";
  const RES = "xenia-page";

  function reply(id, payload) {
    window.postMessage(Object.assign({ source: RES, id }, payload), "*");
  }

  async function ensureChain(provider, chain) {
    const current = await provider.request({ method: "eth_chainId" });
    if (current === chain.chainId) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain.chainId }],
      });
    } catch (err) {
      if (err && err.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [chain],
        });
        return;
      }
      throw err;
    }
  }

  async function handleTip(msg) {
    const provider = window.ethereum;
    if (!provider) {
      reply(msg.id, { ok: false, error: "NO_PROVIDER" });
      return;
    }
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const from = accounts && accounts[0];
      if (!from) throw new Error("No account selected");

      await ensureChain(provider, msg.chain);

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from, to: msg.to, value: msg.value, data: msg.data }],
      });

      reply(msg.id, { ok: true, result: { txHash, from } });
    } catch (err) {
      reply(msg.id, {
        ok: false,
        error: (err && (err.message || err.code)) || "TX_FAILED",
        code: err && err.code,
      });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== REQ) return;
    if (msg.type === "PROBE") {
      reply(msg.id, { ok: true, result: { hasProvider: !!window.ethereum } });
      return;
    }
    if (msg.type === "TIP") {
      handleTip(msg);
    }
  });

  // announce readiness so the content script knows the bridge is live
  window.postMessage({ source: RES, id: "__ready__", ok: true }, "*");
})();
