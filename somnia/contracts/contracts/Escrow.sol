// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Xenia Escrow — Somnia Network
 * @notice Holds SOMI tips for unregistered Twitter users until they claim.
 * @dev EVM-compatible, deployed on Somnia (chainId 50312 testnet / 50313 mainnet).
 */
contract Escrow {
    struct Tip {
        address sender;
        uint256 amount;
        uint256 timestamp;
        bool claimed;
    }

    // twitterId (string) -> tips array
    mapping(string => Tip[]) private pendingTips;
    // twitterId -> total unclaimed amount
    mapping(string => uint256) private pendingBalance;
    // twitterId -> registered wallet address (set when user signs up)
    mapping(string => address) private registeredWallets;
    // wallet -> twitterId (reverse lookup)
    mapping(address => string) private walletToTwitter;

    address public owner;
    uint256 public platformFeePercent = 100; // 1.00% (basis points, divide by 10000)

    event TipSent(
        address indexed sender,
        string indexed recipientTwitterId,
        uint256 amount,
        uint256 fee,
        uint256 tipIndex
    );
    event TipClaimed(
        string indexed twitterId,
        address indexed recipient,
        uint256 amount
    );
    event WalletRegistered(string indexed twitterId, address indexed wallet);
    event DirectTip(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 fee
    );
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event FundsWithdrawn(address indexed to, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ─── Registration ────────────────────────────────────────────────────────

    /**
     * @notice Link a Twitter ID to a wallet address (called by backend after Privy auth).
     * @param twitterId The Twitter/X user ID string.
     * @param wallet    The wallet address to associate.
     */
    function registerWallet(string calldata twitterId, address wallet) external onlyOwner {
        require(wallet != address(0), "Invalid wallet");
        require(bytes(twitterId).length > 0, "Empty twitterId");

        registeredWallets[twitterId] = wallet;
        walletToTwitter[wallet] = twitterId;

        emit WalletRegistered(twitterId, wallet);
    }

    // ─── Tipping ─────────────────────────────────────────────────────────────

    /**
     * @notice Tip a Twitter user by their ID.
     *         If registered: send SOMI directly to their wallet (minus fee).
     *         If not registered: lock funds in escrow.
     * @param recipientTwitterId Twitter/X ID of the recipient.
     */
    function tip(string calldata recipientTwitterId) external payable {
        require(msg.value > 0, "Must send SOMI");
        require(bytes(recipientTwitterId).length > 0, "Empty recipient");

        uint256 fee = (msg.value * platformFeePercent) / 10000;
        uint256 netAmount = msg.value - fee;

        address registeredWallet = registeredWallets[recipientTwitterId];

        if (registeredWallet != address(0)) {
            // Direct transfer: recipient is already registered
            (bool sent, ) = payable(registeredWallet).call{value: netAmount}("");
            require(sent, "Transfer failed");

            // Keep fee in contract for owner withdrawal
            emit DirectTip(msg.sender, registeredWallet, netAmount, fee);
        } else {
            // Escrow: recipient not registered yet
            uint256 idx = pendingTips[recipientTwitterId].length;
            pendingTips[recipientTwitterId].push(
                Tip({
                    sender: msg.sender,
                    amount: netAmount,
                    timestamp: block.timestamp,
                    claimed: false
                })
            );
            pendingBalance[recipientTwitterId] += netAmount;

            emit TipSent(msg.sender, recipientTwitterId, netAmount, fee, idx);
        }
    }

    /**
     * @notice Claim all pending tips. Must have a registered wallet first.
     * @param twitterId The Twitter/X ID to claim for.
     */
    function claim(string calldata twitterId) external {
        address wallet = registeredWallets[twitterId];
        require(wallet != address(0), "Wallet not registered");
        require(msg.sender == wallet, "Not your wallet");

        uint256 total = pendingBalance[twitterId];
        require(total > 0, "Nothing to claim");

        pendingBalance[twitterId] = 0;

        Tip[] storage tips = pendingTips[twitterId];
        for (uint256 i = 0; i < tips.length; i++) {
            if (!tips[i].claimed) {
                tips[i].claimed = true;
            }
        }

        (bool sent, ) = payable(wallet).call{value: total}("");
        require(sent, "Claim transfer failed");

        emit TipClaimed(twitterId, wallet, total);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getPendingBalance(string calldata twitterId) external view returns (uint256) {
        return pendingBalance[twitterId];
    }

    function getRegisteredWallet(string calldata twitterId) external view returns (address) {
        return registeredWallets[twitterId];
    }

    function getTwitterId(address wallet) external view returns (string memory) {
        return walletToTwitter[wallet];
    }

    function getPendingTips(string calldata twitterId)
        external
        view
        returns (Tip[] memory)
    {
        return pendingTips[twitterId];
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setFee(uint256 newFeePercent) external onlyOwner {
        require(newFeePercent <= 500, "Fee too high (max 5%)");
        emit FeeUpdated(platformFeePercent, newFeePercent);
        platformFeePercent = newFeePercent;
    }

    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees");
        (bool sent, ) = payable(owner).call{value: balance}("");
        require(sent, "Withdraw failed");
        emit FundsWithdrawn(owner, balance);
    }

    function changeOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    receive() external payable {}
}
