/**
 * Somnia Network configuration for the Xenia browser extension.
 * Import or inline this into background.js.
 */

const SOMNIA_NETWORKS = {
  testnet: {
    chainId: "0xC488",        // 50312 in hex
    chainName: "Somnia Shannon Testnet",
    nativeCurrency: {
      name: "Somnia Test Token",
      symbol: "STT",
      decimals: 18,
    },
    rpcUrls: ["https://dream-rpc.somnia.network"],
    blockExplorerUrls: ["https://shannon-explorer.somnia.network"],
  },
  mainnet: {
    chainId: "0xC489",        // 50313 in hex
    chainName: "Somnia Network",
    nativeCurrency: {
      name: "SOMI",
      symbol: "SOMI",
      decimals: 18,
    },
    rpcUrls: ["https://mainnet-rpc.somnia.network"],
    blockExplorerUrls: ["https://explorer.somnia.network"],
  },
};

// Active network — change to "mainnet" when going live
const ACTIVE_SOMNIA_NETWORK = SOMNIA_NETWORKS.testnet;
const SOMNIA_CHAIN_ID_HEX = ACTIVE_SOMNIA_NETWORK.chainId; // "0xC488"
const SOMNIA_CHAIN_ID = 50312;

/**
 * Add Somnia network to MetaMask / injected provider and switch to it.
 * Call this when the user first clicks "Tip" and no Somnia chain is found.
 */
async function addAndSwitchToSomnia(provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SOMNIA_CHAIN_ID_HEX }],
    });
  } catch (switchError) {
    // Chain not added yet
    if (switchError.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [ACTIVE_SOMNIA_NETWORK],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Verify the connected wallet is on Somnia.
 * Returns true if already on the correct chain.
 */
async function isOnSomnia(provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  return chainId === SOMNIA_CHAIN_ID_HEX;
}
