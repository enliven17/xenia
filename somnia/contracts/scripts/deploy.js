const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("═══════════════════════════════════════════");
  console.log("  Xenia × Somnia — Contract Deployment");
  console.log("═══════════════════════════════════════════");
  console.log(`  Network  : ${network.name} (chainId: ${network.chainId})`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(
    `  Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} STT`
  );
  console.log("───────────────────────────────────────────");

  // 1. Deploy Escrow
  console.log("\n[1/2] Deploying Escrow.sol...");
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log(`  ✓ Escrow deployed to: ${escrowAddr}`);

  // 2. Deploy ScreenshotRegistry
  console.log("\n[2/2] Deploying ScreenshotRegistry.sol...");
  const Registry = await ethers.getContractFactory("ScreenshotRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`  ✓ ScreenshotRegistry deployed to: ${registryAddr}`);

  console.log("\n═══════════════════════════════════════════");
  console.log("  Deployment Complete!");
  console.log("═══════════════════════════════════════════");
  console.log(`  ESCROW_CONTRACT_ADDRESS=${escrowAddr}`);
  console.log(`  REGISTRY_CONTRACT_ADDRESS=${registryAddr}`);
  console.log("───────────────────────────────────────────");
  console.log("  Add these to your .env file.");

  if (network.chainId === 50312n) {
    console.log("\n  Explorer (Testnet):");
    console.log(
      `  Escrow   → https://shannon-explorer.somnia.network/address/${escrowAddr}`
    );
    console.log(
      `  Registry → https://shannon-explorer.somnia.network/address/${registryAddr}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
