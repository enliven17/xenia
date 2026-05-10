// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Xenia ScreenshotRegistry — Somnia Network
 * @notice Stores on-chain Proof of Post (screenshot CID + tweet ID) on Somnia.
 * @dev Fully EVM-compatible Solidity contract.
 */
contract ScreenshotRegistry {
    struct Proof {
        string cid;
        uint256 timestamp;
        string tweetId;
        address recorder;
    }

    mapping(string => Proof) private proofs;
    mapping(string => string) private cidByTweetId;

    address public owner;

    event ScreenshotRegistered(
        string indexed cid,
        string indexed tweetId,
        address indexed recorder,
        uint256 timestamp
    );
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function registerScreenshot(string calldata _cid, string calldata _tweetId) external {
        require(bytes(_cid).length > 0, "CID required");
        require(bytes(_tweetId).length > 0, "Tweet ID required");
        require(bytes(cidByTweetId[_tweetId]).length == 0, "Tweet already registered");

        Proof storage p = proofs[_cid];
        require(p.timestamp == 0, "CID already registered");

        p.cid = _cid;
        p.tweetId = _tweetId;
        p.timestamp = block.timestamp;
        p.recorder = msg.sender;

        cidByTweetId[_tweetId] = _cid;

        emit ScreenshotRegistered(_cid, _tweetId, msg.sender, block.timestamp);
    }

    function verifyScreenshot(string calldata _cid)
        external
        view
        returns (uint256 timestamp, string memory tweetId, address recorder)
    {
        Proof memory p = proofs[_cid];
        return (p.timestamp, p.tweetId, p.recorder);
    }

    function getProofByTweetId(string calldata _tweetId)
        external
        view
        returns (string memory cid, uint256 timestamp, address recorder)
    {
        string memory c = cidByTweetId[_tweetId];
        Proof memory p = proofs[c];
        return (c, p.timestamp, p.recorder);
    }

    function changeOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }
}
