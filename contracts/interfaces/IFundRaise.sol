// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

/// @notice EIP-2612 interface.
interface IFundRaise {
    function contributeLoot(uint amount, address member) external;
}
