// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Xenia Escrow — Somnia Network
 *
 * Two tipping modes:
 *   A) Direct tip (extension/frontend): user sends STT via tip()
 *   B) Twitter command (bot): user deposits STT, authorizes bot,
 *      bot calls tipOnBehalf() when a tip command tweet is detected
 *
 * Security:
 *   - ReentrancyGuard on all external calls
 *   - Fee balance tracked separately (never commingled with user funds)
 *   - registerWallet immutable once set
 *   - 90-day sender refund for unclaimed escrow tips
 *   - Two-step ownership transfer
 *   - tipOnBehalf: bot can only send to registered recipients, not withdraw
 */
contract Escrow {

    // ─── Reentrancy Guard ─────────────────────────────────────────────────────

    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    modifier nonReentrant() {
        require(_status != _ENTERED, "Reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant REFUND_DELAY = 90 days;

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Tip {
        address sender;
        uint256 amount;
        uint256 timestamp;
        bool    claimed;
        bool    refunded;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    // Escrow tips (Mode A)
    mapping(string  => Tip[])   private pendingTips;
    mapping(string  => uint256) private pendingBalance;

    // Twitter ID ↔ wallet registration
    mapping(string  => address) private registeredWallets;
    mapping(address => string)  private walletToTwitter;

    // Mode B — internal deposits
    mapping(address => uint256) public depositedBalance;

    // Mode B — authorization: user → delegate (bot) → allowed?
    mapping(address => mapping(address => bool)) public authorized;

    // Platform fees (separate from user funds)
    uint256 public accumulatedFees;
    uint256 public platformFeePercent = 100; // 1.00% (basis points / 10000)

    // Ownership
    address public owner;
    address public pendingOwner;

    // ─── Events ───────────────────────────────────────────────────────────────

    event TipSent(address indexed sender, string indexed recipientTwitterId, uint256 amount, uint256 fee, uint256 tipIndex);
    event DirectTip(address indexed sender, address indexed recipient, uint256 amount, uint256 fee);
    event TipClaimed(string indexed twitterId, address indexed recipient, uint256 amount);
    event TipRefunded(address indexed sender, uint256 amount, uint256 tipIndex);
    event WalletRegistered(string indexed twitterId, address indexed wallet);

    // Mode B events
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Authorized(address indexed user, address indexed delegate);
    event Deauthorized(address indexed user, address indexed delegate);
    event TipOnBehalf(address indexed sender, string indexed recipientTwitterId, uint256 amount, uint256 fee);

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event OwnershipTransferProposed(address indexed proposed);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ─── Constructor ──────────────────────────────────────────────────────────

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
     * @notice Link twitterId ↔ wallet. Immutable once set. onlyOwner (backend).
     */
    function registerWallet(string calldata twitterId, address wallet) external onlyOwner {
        require(wallet != address(0), "Invalid wallet");
        require(bytes(twitterId).length > 0, "Empty twitterId");
        require(registeredWallets[twitterId] == address(0), "Already registered");

        registeredWallets[twitterId] = wallet;
        walletToTwitter[wallet] = twitterId;

        emit WalletRegistered(twitterId, wallet);
    }

    // ─── MODE A: Direct Tip ───────────────────────────────────────────────────

    /**
     * @notice Tip by Twitter ID. Send STT with the call.
     *         Registered → direct transfer. Unregistered → escrow.
     */
    function tip(string calldata recipientTwitterId) external payable nonReentrant {
        require(msg.value > 0, "Must send STT");
        require(bytes(recipientTwitterId).length > 0, "Empty recipient");

        uint256 fee       = (msg.value * platformFeePercent) / 10000;
        uint256 netAmount = msg.value - fee;
        accumulatedFees  += fee;

        address dest = registeredWallets[recipientTwitterId];

        if (dest != address(0)) {
            (bool sent, ) = payable(dest).call{value: netAmount}("");
            require(sent, "Transfer failed");
            emit DirectTip(msg.sender, dest, netAmount, fee);
        } else {
            uint256 idx = pendingTips[recipientTwitterId].length;
            pendingTips[recipientTwitterId].push(Tip({
                sender:    msg.sender,
                amount:    netAmount,
                timestamp: block.timestamp,
                claimed:   false,
                refunded:  false
            }));
            pendingBalance[recipientTwitterId] += netAmount;
            emit TipSent(msg.sender, recipientTwitterId, netAmount, fee, idx);
        }
    }

    /**
     * @notice Claim all pending escrow tips. Caller must be the registered wallet.
     */
    function claim(string calldata twitterId) external nonReentrant {
        address wallet = registeredWallets[twitterId];
        require(wallet != address(0), "Wallet not registered");
        require(msg.sender == wallet, "Not your wallet");

        uint256 total = pendingBalance[twitterId];
        require(total > 0, "Nothing to claim");

        pendingBalance[twitterId] = 0;

        Tip[] storage tips = pendingTips[twitterId];
        for (uint256 i = 0; i < tips.length; i++) {
            if (!tips[i].claimed && !tips[i].refunded) tips[i].claimed = true;
        }

        (bool sent, ) = payable(wallet).call{value: total}("");
        require(sent, "Claim failed");
        emit TipClaimed(twitterId, wallet, total);
    }

    /**
     * @notice Refund a specific escrow tip after REFUND_DELAY if recipient never registers.
     */
    function refund(string calldata twitterId, uint256 tipIndex) external nonReentrant {
        require(registeredWallets[twitterId] == address(0), "Recipient registered");

        Tip[] storage tips = pendingTips[twitterId];
        require(tipIndex < tips.length, "Invalid index");

        Tip storage t = tips[tipIndex];
        require(t.sender == msg.sender, "Not your tip");
        require(!t.claimed && !t.refunded, "Already settled");
        require(block.timestamp >= t.timestamp + REFUND_DELAY, "Too early");

        uint256 amount = t.amount;
        t.refunded = true;
        pendingBalance[twitterId] -= amount;

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Refund failed");
        emit TipRefunded(msg.sender, amount, tipIndex);
    }

    // ─── MODE B: Twitter Command Tips ─────────────────────────────────────────

    /**
     * @notice Deposit STT for Twitter-command tipping.
     *         These funds stay in the contract under msg.sender's balance.
     */
    function deposit() external payable nonReentrant {
        require(msg.value > 0, "Must send STT");
        depositedBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Authorize a delegate (the Xenia bot) to tip on your behalf.
     *         The bot can ONLY call tipOnBehalf — it cannot withdraw to arbitrary addresses.
     */
    function authorize(address delegate) external {
        require(delegate != address(0), "Invalid delegate");
        require(delegate != msg.sender, "Cannot self-authorize");
        authorized[msg.sender][delegate] = true;
        emit Authorized(msg.sender, delegate);
    }

    /**
     * @notice Revoke bot authorization.
     */
    function deauthorize(address delegate) external {
        authorized[msg.sender][delegate] = false;
        emit Deauthorized(msg.sender, delegate);
    }

    /**
     * @notice Withdraw your deposited STT back to your wallet.
     */
    function withdrawDeposit(uint256 amount) external nonReentrant {
        require(depositedBalance[msg.sender] >= amount, "Insufficient balance");
        depositedBalance[msg.sender] -= amount;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Withdraw failed");
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Bot calls this when "@XeniaBot tip @recipient X" is detected.
     * @param sender             The Twitter user's wallet address.
     * @param recipientTwitterId The recipient's Twitter/X ID.
     * @param amount             Amount in wei (from deposited balance).
     */
    function tipOnBehalf(
        address sender,
        string calldata recipientTwitterId,
        uint256 amount
    ) external nonReentrant {
        require(authorized[sender][msg.sender], "Not authorized");
        require(bytes(recipientTwitterId).length > 0, "Empty recipient");
        require(amount > 0, "Amount must be > 0");
        require(depositedBalance[sender] >= amount, "Insufficient deposit");

        uint256 fee       = (amount * platformFeePercent) / 10000;
        uint256 netAmount = amount - fee;

        depositedBalance[sender] -= amount;
        accumulatedFees          += fee;

        address dest = registeredWallets[recipientTwitterId];

        if (dest != address(0)) {
            (bool sent, ) = payable(dest).call{value: netAmount}("");
            require(sent, "Transfer failed");
        } else {
            uint256 idx = pendingTips[recipientTwitterId].length;
            pendingTips[recipientTwitterId].push(Tip({
                sender:    sender,
                amount:    netAmount,
                timestamp: block.timestamp,
                claimed:   false,
                refunded:  false
            }));
            pendingBalance[recipientTwitterId] += netAmount;
            emit TipSent(sender, recipientTwitterId, netAmount, fee, idx);
        }

        emit TipOnBehalf(sender, recipientTwitterId, netAmount, fee);
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

    function getTip(string calldata twitterId, uint256 index) external view returns (Tip memory) {
        return pendingTips[twitterId][index];
    }

    function getTipCount(string calldata twitterId) external view returns (uint256) {
        return pendingTips[twitterId].length;
    }

    function isAuthorized(address user, address delegate) external view returns (bool) {
        return authorized[user][delegate];
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setFee(uint256 newFeePercent) external onlyOwner {
        require(newFeePercent <= 500, "Max 5%");
        emit FeeUpdated(platformFeePercent, newFeePercent);
        platformFeePercent = newFeePercent;
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees;
        require(amount > 0, "No fees");
        accumulatedFees = 0;
        (bool sent, ) = payable(owner).call{value: amount}("");
        require(sent, "Withdraw failed");
        emit FeesWithdrawn(owner, amount);
    }

    function transferOwnership(address proposed) external onlyOwner {
        require(proposed != address(0), "Invalid");
        pendingOwner = proposed;
        emit OwnershipTransferProposed(proposed);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    receive() external payable {}
}
