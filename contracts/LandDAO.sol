// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

// import './KaliDAOtoken.sol';
import './utils/Multicall.sol';
// import './utils/NFThelper.sol';
import './utils/ReentrancyGuard.sol';
import './interfaces/IKaliDAOextension.sol';
import './interfaces/ILandShareTransfer.sol';
//import './interfaces/IERC20Permit.sol';
import './interfaces/IDAIPermit.sol';
import './interfaces/IFundRaise.sol';
//import './tokens/erc20/Dai.sol';
import './libraries/SafeTransferLib.sol';
// import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Simple gas-optimized Kali DAO core module.
contract LandDAO is Multicall, ReentrancyGuard {
    using SafeTransferLib for address;
    /*///////////////////////////////////////////////////////////////
                            EVENTS
    //////////////////////////////////////////////////////////////*/

    event NewProposal(
        address indexed proposer, 
        uint256 indexed proposal, 
        ProposalType indexed proposalType, 
        string description, 
        address[] accounts, 
        uint256[] amounts, 
        bytes[] payloads
    );

    event Transfer(address indexed from, address indexed to, uint256 amount);

    event DividendDeposit(uint256 amount);

    event Withdraw(address member, uint256 amount);
    
    event VoteCast(address indexed voter, uint256 indexed proposal, bool indexed approve);

    event ProposalProcessed(uint256 indexed proposal, bool indexed didProposalPass);

    event FirstAction(uint goal);

    event SecondAction(uint goal);

    /*///////////////////////////////////////////////////////////////
                            ERRORS
    //////////////////////////////////////////////////////////////*/

    error Initialized();

    error PeriodBounds();

    error QuorumMax();

    error SupermajorityBounds();

    error InitCallFail();

    error TypeBounds();

    error NotCurrentProposal();

    error AlreadyVoted();

    error NotVoteable();

    error VotingNotEnded();

    error PrevNotProcessed();

    error NotExtension();

    error ZeroManager();

    error ZeroSale();

    error InsufficientFunds();

    error NotEnoughShares();

    /* FROM KaliDAOToken */
    error NoArrayParity();

    error Uint32max();

    error InvalidSignature();

    error NoLoot();

    /*///////////////////////////////////////////////////////////////
                            DAO STORAGE
    //////////////////////////////////////////////////////////////*/

    //uint256 constant DECIMAL_SPACES = 10**18;

    string public docs;

    uint256 private currentSponsoredProposal;
    
    uint256 public proposalCount;

    // uint32 public votingPeriod;

    // uint32 public gracePeriod;

    uint32 public quorum; // 1-100

    uint32 public supermajority; // 1-100
    
    bytes32 public constant VOTE_HASH = 
        keccak256('SignVote(address signer,uint256 proposal,bool approve)');

    uint256 internal INITIAL_CHAIN_ID;

    bytes32 internal INITIAL_DOMAIN_SEPARATOR;

    address public manager;  // user that gets funds for real world activity
    address public notary;  // lawyer that ensures proper release of funds to manager
    
    uint8 public constant decimals = 0; /*unit scaling factor in erc20 `shares` accounting - '18' is default to match ETH & common erc20s*/
    string public name; /*'name' for erc20 `shares` accounting*/
    string public symbol; /*'symbol' for erc20 `shares` accounting*/

    mapping(address => uint256) public balanceOf; /*maps `members` accounts to `shares` with erc20 accounting*/
    mapping(address => uint256) public lootBalanceOf; /*maps `members` accounts to `shares` with erc20 accounting*/
    uint256 public totalLoot; /*counter for total `loot` economic weight held by `members`*/
    uint256 public reservedLoot; /*keeps track of loot that needs to be held in reserve for the Capital Call*/
    uint256 public totalSupply; /*counter for total `members` voting `shares` with erc20 accounting*/
    address[] public members; /* needed to iterate the member list */

    address public dai;
    address public tokenSale;
    address public crowdFund;
    address public capitalCall;

    // uint96 public daoValue; /* Used for capital calls to ensure fairness in minting new shares */

    mapping(address => uint256) public listedShares; /*maps `members` accounts to `shares` with erc20 accounting*/

    uint public propertyValue; /*the value of the property that is used to assess capital call raises*/

    mapping(address => bool) public extensions;

    mapping(uint256 => Proposal) public proposals;

    mapping(uint256 => ProposalState) public proposalStates;

    mapping(ProposalType => VoteType) public proposalVoteTypes;

    mapping(ProposalType => uint16) public proposalVotePeriod;
    
    mapping(uint256 => mapping(address => bool)) public voted;

    mapping(uint256 => mapping(address => uint256)) public weights;

    DaoState public currentState;

    // mapping(address => uint256) public lastYesVote;

    enum DaoState {
        STARTED,
        PURCHASED,
        SOLD
    }

    enum ProposalType {
        // MINT, // add membership
        // BURN, // revoke membership
        CALL, // call contracts
        VPERIOD, // set `votingPeriod`
        // GPERIOD, // set `gracePeriod`
        QUORUM, // set `quorum`
        SUPERMAJORITY, // set `supermajority`
        TYPE, // set `VoteType` to `ProposalType`
        // PAUSE, // flip membership transferability
        EXTENSION, // flip `extensions` whitelisting
        ESCAPE, // delete pending proposal in case of revert
        DOCS, // amend org docs
        SELL, // call for manager to sell property
        PURCHASE, // call to place funds in escrow for manager to use
        MANAGER, // call to set a new manager for property
        DISTRIBUTE // destroy all shares and return money
    }

    uint16 internal constant TYPE_COUNT = 12;

    enum VoteType {
        SIMPLE_MAJORITY,
        SIMPLE_MAJORITY_QUORUM_REQUIRED,
        SUPERMAJORITY,
        SUPERMAJORITY_QUORUM_REQUIRED
    }

    struct Proposal {
        ProposalType proposalType;
        string description;
        address[] accounts; // member(s) being added/kicked; account(s) receiving payload
        uint256[] amounts; // value(s) to be minted/burned/spent; gov setting [0]
        bytes[] payloads; // data for CALL proposals
        uint256 prevProposal;
        uint256 yesVotes;
        uint256 noVotes;
        uint32 creationTime;
        address proposer;
    }

    struct ProposalState {
        bool passed;
        bool processed;
    }

    /**
     * @dev Throws if called by any account other than the manager.
     */
    modifier onlyManager() {
        require(msg.sender == manager, "Manager: caller is not the manager");
        _;
    }

    /**
     * @dev Throws if called by any account that is not a member.
     */
    modifier memberOnly() {
        require(balanceOf[msg.sender] != 0, "Member: caller is not a member");
        _;
    }

    /*///////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(){
        manager = msg.sender;
    }

    function init(
        string memory name_,
        string memory symbol_,
        string memory docs_,
        //bool paused_,
        address dai_,
        address[] memory extensions_,
        bytes[] memory extensionsData_,
        // address[] calldata voters_,
        // uint256[] calldata shares_,
        uint32[2] memory govSettings_,
        uint32[TYPE_COUNT] memory voteSettings_,
        uint16[TYPE_COUNT] memory votePeriods_
    ) public payable nonReentrant virtual {
        if (extensions_.length != extensionsData_.length) revert NoArrayParity();

        if (supermajority != 0) revert Initialized();

        for (uint i = 0; i < votePeriods_.length; i++){
            if (votePeriods_[i] < 12 hours || votePeriods_[i] > 30 days) revert PeriodBounds();
        }


        if (govSettings_[0] > 100) revert QuorumMax();

        if (govSettings_[1] <= 51 || govSettings_[1] > 100) revert SupermajorityBounds();

        name = name_;
        symbol = symbol_;
        docs = docs_;
        dai = dai_;

        currentState = DaoState.STARTED;

        INITIAL_CHAIN_ID = block.chainid;
        
        INITIAL_DOMAIN_SEPARATOR = _computeDomainSeparator();

        // manager = owner();
        _mint(manager, 5000);
        totalSupply += 5000; // have to do this one off
        // for (uint x = 0; x < voters_.length; x++){
        //     _mint(voters_[x], shares_[x]);
        // }

        if (extensions_.length != 0) {
            // cannot realistically overflow on human timescales
            unchecked {
                for (uint256 i; i < extensions_.length; i++) {
                    extensions[extensions_[i]] = true;

                    if (extensionsData_[i].length > 3) {
                        (bool success, ) = extensions_[i].call(extensionsData_[i]);

                        if (!success) revert InitCallFail();
                    }
                }
            }
        }
        
        // votingPeriod = govSettings_[0];

        // gracePeriod = govSettings_[1];
        
        quorum = govSettings_[0];
        
        supermajority = govSettings_[1];

        for (uint t = 0; t < voteSettings_.length; t++){
            proposalVoteTypes[ProposalType(t)] = VoteType(voteSettings_[t]);
            proposalVotePeriod[ProposalType(t)] = votePeriods_[t];
        }
    }

    /*///////////////////////////////////////////////////////////////
                            PROPOSAL LOGIC
    //////////////////////////////////////////////////////////////*/

    function getProposalArrays(uint256 proposal) public view virtual returns (
        address[] memory accounts, 
        uint256[] memory amounts, 
        bytes[] memory payloads
    ) {
        Proposal storage prop = proposals[proposal];
        
        (accounts, amounts, payloads) = (prop.accounts, prop.amounts, prop.payloads);
    }

    function propose(
        ProposalType proposalType,
        string calldata description,
        address[] calldata accounts,
        uint256[] calldata amounts,
        bytes[] calldata payloads
    ) public payable memberOnly nonReentrant virtual returns (uint256 proposal) {
        if (accounts.length != amounts.length || amounts.length != payloads.length) revert NoArrayParity();
        
        if (proposalType == ProposalType.VPERIOD) if (amounts[1] < 12 hours || amounts[1] > 30 days) revert PeriodBounds();

        if (proposalType == ProposalType.VPERIOD) if (amounts[0] > TYPE_COUNT-1 || amounts.length != 2) revert PeriodBounds();
        
        if (proposalType == ProposalType.QUORUM) if (amounts[0] > 100) revert QuorumMax();
        
        if (proposalType == ProposalType.SUPERMAJORITY) if (amounts[0] <= 51 || amounts[0] > 100) revert SupermajorityBounds();

        if (proposalType == ProposalType.TYPE) if (amounts[0] > TYPE_COUNT-1 || amounts[1] > 3 || amounts.length != 2) revert TypeBounds();

        if (proposalType == ProposalType.MANAGER) if (accounts[0] == address(0)) revert ZeroManager();
        
        if (proposalType == ProposalType.PURCHASE) if (IDAIPermit(dai).balanceOf(address(this)) < amounts[0]) revert InsufficientFunds();

        bool selfSponsor;

        // if member or extension is making proposal, include sponsorship
        if (balanceOf[msg.sender] != 0 || extensions[msg.sender]) selfSponsor = true;

        // cannot realistically overflow on human timescales
        unchecked {
            proposalCount++;
        }

        proposal = proposalCount;

        proposals[proposal] = Proposal({
            proposalType: proposalType,
            description: description,
            accounts: accounts,
            amounts: amounts,
            payloads: payloads,
            prevProposal: selfSponsor ? currentSponsoredProposal : 0,
            yesVotes: 0,
            noVotes: 0,
            creationTime: selfSponsor ? _safeCastTo32(block.timestamp) : 0,
            proposer: msg.sender
        });

        for (uint x = 0; x < members.length; x++){
            weights[proposal][members[x]] = balanceOf[members[x]];
        }

        if (selfSponsor) currentSponsoredProposal = proposal;

        emit NewProposal(msg.sender, proposal, proposalType, description, accounts, amounts, payloads);
    }

    // function cancelProposal(uint256 proposal) public payable nonReentrant virtual {
    //     Proposal storage prop = proposals[proposal];

    //     if (msg.sender != prop.proposer) revert NotProposer();

    //     if (prop.creationTime != 0) revert Sponsored();

    //     delete proposals[proposal];

    //     emit ProposalCancelled(msg.sender, proposal);
    // }

    // function sponsorProposal(uint256 proposal) public payable nonReentrant virtual {
    //     Proposal storage prop = proposals[proposal];

    //     if (balanceOf[msg.sender] == 0) revert NotMember();

    //     if (prop.proposer == address(0)) revert NotCurrentProposal();

    //     if (prop.creationTime != 0) revert Sponsored();

    //     prop.prevProposal = currentSponsoredProposal;

    //     currentSponsoredProposal = proposal;

    //     prop.creationTime = _safeCastTo32(block.timestamp);

    //     emit ProposalSponsored(msg.sender, proposal);
    // } 

    function vote(uint256 proposal, bool approve) public payable nonReentrant virtual {
        _vote(msg.sender, proposal, approve);
    }
    
    function voteBySig(
        address signer, 
        uint256 proposal, 
        bool approve, 
        uint8 v, 
        bytes32 r, 
        bytes32 s
    ) public payable nonReentrant virtual {
        bytes32 digest =
            keccak256(
                abi.encodePacked(
                    '\x19\x01',
                    DOMAIN_SEPARATOR(),
                    keccak256(
                        abi.encode(
                            VOTE_HASH,
                            signer,
                            proposal,
                            approve
                        )
                    )
                )
            );
            
        address recoveredAddress = ecrecover(digest, v, r, s);

        if (recoveredAddress == address(0) || recoveredAddress != signer) revert InvalidSignature();
        
        _vote(signer, proposal, approve);
    }
    
    function _vote(
        address signer, 
        uint256 proposal, 
        bool approve
    ) internal virtual {
        Proposal storage prop = proposals[proposal];

        if (voted[proposal][signer]) revert AlreadyVoted();
        
        // this is safe from overflow because `votingPeriod` is capped so it will not combine
        // with unix time to exceed the max uint256 value
        unchecked {
            if (block.timestamp > prop.creationTime + proposalVotePeriod[prop.proposalType]) revert NotVoteable();
        }

        // we are not doing delegation
        // uint96 weight = getPriorVotes(signer, prop.creationTime);

        uint256 weight = weights[proposal][signer];
        
        // this is safe from overflow because `yesVotes` and `noVotes` are capped by `totalSupply`
        // which is checked for overflow in `KaliDAOtoken` contract
        unchecked { 
            if (approve) {
                prop.yesVotes += weight;
                // lastYesVote[signer] = proposal;
            } else {
                prop.noVotes += weight;
            }
        }
        
        voted[proposal][signer] = true;
        
        emit VoteCast(signer, proposal, approve);
    }

    function processProposal(uint256 proposal) public payable nonReentrant virtual returns (
        bool didProposalPass, bytes[] memory results
    ) {
        Proposal storage prop = proposals[proposal];


        VoteType voteType = proposalVoteTypes[prop.proposalType];

        if (prop.creationTime == 0) revert NotCurrentProposal();

        
        // this is safe from overflow because `votingPeriod` and `gracePeriod` are capped so they will not combine
        // with unix time to exceed the max uint256 value
        unchecked {
            if (block.timestamp <= prop.creationTime + proposalVotePeriod[prop.proposalType]) revert VotingNotEnded();
        }

        // skip previous proposal processing requirement in case of escape hatch
        if (prop.proposalType != ProposalType.ESCAPE) 
            if (proposals[prop.prevProposal].creationTime != 0) revert PrevNotProcessed();

        didProposalPass = _countVotes(voteType, prop.yesVotes, prop.noVotes);

        //emit ProcessEmitter(prop.proposalType, prop.amounts[0], prop.amounts[1], didProposalPass);
        //emit VoteEmitter(voteType, prop.yesVotes, prop.noVotes);
        if (didProposalPass) {
            // cannot realistically overflow on human timescales
            unchecked {
                // if (prop.proposalType == ProposalType.MINT) 
                //     for (uint256 i; i < prop.accounts.length; i++) {
                //         _mint(prop.accounts[i], prop.amounts[i]);
                //     }
                    
                // if (prop.proposalType == ProposalType.BURN) 
                //     for (uint256 i; i < prop.accounts.length; i++) {
                //         _burn(prop.accounts[i], prop.amounts[i]);
                //     }
                    
                if (prop.proposalType == ProposalType.CALL) 
                    for (uint256 i; i < prop.accounts.length; i++) {
                        results = new bytes[](prop.accounts.length);
                        
                        (, bytes memory result) = prop.accounts[i].call{value: prop.amounts[i]}
                            (prop.payloads[i]);
                        
                        results[i] = result;
                    }
                    
                // governance settings
                if (prop.proposalType == ProposalType.VPERIOD)
                    proposalVotePeriod[ProposalType(prop.amounts[0])] = uint16(prop.amounts[1]);
                
                // if (prop.proposalType == ProposalType.GPERIOD) 
                //     if (prop.amounts[0] != 0) gracePeriod = uint32(prop.amounts[0]);
                
                if (prop.proposalType == ProposalType.QUORUM) 
                    if (prop.amounts[0] != 0) quorum = uint32(prop.amounts[0]);
                
                if (prop.proposalType == ProposalType.SUPERMAJORITY) 
                    if (prop.amounts[0] != 0) supermajority = uint32(prop.amounts[0]);
                
                if (prop.proposalType == ProposalType.TYPE) 
                    proposalVoteTypes[ProposalType(prop.amounts[0])] = VoteType(prop.amounts[1]);
                
                // if (prop.proposalType == ProposalType.PAUSE) 
                //     _flipPause();
                
                if (prop.proposalType == ProposalType.EXTENSION) {
                    for (uint256 i; i < prop.accounts.length; i++) {
                        if (prop.amounts[i] == 3){
                            capitalCall = prop.accounts[i];
                            (uint256 _goal, uint256 _period) 
                                = abi.decode(prop.payloads[i], (uint256, uint256));
                            //emit FirstAction(_goal);
                            uint256[] memory memberShare = new uint256[](members.length);
                            for (uint x = 0; x < members.length; x++){
                                //memberShare.push(balanceOf[members[x]]);
                                memberShare[x] = balanceOf[members[x]];
                            }
                            //return(false, new bytes[](prop.accounts.length));
                            //emit SecondAction(_goal);
                            bytes memory newPayload = abi.encode(
                                members,
                                memberShare,
                                _goal,
                                _period,
                                propertyValue,
                                totalSupply
                            );
                            if (prop.payloads[i].length > 0){
                                IKaliDAOextension(prop.accounts[i]).setExtension(newPayload);
                                extensions[prop.accounts[i]] = true;
                            } 
                        }
                        else {
                            if (prop.amounts[i] == 2)
                                crowdFund = prop.accounts[i];
                                emit FirstAction(20);
                            if (prop.amounts[i] == 4)
                                tokenSale = prop.accounts[i];
                            if (prop.payloads[i].length > 0) IKaliDAOextension(prop.accounts[i])
                                .setExtension(prop.payloads[i]);
                        }

                        if (prop.amounts[i] == 0) 
                            extensions[prop.accounts[i]] = false;
                        else
                            extensions[prop.accounts[i]] = true;
                    }
                }
                
                if (prop.proposalType == ProposalType.ESCAPE)
                    delete proposals[prop.amounts[0]];

                if (prop.proposalType == ProposalType.DOCS)
                    docs = prop.description;

                if (prop.proposalType == ProposalType.MANAGER) 
                    manager = prop.accounts[0];

                if (prop.proposalType == ProposalType.PURCHASE){
                    uint funds = IDAIPermit(dai).balanceOf(address(this));
                    if (funds - totalLoot < prop.amounts[0]) revert InsufficientFunds();
                    lootBalanceOf[manager] += prop.amounts[0];
                    totalLoot += prop.amounts[0];
                    
                    // uint funds = IDAIPermit(dai).balanceOf(address(this));
                    // if (funds > prop.amounts[0])
                    //     _distributeLoot(funds - prop.amounts[0], false);
                }

                if (prop.proposalType == ProposalType.DISTRIBUTE){
                    uint funds = IDAIPermit(dai).balanceOf(address(this));
                    if (funds > totalLoot + reservedLoot){
                        _distributeLoot(funds - totalLoot);
                        propertyValue -= funds - totalLoot;
                    }
                }
                
                proposalStates[proposal].passed = true;
            }
        }

        delete proposals[proposal];

        proposalStates[proposal].processed = true;

        emit ProposalProcessed(proposal, didProposalPass);
    }

    function _countVotes(
        VoteType voteType,
        uint256 yesVotes,
        uint256 noVotes
    ) internal view virtual returns (bool didProposalPass) {
        // fail proposal if no participation
        if (yesVotes == 0 && noVotes == 0) return false;

        // rule out any failed quorums
        if (voteType == VoteType.SIMPLE_MAJORITY_QUORUM_REQUIRED || voteType == VoteType.SUPERMAJORITY_QUORUM_REQUIRED) {
            uint256 minVotes = (totalSupply * quorum) / 100;
            
            // this is safe from overflow because `yesVotes` and `noVotes` 
            // supply are checked in `KaliDAOtoken` contract
            unchecked {
                uint256 votes = yesVotes + noVotes;

                if (votes < minVotes) return false;
            }
        }
        
        // simple majority check
        if (voteType == VoteType.SIMPLE_MAJORITY || voteType == VoteType.SIMPLE_MAJORITY_QUORUM_REQUIRED) {
            if (yesVotes > noVotes) return true;
        // supermajority check
        } else {
            // example: 7 yes, 2 no, supermajority = 66
            // ((7+2) * 66) / 100 = 5.94; 7 yes will pass
            uint256 minYes = ((yesVotes + noVotes) * supermajority) / 100;

            if (yesVotes >= minYes) return true;
        }
    }
    
    /*///////////////////////////////////////////////////////////////
                            EXTENSIONS 
    //////////////////////////////////////////////////////////////*/

    receive() external payable virtual {}

    modifier onlyExtension {
        if (!extensions[msg.sender]) revert NotExtension();

        _;
    }

    // function callExtension(
    //     address extension, 
    //     uint256 amount, 
    //     bytes calldata extensionData
    // ) public payable nonReentrant virtual returns (bool mint, uint256 amountOut) {
    //     if (!extensions[extension]) revert NotExtension();
        
    //     (mint, amountOut) = IKaliDAOextension(extension).callExtension{value: msg.value}
    //         (msg.sender, amount, extensionData);
        
    //     if (mint) {
    //         if (amountOut != 0) _mint(msg.sender, amountOut);
    //     }
    // }

    function mintShares(address to, uint256 amount) public payable onlyExtension virtual {
        totalSupply += amount;
        _mint(to, amount);
    }

    function _mint(address to, uint256 amount) internal virtual {
        if (balanceOf[to] == 0){
            members.push(to);
        }

        // cannot overflow because the sum of all user
        // balances can't exceed the max uint256 value
        unchecked {
            balanceOf[to] += amount;
        }

        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal virtual {
        balanceOf[from] -= amount;
        listedShares[from] -= amount;
        
        if (balanceOf[msg.sender] == 0){
            for (uint i = 0; i < members.length; i++){
                if (msg.sender == members[i]){
                    members[i] = members[members.length - 1];
                    members.pop();
                    break;
                }
            }
        }
    }

    function tranferShares(address to, address from, uint32 amount, uint32 pricePerShare) public onlyExtension virtual {
        _burn(from, amount);
        _mint(to, amount);
        if (pricePerShare > 0)
            _adjustPropertyValue(amount, pricePerShare);
    }

    function initPropertyValue(uint _value) public onlyExtension virtual {
        propertyValue = _value;
    }

    function _adjustPropertyValue(uint32 amount, uint32 pricePerShare) internal virtual {
        uint newValue = pricePerShare * totalSupply;

        bool isPos;
        if (newValue > propertyValue){
            isPos = true;
        }

        uint difference;
        if (isPos){
            difference = newValue - propertyValue;
        }
        else {
            difference = propertyValue - newValue;
        }
        uint calcDifference = totalSupply * difference / (30 * amount);
        if (difference > calcDifference){
            difference = calcDifference;
        }
        if (isPos){
            propertyValue += difference;
        }
        else {
            propertyValue -= difference;
        }
    }

    // function burnShares(address from, uint256 amount) public payable onlyExtension virtual {
    //     _burn(from, amount);
    // }

    /*///////////////////////////////////////////////////////////////
                            EXTRANIOUS 
    //////////////////////////////////////////////////////////////*/


    function depositDividend(
        uint256 value,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r, 
        bytes32 s
    ) public onlyManager nonReentrant {
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
        _distributeLoot(value);
        emit DividendDeposit(value);
    }

    function setState(DaoState newState) external onlyManager nonReentrant {
        currentState = newState;
    }

    function _distributeLoot(uint value) internal {
        uint supply = totalSupply;

        if (currentState == DaoState.STARTED){
            supply -= balanceOf[manager];
        }

        for (uint x = 0; x < members.length; x++){
            if (members[x] == manager && currentState == DaoState.STARTED) continue;
            uint addition = (value * balanceOf[members[x]]) / supply;
            lootBalanceOf[members[x]] += addition;
            totalLoot += addition;
        }
    }

    function withdraw(uint256 amount) external nonReentrant{
        if (lootBalanceOf[msg.sender] <= 0 || amount > lootBalanceOf[msg.sender]) revert NoLoot();
        
        lootBalanceOf[msg.sender] -= amount;
        totalLoot -= amount;
        dai._safeTransferFrom(address(this), msg.sender, amount);

        emit Withdraw(msg.sender, amount);
    }

    function contributeLoot(uint256 amount, address fundRaiseContract) external memberOnly nonReentrant{
        if (lootBalanceOf[msg.sender] < amount) revert InsufficientFunds();

        lootBalanceOf[msg.sender] -= amount;
        reservedLoot += amount;
        IFundRaise(fundRaiseContract).contributeLoot(amount, msg.sender);
    }

    function unreserveLoot(uint amount) external onlyExtension nonReentrant{
        totalLoot -= amount;
        reservedLoot -= amount;
    }

    function listShares(uint32 _numShares, uint32 _pricePerShare) external memberOnly nonReentrant {
        if (balanceOf[msg.sender] - listedShares[msg.sender] < _numShares) revert NotEnoughShares();
        if (_pricePerShare == 0) revert ZeroSale();
        
        //balanceOf[msg.sender] -= _numShares;
        listedShares[msg.sender] += _numShares;

        ILandShareTransfer(tokenSale).listShares(_pricePerShare, _numShares, msg.sender);
    }

    function revokeListing(uint32 _listingIndex) external memberOnly nonReentrant {
        ILandShareTransfer(tokenSale).revokeListing(_listingIndex, msg.sender);
    }

    function fillBid(uint _listingIndex, uint32 _numShares) external memberOnly nonReentrant {
        if (balanceOf[msg.sender] - listedShares[msg.sender] < _numShares) revert NotEnoughShares();
        listedShares[msg.sender] += _numShares;
        ILandShareTransfer(tokenSale).fillBid(msg.sender, _listingIndex, _numShares);
    }

    function _safeCastTo32(uint256 x) internal pure virtual returns (uint32) {
        if (x > type(uint32).max) revert Uint32max();

        return uint32(x);
    }

    function DOMAIN_SEPARATOR() public view virtual returns (bytes32) {
        return block.chainid == INITIAL_CHAIN_ID ? INITIAL_DOMAIN_SEPARATOR : _computeDomainSeparator();
    }

    function _computeDomainSeparator() internal view virtual returns (bytes32) {
        return 
            keccak256(
                abi.encode(
                    keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
                    keccak256(bytes(name)),
                    keccak256('1'),
                    block.chainid,
                    address(this)
                )
            );
    }
}
