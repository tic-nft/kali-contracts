// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

/// @notice Kali DAO share manager interface.
interface ILandShareTransfer {
    function listShares(
        uint32 _pricePerShare,
        uint32 _numShares,
        address _member
    ) external;

    function revokeListing(
        uint32 _listingIndex,
        address _member
    ) external;

    function fillBid(
        address _member,
        uint _listingIndex,
        uint32 _numShares
    ) external;
}
