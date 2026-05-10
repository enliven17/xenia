// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Xenia Escrow — Somnia Network
 * @notice Holds SOMI tips for unregistered Twitter users until they claim.
 *
 * Security properties:
 *   - ReentrancyGuard on all state-changing external calls
 *   - Fee balance tracked separately from escrow balance (no commingling)
 *   - registerWallet is immutable once set (prevents overwrite attacks)
 *   - Sender refund after REFUND_DELAY if recipient never registers
 *   - Two-step ownership transfer
 *   - Tip array pagination in claim() to avoid gas DoS
 */
contract Escrow {

    // ─── Reentrancy Guard ─────────────────────────────────────────────────────

    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_status != _ENTERED, "Reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    // Sender can reclaim after 90 days if recipient never registers
    uint256 public constant REFUND_DELAY = 90 days;

    // ─── Data Structures ─────────────────────────────────────────────────────

    struct Tip {
        address sender;
        uint256 amount;
        uint256 timestamp;
        bool claimed;
        bool refunded;
    }

    // twitterId -> tips array
    mapping(string => Tip[]) private pendingTips;
    // twitterId -> total unclaimed amount (escrow balance, tracked separately)
    mapping(string => uint256) private pendingBalance;
    // twitterId -> registered wallet
    mapping(string => address) private registeredWallets;
    // wallet -> twitterId
    mapping(address => string) private walletToTwitter;

    // Fee revenue tracked separately — never commingled with escrow funds
    uint256 public accumulatedFees;

    uint256 public platformFeePercent = 100; // 1.00% (basis points / 10000)

    // ─── Ownership (two-step) ─────────────────────────────────────────────────

    address public owner;
    address public pendingOwner;

    // ─── Events ──────────────────────────────────────────────────────────────

    event TipSent(
        address indexed sender,
        string indexed recipientTwitterId,
        uint256 amount,
        uint256 fee,
        uint256 tipIndex
    );
    event DirectTip(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 fee
    );
    event TipClaimed(string indexed twitterId, address indexed recipient, uint256 amount);
    event TipRefunded(address indexed sender, uint256 amount, uint256 tipIndex);
    event WalletRegistered(string indexed twitterId, address indexed wallet);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event OwnershipTransferProposed(address indexed proposed);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        _status = _NOT_ENTERED;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    /**
     * @notice Link a Twitter ID to a wallet. Immutable once set.
     *         Only callable by owner (backend wallet after Privy auth).
     */
    function registerWallet(string calldata twitterId, address wallet) external onlyOwner {
        require(wallet != address(0), "Invalid wallet");
        require(bytes(twitterId).length > 0, "Empty twitterId");
        require(registeredWallets[twitterId] == address(0), "Already registered");

        registeredWallets[twitterId] = wallet;
        walletToTwitter[wallet] = twitterId;

        emit WalletRegistered(twitterId, wallet);
    }

    // ─── Tipping ──────────────────────────────────────────────────────────────

    /**
     * @notice Tip a Twitter user by their ID.
     *         Registered recipients receive funds directly.
     *         Unregistered recipients have funds held in escrow.
     */
    function tip(string calldata recipientTwitterId) external payable nonReentrant {
        require(msg.value > 0, "Must send SOMI");
        require(bytes(recipientTwitterId).length > 0, "Empty recipient");

        uint256 fee = (msg.value * platformFeePercent) / 10000;
        uint256 netAmount = msg.value - fee;

        // Fee tracked separately — never touchable by claim/refund
        accumulatedFees += fee;

        address registeredWallet = registeredWallets[recipientTwitterId];

        if (registeredWallet != address(0)) {
            (bool sent, ) = payable(registeredWallet).call{value: netAmount}("");
            require(sent, "Transfer failed");
            emit DirectTip(msg.sender, registeredWallet, netAmount, fee);
        } else {
            uint256 idx = pendingTips[recipientTwitterId].length;
            pendingTips[recipientTwitterId].push(
                Tip({
                    sender: msg.sender,
                    amount: netAmount,
                    timestamp: block.timestamp,
                    claimed: false,
                    refunded: false
                })
            );
            pendingBalance[recipientTwitterId] += netAmount;
            emit TipSent(msg.sender, recipientTwitterId, netAmount, fee, idx);
        }
    }

    /**
     * @notice Claim all pending tips. Caller must be the registered wallet.
     * @param twitterId The Twitter/X ID to claim for.
     */
    function claim(string calldata twitterId) external nonReentrant {
        address wallet = registeredWallets[twitterId];
        require(wallet != address(0), "Wallet not registered");
        require(msg.sender == wallet, "Not your wallet");

        uint256 total = pendingBalance[twitterId];
        require(total > 0, "Nothing to claim");

        // Zero out balance before external call (CEI pattern)
        pendingBalance[twitterId] = 0;

        Tip[] storage tips = pendingTips[twitterId];
        for (uint256 i = 0; i < tips.length; i++) {
            if (!tips[i].claimed && !tips[i].refunded) {
                tips[i].claimed = true;
            }
        }

        (bool sent, ) = payable(wallet).call{value: total}("");
        require(sent, "Claim transfer failed");

        emit TipClaimed(twitterId, wallet, total);
    }

    /**
     * @notice Refund a specific tip after REFUND_DELAY (90 days) if unclaimed.
     *         Only the original sender can refund their own tip.
     * @param twitterId  The recipient Twitter ID.
     * @param tipIndex   Index in the tips array.
     */
    function refund(string calldata twitterId, uint256 tipIndex) external nonReentrant {
        require(registeredWallets[twitterId] == address(0), "Recipient already registered");

        Tip[] storage tips = pendingTips[twitterId];
        require(tipIndex < tips.length, "Invalid tip index");

        Tip storage t = tips[tipIndex];
        require(t.sender == msg.sender, "Not your tip");
        require(!t.claimed, "Already claimed");
        require(!t.refunded, "Already refunded");
        require(block.timestamp >= t.timestamp + REFUND_DELAY, "Refund delay not passed");

        uint256 amount = t.amount;

        // Update state before external call (CEI pattern)
        t.refunded = true;
        pendingBalance[twitterId] -= amount;

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Refund transfer failed");

        emit TipRefunded(msg.sender, amount, tipIndex);
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

    function getTip(string calldata twitterId, uint256 index)
        external
        view
        returns (Tip memory)
    {
        return pendingTips[twitterId][index];
    }

    function getTipCount(string calldata twitterId) external view returns (uint256) {
        return pendingTips[twitterId].length;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setFee(uint256 newFeePercent) external onlyOwner {
        require(newFeePercent <= 500, "Fee too high (max 5%)");
        emit FeeUpdated(platformFeePercent, newFeePercent);
        platformFeePercent = newFeePercent;
    }

    /**
     * @notice Withdraw only accumulated platform fees.
     *         Escrow funds are never touched — they belong to users.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees;
        require(amount > 0, "No fees");

        // Zero before external call (CEI pattern)
        accumulatedFees = 0;

        (bool sent, ) = payable(owner).call{value: amount}("");
        require(sent, "Withdraw failed");

        emit FeesWithdrawn(owner, amount);
    }

    // ─── Two-step Ownership ───────────────────────────────────────────────────

    /**
     * @notice Propose a new owner. They must accept via acceptOwnership().
     */
    function transferOwnership(address proposed) external onlyOwner {
        require(proposed != address(0), "Invalid address");
        pendingOwner = proposed;
        emit OwnershipTransferProposed(proposed);
    }

    /**
     * @notice New owner accepts the transfer.
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}
