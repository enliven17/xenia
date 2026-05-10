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
