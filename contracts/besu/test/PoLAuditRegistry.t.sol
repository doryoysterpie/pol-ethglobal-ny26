// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {PoLAuditRegistry} from "../src/PoLAuditRegistry.sol";

// Minimal cheatcode interface (dependency-free; avoids pulling forge-std).
interface Vm {
    function warp(uint256) external;
    function expectEmit(bool, bool, bool, bool) external;
}

/// Tests for the audit registry. Assertions use plain `require`
/// (a failing require reverts -> the test fails); reverts are checked via low-level calls.
contract PoLAuditRegistryTest {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    PoLAuditRegistry reg;

    event AuditLogged(uint256 indexed batchId, bytes32 merkleRoot, address operator, uint256 timestamp);

    function setUp() public {
        reg = new PoLAuditRegistry(address(this)); // test contract is the operator
    }

    function test_anchor_stores_and_reports() public {
        bytes32 root = keccak256("batch-1");
        reg.anchorAuditBatch(1, root);
        require(reg.dailyLogRoots(1) == root, "root not stored");
        require(reg.isAnchored(1), "should report anchored");
        require(!reg.isAnchored(2), "unknown batch must be unanchored");
    }

    function test_emits_event() public {
        vm.warp(1700000000);
        bytes32 root = keccak256("batch-7");
        vm.expectEmit(true, true, true, true);
        emit AuditLogged(7, root, address(this), 1700000000);
        reg.anchorAuditBatch(7, root);
    }

    function test_only_operator() public {
        PoLAuditRegistry reg2 = new PoLAuditRegistry(address(0xBEEF)); // operator is 0xBEEF, not us
        (bool ok, ) = address(reg2).call(
            abi.encodeWithSignature("anchorAuditBatch(uint256,bytes32)", uint256(1), keccak256("x"))
        );
        require(!ok, "non-operator must be rejected");
    }

    function test_first_write_wins() public {
        reg.anchorAuditBatch(2, keccak256("a"));
        (bool ok, ) = address(reg).call(
            abi.encodeWithSignature("anchorAuditBatch(uint256,bytes32)", uint256(2), keccak256("b"))
        );
        require(!ok, "re-anchoring a batchId must revert");
        require(reg.dailyLogRoots(2) == keccak256("a"), "original root must be preserved");
    }

    function test_zero_root_rejected() public {
        (bool ok, ) = address(reg).call(
            abi.encodeWithSignature("anchorAuditBatch(uint256,bytes32)", uint256(3), bytes32(0))
        );
        require(!ok, "zero root must revert");
    }

    function test_transfer_operator() public {
        reg.transferOperator(address(0xCAFE));
        require(reg.operator() == address(0xCAFE), "operator not transferred");
        (bool ok, ) = address(reg).call(
            abi.encodeWithSignature("anchorAuditBatch(uint256,bytes32)", uint256(9), keccak256("z"))
        );
        require(!ok, "old operator must be rejected after transfer");
    }
}
