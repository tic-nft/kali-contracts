// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

import '../../libraries/SafeTransferLib.sol';
import '../../interfaces/IKaliAccessManager.sol';
import '../../interfaces/IKaliShareManager.sol';
import '../../interfaces/IDAIPermit.sol';
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

    event FundsContributed(address user, uint256 contribution);

    event FundsWithdrawn(address user, uint256 withdraw);
    
    // error NullMultiplier();

    error SaleEnded();

    error BadValue();

    // error NotListed();

    error PurchaseLimit();

    error NotComplete();

    error Distributed();
    
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
    bool public complete;
    bool public distributed;

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
            = abi.decode(extensionData, (address, uint96, uint256));
        
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
        //IERC20Permit token, 
        uint256 value,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r, 
        bytes32 s
    ) public virtual nonReentrant {
        if(complete) revert SaleEnded();
        if(value < purchaseLimit && value < (goal - totalFunds)) revert BadValue();

        uint256 singleContribution;
        if (value > goal - totalFunds){
            singleContribution = goal - totalFunds;
        } else {
            singleContribution = value;
        }

        
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

        dai._safeTransferFrom(msg.sender, address(this), singleContribution);
        
        totalFunds += singleContribution;
        if (contributions[msg.sender] != 0){
            members.push(msg.sender);
        }
        contributions[msg.sender] += singleContribution;

        emit FundsContributed(msg.sender, singleContribution);

        if (totalFunds >= goal){
            complete = true;
        }
    }

    function withdraw(uint256 _reduceAmount) public nonReentrant {
        if(_reduceAmount <= 0 || _reduceAmount > contributions[msg.sender]) revert BadValue();
        if(complete) revert SaleEnded();

        contributions[msg.sender] -= _reduceAmount;
        totalFunds -= _reduceAmount;

        dai._safeTransferFrom(address(this), msg.sender, _reduceAmount);

        if (contributions[msg.sender] <= 0){
            for (uint i = 0; i < members.length; i++){
                if (msg.sender == members[i]){
                    members[i] = members[members.length - 1];
                    members.pop();
                    break;
                }
            }
        }

        emit FundsWithdrawn(msg.sender, _reduceAmount);
    }

    function callExtension() public nonReentrant virtual returns (uint256 amountOut) {

        if(!complete) revert NotComplete();
        if(distributed) revert Distributed();

        dai._safeTransferFrom(address(this), dao, totalFunds);

        uint shares;
        for (uint x = 0; x < members.length; x++){
            shares = (95000 * contributions[members[x]]) / goal;
            IKaliShareManager(dao).mintShares(members[x], shares);
        }
        

        distributed = true;
        emit ExtensionCalled(dao, msg.sender, amountOut);
    }
}
