// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import {CommitmentAnchor} from "../src/CommitmentAnchor.sol";

// Minimal cheatcode interface (dependency-free; avoids pulling forge-std).
interface Vm {
    function roll(uint256) external;
    function warp(uint256) external;
    function expectEmit(bool, bool, bool, bool) external;
}

/// Behavioural tests for CommitmentAnchor.
/// Assertions use plain `require` (a failing require reverts -> the test fails).
contract CommitmentAnchorTest {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    CommitmentAnchor c;

    event Anchored(uint256 indexed commitment, address anchorer, uint64 blockNumber, uint64 timestamp);

    function setUp() public {
        c = new CommitmentAnchor();
    }

    // Unknown commitment -> (false, 0, 0).
    function test_unknown_not_anchored() public view {
        (bool found, uint64 bn, uint64 ts) = c.isAnchored(uint256(0xABCDEF));
        require(!found && bn == 0 && ts == 0, "unknown should be unanchored");
    }

    // anchor stores block.number/block.timestamp and isAnchored reports them.
    function test_anchor_stores_and_reports() public {
        vm.roll(100);
        vm.warp(1730000000);
        uint256 commitment = uint256(0x1234);
        c.anchor(commitment);
        (bool found, uint64 bn, uint64 ts) = c.isAnchored(commitment);
        require(found, "should be anchored");
        require(bn == 100, "block number mismatch");
        require(ts == 1730000000, "timestamp mismatch");
    }

    // re-anchor reverts (first-write-wins).
    function test_first_write_wins() public {
        uint256 commitment = uint256(0x5678);
        c.anchor(commitment);
        (bool ok, ) = address(c).call(abi.encodeWithSignature("anchor(uint256)", commitment));
        require(!ok, "re-anchor must revert (already anchored)");
    }

    // emits Anchored { commitment (indexed), anchorer, blockNumber, timestamp }.
    function test_emits_event() public {
        vm.roll(7);
        vm.warp(1700000000);
        uint256 commitment = uint256(0x9abc);
        vm.expectEmit(true, true, true, true);
        emit Anchored(commitment, address(this), uint64(7), uint64(1700000000));
        c.anchor(commitment);
    }
}
