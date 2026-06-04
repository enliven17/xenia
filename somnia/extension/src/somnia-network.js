/**
 * Somnia Network constants — injected into content scripts before content.js.
 * Defines the chain and helpers used by the tipping UI.
 */

window.SOMNIA_CHAIN = {
  chainId: "0xC488",     // 50312 decimal
  chainName: "Somnia Shannon Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: ["https://dream-rpc.somnia.network"],
  blockExplorerUrls: ["https://shannon-explorer.somnia.network"],
};

window.SOMNIA_CHAIN_ID_DEC = 50312;
window.SOMNIA_SYMBOL = "STT";

window.ensureSomniaChain = async function (provider) {
  const current = await provider.request({ method: "eth_chainId" });
  if (current === window.SOMNIA_CHAIN.chainId) return true;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: window.SOMNIA_CHAIN.chainId }],
    });
    return true;
  } catch (err) {
    if (err.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [window.SOMNIA_CHAIN],
      });
      return true;
    }
    throw err;
  }
};

// ─── Escrow contract ────────────────────────────────────────────────────────
// Fallback address; preferred source is GET /api/somnia/network -> contracts.escrow
window.ESCROW_ADDRESS_FALLBACK = "0xEf0ca54F3C195737880127df62069C5B5A17B458";

// function selector for tip(string) = keccak256("tip(string)")[:4]
// Verified with viem toFunctionSelector("tip(string)") === 0xcb56393c
window.ESCROW_TIP_SELECTOR = "cb56393c";

/**
 * Fetch the live Escrow address from the backend, falling back to the constant.
 * @param {string} apiBase e.g. "https://xenia.app"
 * @returns {Promise<string>} checksummed-or-lowercase 0x address
 */
window.fetchEscrowAddress = async function (apiBase) {
  try {
    const resp = await fetch(`${apiBase}/api/somnia/network`, {
      headers: { Accept: "application/json" },
    });
    if (resp.ok) {
      const data = await resp.json();
      const addr = data && data.contracts && data.contracts.escrow;
      if (typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
        return addr;
      }
    }
  } catch (_err) {
    // fall through to fallback
  }
  return window.ESCROW_ADDRESS_FALLBACK;
};

// ─── Minimal ABI encoding (pure JS, MV3 CSP-safe — no eval/Function) ──────────

function _utf8Bytes(str) {
  // TextEncoder is available in content scripts and MV3 service workers.
  return new TextEncoder().encode(str);
}

function _toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function _padRight32(hex) {
  // pad a hex string on the right to a multiple of 64 chars (32 bytes)
  const rem = hex.length % 64;
  return rem === 0 ? hex : hex + "0".repeat(64 - rem);
}

function _uint256Hex(n) {
  // n: number | bigint -> 32-byte left-padded hex (no 0x)
  const big = typeof n === "bigint" ? n : BigInt(n);
  return big.toString(16).padStart(64, "0");
}

/**
 * ABI-encode a call to tip(string recipientTwitterId).
 * Layout: selector | head(offset=0x20) | length | data(right-padded).
 * @param {string} handle the recipient twitter handle/id
 * @returns {string} 0x-prefixed calldata
 */
window.encodeTipCall = function (handle) {
  const strBytes = _utf8Bytes(String(handle));
  const offset = _uint256Hex(32); // dynamic data starts after the single head word
  const length = _uint256Hex(strBytes.length);
  const data = _padRight32(_toHex(strBytes));
  return "0x" + window.ESCROW_TIP_SELECTOR + offset + length + data;
};

/**
 * Convert a decimal STT amount (string|number) to wei as a 0x-hex string.
 * Avoids float rounding by parsing the decimal manually (18 decimals).
 * @param {string|number} amount
 * @returns {string} 0x-prefixed wei
 */
window.sttToWeiHex = function (amount) {
  const s = String(amount).trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") {
    throw new Error("Invalid amount");
  }
  const [intPart = "0", fracRaw = ""] = s.split(".");
  const frac = (fracRaw + "0".repeat(18)).slice(0, 18); // pad/truncate to 18 decimals
  const wei = BigInt(intPart || "0") * 1000000000000000000n + BigInt(frac || "0");
  if (wei <= 0n) throw new Error("Amount must be greater than zero");
  return "0x" + wei.toString(16);
};
