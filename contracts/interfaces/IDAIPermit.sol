// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

/// @notice EIP-2612 interface.
interface IDAIPermit {
    function balanceOf(address user) external returns(uint);

    function permit(
        address owner, 
        address spender,
        uint256 nonce,
        uint256 deadline, 
        bool allowed,
        uint8 v, 
        bytes32 r, 
        bytes32 s
    ) external;
}
