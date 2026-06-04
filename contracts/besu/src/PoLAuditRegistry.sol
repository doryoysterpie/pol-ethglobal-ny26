// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {IPoLAuditRegistry} from "./IPoLAuditRegistry.sol";

/// @title PoLAuditRegistry — on-chain audit-batch root registry
/// @notice An authorized operator anchors the Merkle root of an off-chain access-log batch.
///         Roots are immutable once written (first-write-wins). Only roots — never PII — are
///         stored on-chain. Compiled for the London EVM (see foundry.toml) to match the Besu
///         dev-net. Hackathon v0: unaudited; in production this root is also dual-anchored
///         off-chain (OpenTimestamps→Bitcoin + Guardtime KSI).
/// @dev    Gas-optimized: custom errors, single SSTORE per batch, indexed event.
contract PoLAuditRegistry is IPoLAuditRegistry {
    /// @notice Authorized operator permitted to anchor batches. (implements IPoLAuditRegistry.operator)
    address public override operator;

    /// @notice batchId => Merkle root of that batch's access-log entries (0x0 == not anchored).
    mapping(uint256 => bytes32) public override dailyLogRoots;

    // Events (AuditLogged, OperatorTransferred) are declared in IPoLAuditRegistry and inherited.

    error NotOperator();
    error ZeroAddress();
    error ZeroRoot();
    error BatchAlreadyAnchored(uint256 batchId);

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(address initialOperator) {
        if (initialOperator == address(0)) revert ZeroAddress();
        operator = initialOperator;
        emit OperatorTransferred(address(0), initialOperator);
    }

    /// @notice Anchor an audit-log batch's Merkle root. First-write-wins per batchId.
    function anchorAuditBatch(uint256 batchId, bytes32 merkleRoot) external override onlyOperator {
        if (merkleRoot == bytes32(0)) revert ZeroRoot();
        if (dailyLogRoots[batchId] != bytes32(0)) revert BatchAlreadyAnchored(batchId);
        dailyLogRoots[batchId] = merkleRoot;
        emit AuditLogged(batchId, merkleRoot, msg.sender, block.timestamp);
    }

    /// @notice True once a batch has been anchored.
    function isAnchored(uint256 batchId) external view override returns (bool) {
        return dailyLogRoots[batchId] != bytes32(0);
    }

    /// @notice Hand operator authority to a new address (e.g., validator-set / governance change).
    function transferOperator(address newOperator) external override onlyOperator {
        if (newOperator == address(0)) revert ZeroAddress();
        emit OperatorTransferred(operator, newOperator);
        operator = newOperator;
    }
}
