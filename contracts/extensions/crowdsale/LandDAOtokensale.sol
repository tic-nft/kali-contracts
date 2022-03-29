// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

import '../../libraries/SafeTransferLib.sol';
import '../../interfaces/IKaliAccessManager.sol';
import '../../interfaces/IKaliShareManager.sol';
import '../../interfaces/IDAIPermit.sol';
//import '../../tokens/erc20/Dai.sol';
import '../../utils/Multicall.sol';
import '../../utils/ReentrancyGuard.sol';

/// @notice Token Sale contract that users can list Shares for sale and fill unsolicited bids.
contract LandDAOtokensale is Multicall, ReentrancyGuard {
    using SafeTransferLib for address;

    event ExtensionSet(
        address indexed dao, 
        uint256 period
    );

    event ListShares(address actor, uint32 numShares, uint32 pricePerShare, uint256 arrayIndex);
    event BidShares(address actor, uint32 numShares, uint32 pricePerShare, uint256 arrayIndex);

    event PurchaseShares(address buyer, address seller, uint32 numShares, uint32 pricePerShare);

    event RevokeListing(uint listingIndex);
    event RevokeBid(uint listingIndex);

    error NotListingOwner();

    error CannotPurchaseOwnShares();

    error NotComplete();

    error NotEnoughShares();

    error MemberOnly();
    
    IKaliAccessManager private immutable accessManager;

    address private immutable wETH;

    address public immutable dai;

    address public dao;
    ShareSale[] public forSale;
    ShareSale[] public bids;
    uint public period;

    struct ShareSale{
        address actor;
        uint32 numShares;
        uint32 pricePerShare;
        uint timeStart;
    }

    modifier daoOnly() {
        require(msg.sender == dao, "Dao Only: the caller is not the registered dao.");
        _;
    }

    constructor(IKaliAccessManager accessManager_, address wETH_, address dai_) {
        accessManager = accessManager_;
        dai = dai_;
        wETH = wETH_;
    }

    function setExtension(bytes calldata extensionData) public nonReentrant virtual {
        (uint256 _period) 
            = abi.decode(extensionData, (uint256));
        
        dao = msg.sender;
        
        period = _period;
        emit ExtensionSet(msg.sender, period);
    }

    function joinList(uint256 listId, bytes32[] calldata merkleProof) public virtual {
        accessManager.joinList(
            listId,
            msg.sender,
            merkleProof
        );
    }

    function bidShares(
        //IERC20Permit token, 
        uint32 _numShares,
        uint32 _pricePerShare,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r, 
        bytes32 s
    ) public virtual nonReentrant {
        uint value = _numShares * _pricePerShare;

        IDAIPermit token = IDAIPermit(dai);
        token.permit(
            msg.sender,
            address(this),
            nonce,
            deadline,
            true,
            v,
            r,
            s
        );

        dai._safeTransferFrom(msg.sender, address(this), value);
        
        bids.push(ShareSale({
            actor: msg.sender,
            numShares: _numShares,
            pricePerShare: _pricePerShare,
            timeStart: block.timestamp
        }));

        emit BidShares(msg.sender, _numShares, _pricePerShare, bids.length - 1);
    }

    function revokeBid(
        uint32 _listingIndex
    ) public nonReentrant {

        if (bids[_listingIndex].actor != msg.sender) revert NotListingOwner();
        else {
            delete bids[_listingIndex];
            dai._safeTransferFrom(address(this), msg.sender, bids[_listingIndex].numShares * bids[_listingIndex].pricePerShare);
        }

        emit RevokeBid(_listingIndex);
    }

    function listShares(
        uint32 _pricePerShare,
        uint32 _numShares,
        address _member
    ) public nonReentrant daoOnly {

        forSale.push(ShareSale({
            actor: _member,
            numShares: _numShares,
            pricePerShare: _pricePerShare,
            timeStart: block.timestamp
        }));

        emit ListShares(_member, _numShares, _pricePerShare, forSale.length - 1);
    }

    function revokeListing(
        uint32 _listingIndex,
        address _member
    ) public nonReentrant daoOnly {

        if (forSale[_listingIndex].actor != _member) revert NotListingOwner();
        else {
            IKaliShareManager(dao).transferShares(_member, _member, forSale[_listingIndex].numShares, 0);
            delete forSale[_listingIndex];
        }
        
        emit RevokeListing(_listingIndex);
    }

    function purchaseShares(
        uint _listingIndex,
        uint32 _numShares,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r, 
        bytes32 s
    ) public virtual nonReentrant {
        // see if I can steal from bidder as the seller because I ask for too much

        ShareSale memory shares = forSale[_listingIndex];
        if(shares.actor == msg.sender) revert CannotPurchaseOwnShares();
        if((block.timestamp < shares.timeStart + period) && (IKaliShareManager(dao).balanceOf(msg.sender) == 0)) revert MemberOnly();
        if(shares.numShares < _numShares) revert NotEnoughShares();
        
        uint value = _numShares * shares.pricePerShare;

        IDAIPermit token = IDAIPermit(dai);
        token.permit(
            msg.sender,
            shares.actor,
            nonce,
            deadline,
            true,
            v,
            r,
            s
        );

        dai._safeTransferFrom(msg.sender, shares.actor, value);

        forSale[_listingIndex].numShares -= _numShares;
        if (forSale[_listingIndex].numShares == 0){
            delete forSale[_listingIndex];
        }

        IKaliShareManager(dao).transferShares(msg.sender, shares.actor, _numShares, shares.pricePerShare);

        emit PurchaseShares(msg.sender, shares.actor, _numShares, shares.pricePerShare);
    }

    function fillBid(
        address _member,
        uint _listingIndex,
        uint32 _numShares
    ) public nonReentrant daoOnly {
        ShareSale memory shares = bids[_listingIndex];
        if(shares.actor == _member) revert CannotPurchaseOwnShares();

        if(shares.numShares < _numShares) revert NotEnoughShares();
        uint256 value = _numShares * shares.pricePerShare;

        dai._safeTransferFrom(address(this), msg.sender, value);

        bids[_listingIndex].numShares -= _numShares;
        if (bids[_listingIndex].numShares == 0){
            delete bids[_listingIndex];
        }

        IKaliShareManager(dao).transferShares(shares.actor, _member, _numShares, shares.pricePerShare);
        emit PurchaseShares(shares.actor, _member, _numShares, shares.pricePerShare);
    }

    function callExtension() public nonReentrant virtual {

        revert NotComplete();
    }
}
