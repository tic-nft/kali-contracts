// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

import '../../libraries/SafeTransferLib.sol';
import '../../interfaces/IKaliAccessManager.sol';
import '../../interfaces/IKaliShareManager.sol';
import '../../interfaces/IERC20Permit.sol';
import '../../utils/Multicall.sol';
import '../../utils/ReentrancyGuard.sol';

/// @notice Crowdsale contract that receives ETH or ERC-20 to mint registered DAO tokens, including merkle access lists.
contract LandDAOcrowdsale is Multicall, ReentrancyGuard {
    using SafeTransferLib for address;

    event ExtensionSet(
        address indexed dao, 
        address purchaseToken, 
        uint96 purchaseLimit, 
        uint256 goal
    );

    event ExtensionCalled(address indexed dao, address indexed purchaser, uint256 amountOut);

    // error NullMultiplier();

    error SaleEnded();

    error BadValue();

    // error NotListed();

    error PurchaseLimit();
    
    IKaliAccessManager private immutable accessManager;

    address private immutable wETH;

    address private immutable dai;

    address public dao;
    uint public goal;
    uint public totalFunds;
    mapping(address => uint) public contributions;
    address[] internal members;
    address public fundingERC20;
    uint96 public purchaseLimit;

    // struct Crowdsale {
    //     uint256 listId;
    //     address purchaseToken;
    //     uint8 purchaseMultiplier;
    //     uint96 purchaseLimit;
    //     uint96 amountPurchased;
    //     uint32 saleEnds;
    //     string details;
    // }

    constructor(IKaliAccessManager accessManager_, address wETH_, address dai_) {
        accessManager = accessManager_;
        dai = dai_;
        wETH = wETH_;
    }

    function setExtension(bytes calldata extensionData) public nonReentrant virtual {
        (address _purchaseToken, uint96 _purchaseLimit, uint256 _goal) 
            = abi.decode(extensionData, (uint256, address, uint8, uint96, uint32, string));
        
        // if (purchaseMultiplier == 0) revert NullMultiplier();
        dao = msg.sender;
        goal = _goal;
        purchaseLimit = _purchaseLimit;
        fundingERC20 = _purchaseToken;

        emit ExtensionSet(msg.sender, fundingERC20, purchaseLimit, goal);
    }

    function joinList(uint256 listId, bytes32[] calldata merkleProof) public virtual {
        accessManager.joinList(
            listId,
            msg.sender,
            merkleProof
        );
    }

    function contribute(
        IERC20Permit token, 
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r, 
        bytes32 s
    ) public virtual {
        if(value < 0) revert BadValue();
        if(complete) revert SaleEnded();

        // TODO: Allowance is a setting not additive.  Call public allowance to find how much more is added.

        IERC20Permit token = IERC20Permit(dai);
        token.permit(
            msg.sender,
            address(this),
            value,
            deadline,
            v,
            r,
            s
        );

        dai._safeTransferFrom(msg.sender, address(this), value);
    }

    function 

    function callExtension(address dao, uint256 amount) public payable nonReentrant virtual returns (uint256 amountOut) {
        Crowdsale storage sale = crowdsales[dao];

        if (block.timestamp > sale.saleEnds) revert SaleEnded();

        if (sale.listId != 0) 
            if (!accessManager.listedAccounts(sale.listId, msg.sender)) revert NotListed();

        if (sale.purchaseToken == address(0)) {
            amountOut = msg.value * sale.purchaseMultiplier;

            if (sale.amountPurchased + amountOut > sale.purchaseLimit) revert PurchaseLimit();

            // send ETH to DAO
            dao._safeTransferETH(msg.value);

            sale.amountPurchased += uint96(amountOut);

            IKaliShareManager(dao).mintShares(msg.sender, amountOut);
        } else if (sale.purchaseToken == address(0xDead)) {
            amountOut = msg.value * sale.purchaseMultiplier;

            if (sale.amountPurchased + amountOut > sale.purchaseLimit) revert PurchaseLimit();

            // send ETH to wETH
            wETH._safeTransferETH(msg.value);

            // send wETH to DAO
            wETH._safeTransfer(dao, msg.value);

            sale.amountPurchased += uint96(amountOut);

            IKaliShareManager(dao).mintShares(msg.sender, amountOut);
        } else {
            // send tokens to DAO
            sale.purchaseToken._safeTransferFrom(msg.sender, dao, amount);

            amountOut = amount * sale.purchaseMultiplier;

            if (sale.amountPurchased + amountOut > sale.purchaseLimit) revert PurchaseLimit();

            sale.amountPurchased += uint96(amountOut);
            
            IKaliShareManager(dao).mintShares(msg.sender, amountOut);
        }

        emit ExtensionCalled(dao, msg.sender, amountOut);
    }
}
