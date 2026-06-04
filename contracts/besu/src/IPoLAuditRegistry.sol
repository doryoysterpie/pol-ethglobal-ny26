// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title IPoLAuditRegistry — on-chain audit-batch registry interface
/// @notice The external contract for anchoring off-chain audit-batch Merkle roots. This is the
///         compiler-enforced counterpart to the off-chain JSDoc contracts (IThresholdKMS /
///         IShredStore): `PoLAuditRegistry is IPoLAuditRegistry`, so the build fails if the
///         implementation drifts from this surface. Only roots — never PII — are stored.
interface IPoLAuditRegistry {
    /// @notice Emitted when a batch's Merkle root is anchored.
    event AuditLogged(uint256 indexed batchId, bytes32 merkleRoot, address operator, uint256 timestamp);

    /// @notice Emitted on operator handover.
    event OperatorTransferred(address indexed previousOperator, address indexed newOperator);

    /// @notice The authorized operator (satisfied by the public state variable).
    function operator() external view returns (address);

    /// @notice batchId => anchored Merkle root (bytes32(0) == not anchored). (public mapping getter)
    function dailyLogRoots(uint256 batchId) external view returns (bytes32);

    /// @notice Anchor a batch's Merkle root. First-write-wins per batchId; operator-only.
    function anchorAuditBatch(uint256 batchId, bytes32 merkleRoot) external;

    /// @notice True once a batch has been anchored.
    function isAnchored(uint256 batchId) external view returns (bool);

    /// @notice Transfer operator authority (e.g., validator-set / governance change).
    function transferOperator(address newOperator) external;
}
