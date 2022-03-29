// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

import '../../libraries/SafeTransferLib.sol';
import '../../interfaces/IKaliAccessManager.sol';
import '../../interfaces/IKaliShareManager.sol';
import '../../interfaces/IDAIPermit.sol';
//import '../../tokens/erc20/Dai.sol';
import '../../utils/Multicall.sol';
import '../../utils/ReentrancyGuard.sol';

/// @notice Capital Call contract that receives DAI to mint registered DAO tokens, including merkle access lists.
contract LandDAOcapitalcall is Multicall, ReentrancyGuard {
    using SafeTransferLib for address;

    event ExtensionSet(
        address indexed dao, 
        uint256 goal
    );

    event ExtensionCalled(address indexed members, uint256 shares);

    event FundsContributed(address user, uint256 contribution);

    event FundsWithdrawn(address user, uint256 withdraw);
    
    // error NullMultiplier();

    error SaleEnded();

    error BadValue();

    // error NotListed();

    error PurchaseLimit();

    error NotComplete();

    error Distributed();

    error ContributionTooMuch();

    error MemberOnly();

    error NoArrayParity();
    
    IKaliAccessManager private immutable accessManager;

    address private immutable wETH;

    address public immutable dai;

    address public dao;
    uint public goal;
    uint public totalFunds;
    uint public totalNewFunds;
    mapping(address => uint) public contributions;
    address[] public members;
    mapping(address => uint) public memberShare;
    uint public pricePerShare;
    bool public complete;
    bool public distributed;
    uint public period;
    uint public startTime;

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
        (address[] memory _members, uint256[] memory _memberShare, uint256 _goal, uint256 _period, uint256 _daoValue, uint256 _numShares) 
            = abi.decode(extensionData, (address[], uint256[], uint256, uint256, uint256, uint256));
        
        // if (purchaseMultiplier == 0) revert NullMultiplier();
        if (_members.length != _memberShare.length) revert NoArrayParity();
        dao = msg.sender;
        goal = _goal;
        members = _members;
        for (uint x = 0; x < _memberShare.length; x++){
            memberShare[members[x]] = _memberShare[x];
        }
        period = _period;
        startTime = block.timestamp;
        pricePerShare = (_daoValue * 100) / _numShares;

        emit ExtensionSet(msg.sender, goal);
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
        if((block.timestamp < startTime + period) && (value + contributions[msg.sender] > memberShare[msg.sender])) revert ContributionTooMuch();
        if((block.timestamp < startTime + (2 * period)) && memberShare[msg.sender] == 0) revert MemberOnly();

        uint singleContribution;
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
        totalNewFunds += singleContribution;
        if (contributions[msg.sender] == 0 && memberShare[msg.sender] == 0){
            members.push(msg.sender);
        }
        
        contributions[msg.sender] += singleContribution;

        emit FundsContributed(msg.sender, singleContribution);
        
        if (totalFunds >= goal){
            complete = true;
        }
    }

    function contributeLoot(uint value, address member) public nonReentrant daoOnly {
        if(complete) revert SaleEnded();
        if((block.timestamp < startTime + period) && (value + contributions[member] > memberShare[member])) revert ContributionTooMuch();
        if((block.timestamp < startTime + (2 * period)) && (value + totalFunds > goal)) revert ContributionTooMuch();

        totalFunds += value;
        contributions[member] += value;

        emit FundsContributed(member, value);

        if (totalFunds >= goal){
            complete = true;
        }
    }

    function callExtension() public nonReentrant virtual {

        if(!complete) revert NotComplete();
        if(distributed) revert Distributed();

        dai._safeTransferFrom(address(this), dao, totalNewFunds);

        uint shares;
        for (uint x = 0; x < members.length; x++){
            shares = contributions[members[x]] / (pricePerShare * 10**16);  // DAI decimals of 18 with 100 multiplier to account for PPS calc from above
            IKaliShareManager(dao).mintShares(members[x], shares);
        }
        if (totalFunds - totalNewFunds > 0)
            IKaliShareManager(dao).unreserveLoot(totalFunds - totalNewFunds);
        
        distributed = true;
        emit ExtensionCalled(msg.sender, shares);
    }
}
