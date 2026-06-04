// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

/// @title CommitmentAnchor — on-chain commitment anchor (Besu)
/// @notice Stores a 256-bit commitment (sha256 of the issued credential) with the block
///         number, timestamp, and anchorer. First-write-wins (a commitment cannot be
///         re-anchored/overwritten). Only the HASH is ever written — never PII.
/// @dev    Minimal by design: no functions, storage, or events beyond what anchoring needs.
contract CommitmentAnchor {
    // 0 == not anchored. PRIVATE on purpose: only `isAnchored` reads blockOf/tsOf; `anchorerOf`
    // is written and surfaced only via the event. Marking these `public` would auto-generate
    // getters we deliberately don't expose.
    mapping(uint256 => uint64) private blockOf;
    mapping(uint256 => uint64) private tsOf;
    mapping(uint256 => address) private anchorerOf;

    event Anchored(uint256 indexed commitment, address anchorer, uint64 blockNumber, uint64 timestamp);

    /// @notice Anchor a commitment. First-write-wins: reverts if already anchored.
    function anchor(uint256 commitment) external {
        require(blockOf[commitment] == 0, "already anchored");
        uint64 bn = uint64(block.number);
        uint64 ts = uint64(block.timestamp);
        blockOf[commitment] = bn;
        tsOf[commitment] = ts;
        anchorerOf[commitment] = msg.sender;
        emit Anchored(commitment, msg.sender, bn, ts);
    }

    /// @notice Returns (found, blockNumber, timestamp).
    function isAnchored(uint256 commitment) external view returns (bool, uint64, uint64) {
        uint64 bn = blockOf[commitment];
        return (bn != 0, bn, tsOf[commitment]);
    }
}
