// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

/// @notice Kali DAO share manager interface.
interface IKaliShareManager {
    function mintShares(address to, uint256 amount) external;
    function transferShares(address to, uint256 amount, uint256 pricePerShare) external;

    function balanceOf(address member) external returns(uint);

    function burnShares(address from, uint256 amount) external;
}
