// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.4;

// import './KaliDAOtoken.sol';
import './utils/Multicall.sol';
// import './utils/NFThelper.sol';
import './utils/ReentrancyGuard.sol';
import './interfaces/IKaliDAOextension.sol';
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Simple gas-optimized Kali DAO core module.
contract LandDAO is Multicall, ReentrancyGuard, Ownable {
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

    event ProposalCancelled(address indexed proposer, uint256 indexed proposal);

    event ProposalSponsored(address indexed sponsor, uint256 indexed proposal);
    
    event VoteCast(address indexed voter, uint256 indexed proposal, bool indexed approve);

    event ProposalProcessed(uint256 indexed proposal, bool indexed didProposalPass);

    /*///////////////////////////////////////////////////////////////
                            ERRORS
    //////////////////////////////////////////////////////////////*/

    error Initialized();

    error PeriodBounds();

    error QuorumMax();

    error SupermajorityBounds();

    error InitCallFail();

    error TypeBounds();

    error NotProposer();

    error Sponsored();

    error NotMember();

    error NotCurrentProposal();

    error AlreadyVoted();

    error NotVoteable();

    error VotingNotEnded();

    error PrevNotProcessed();

    error NotExtension();

    /* FROM KaliDAOToken */
    error NoArrayParity();

    error Uint32max();

    error InvalidSignature();

    /*///////////////////////////////////////////////////////////////
                            DAO STORAGE
    //////////////////////////////////////////////////////////////*/

    string public docs;

    uint256 private currentSponsoredProposal;
    
    uint256 public proposalCount;

    uint32 public votingPeriod;

    // uint32 public gracePeriod;

    uint32 public quorum; // 1-100

    uint32 public supermajority; // 1-100
    
    bytes32 public constant VOTE_HASH = 
        keccak256('SignVote(address signer,uint256 proposal,bool approve)');

    uint256 internal INITIAL_CHAIN_ID;

    bytes32 internal INITIAL_DOMAIN_SEPARATOR;

    address public manager;  // user that gets funds for real world activity
    address public notary;  // lawyer that ensures proper release of funds to manager
    
    uint8 public constant decimals = 18; /*unit scaling factor in erc20 `shares` accounting - '18' is default to match ETH & common erc20s*/
    string public name; /*'name' for erc20 `shares` accounting*/
    string public symbol; /*'symbol' for erc20 `shares` accounting*/

    mapping(address => uint256) public balanceOf; /*maps `members` accounts to `shares` with erc20 accounting*/
    mapping(address => uint256) public lootBalanceOf; /*maps `members` accounts to `shares` with erc20 accounting*/
    uint96 public totalLoot; /*counter for total `loot` economic weight held by `members`*/
    uint256 public totalSupply; /*counter for total `members` voting `shares` with erc20 accounting*/
    address[] public members; /* needed to iterate the member list */

    uint96 public daoValue; /* Used for capital calls to ensure fairness in minting new shares */

    uint96 public propertyValue; /*the value of the property that is used to assess capital call raises*/

    mapping(address => bool) public extensions;

    mapping(uint256 => Proposal) public proposals;

    mapping(uint256 => ProposalState) public proposalStates;

    mapping(ProposalType => VoteType) public proposalVoteTypes;

    mapping(ProposalType => uint16) public proposalVotePeriod;
    
    mapping(uint256 => mapping(address => bool)) public voted;

    mapping(uint256 => mapping(address => uint256)) public weights;

    // mapping(address => uint256) public lastYesVote;

    enum ProposalType {
        // MINT, // add membership
        // BURN, // revoke membership
        CALL, // call contracts
        VPERIOD, // set `votingPeriod`
        // GPERIOD, // set `gracePeriod`
        QUORUM, // set `quorum`
        SUPERMAJORITY, // set `supermajority`
        TYPE, // set `VoteType` to `ProposalType`
        PAUSE, // flip membership transferability
        EXTENSION, // flip `extensions` whitelisting
        ESCAPE, // delete pending proposal in case of revert
        DOCS, // amend org docs
        CAPITALCALL, // specific proposal to raise capital for expense
        SELL, // call for manager to sell property
        PURCHASE, // call to place funds in escrow for manager to use
        MANAGER // call to set a new manager for property
    }

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

    /*///////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function init(
        string memory name_,
        string memory symbol_,
        string memory docs_,
        //bool paused_,
        address[] memory extensions_,
        bytes[] memory extensionsData_,
        // address[] calldata voters_,
        // uint256[] calldata shares_,
        uint32[3] memory govSettings_,
        uint32[13] memory voteSettings_,
        uint16[13] memory votePeriods_
    ) public payable nonReentrant virtual {
        if (extensions_.length != extensionsData_.length) revert NoArrayParity();

        // if (voters_.length != shares_.length) revert NoArrayParity();

        if (votingPeriod != 0) revert Initialized();

        if (govSettings_[0] == 0 || govSettings_[0] > 365 days) revert PeriodBounds();

        // if (govSettings_[1] > 365 days) revert PeriodBounds();

        if (govSettings_[1] > 100) revert QuorumMax();

        if (govSettings_[2] <= 51 || govSettings_[2] > 100) revert SupermajorityBounds();

        name = name_;
        symbol = symbol_;
        docs = docs_;

        INITIAL_CHAIN_ID = block.chainid;
        
        INITIAL_DOMAIN_SEPARATOR = _computeDomainSeparator();

        manager = owner();
        _mint(manager, 5000);
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
        
        votingPeriod = govSettings_[0];

        // gracePeriod = govSettings_[1];
        
        quorum = govSettings_[1];
        
        supermajority = govSettings_[2];

        // set initial vote types
        // proposalVoteTypes[ProposalType.MINT] = VoteType(voteSettings_[4]);

        // proposalVoteTypes[ProposalType.BURN] = VoteType(voteSettings_[5]);

        proposalVoteTypes[ProposalType.CALL] = VoteType(voteSettings_[0]);

        proposalVoteTypes[ProposalType.VPERIOD] = VoteType(voteSettings_[1]);

        // proposalVoteTypes[ProposalType.GPERIOD] = VoteType(voteSettings_[8]);
        
        proposalVoteTypes[ProposalType.QUORUM] = VoteType(voteSettings_[2]);
        
        proposalVoteTypes[ProposalType.SUPERMAJORITY] = VoteType(voteSettings_[3]);

        proposalVoteTypes[ProposalType.TYPE] = VoteType(voteSettings_[4]);
        
        proposalVoteTypes[ProposalType.PAUSE] = VoteType(voteSettings_[5]);
        
        proposalVoteTypes[ProposalType.EXTENSION] = VoteType(voteSettings_[6]);

        proposalVoteTypes[ProposalType.ESCAPE] = VoteType(voteSettings_[7]);

        proposalVoteTypes[ProposalType.DOCS] = VoteType(voteSettings_[8]);

        proposalVoteTypes[ProposalType.CAPITALCALL] = VoteType(voteSettings_[9]);

        proposalVoteTypes[ProposalType.SELL] = VoteType(voteSettings_[10]);

        proposalVoteTypes[ProposalType.PURCHASE] = VoteType(voteSettings_[11]);

        proposalVoteTypes[ProposalType.MANAGER] = VoteType(voteSettings_[12]);
        
        proposalVotePeriod[ProposalType.CALL] = votePeriods_[0];
        proposalVotePeriod[ProposalType.VPERIOD] = votePeriods_[1];
        proposalVotePeriod[ProposalType.QUORUM] = votePeriods_[2];
        proposalVotePeriod[ProposalType.SUPERMAJORITY] = votePeriods_[3];
        proposalVotePeriod[ProposalType.TYPE] = votePeriods_[4];
        proposalVotePeriod[ProposalType.PAUSE] = votePeriods_[5];
        proposalVotePeriod[ProposalType.EXTENSION] = votePeriods_[6];
        proposalVotePeriod[ProposalType.ESCAPE] = votePeriods_[7];
        proposalVotePeriod[ProposalType.DOCS] = votePeriods_[8];
        proposalVotePeriod[ProposalType.CAPITALCALL] = votePeriods_[9];
        proposalVotePeriod[ProposalType.SELL] = votePeriods_[10];
        proposalVotePeriod[ProposalType.PURCHASE] = votePeriods_[11];
        proposalVotePeriod[ProposalType.MANAGER] = votePeriods_[12];
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
    ) public payable nonReentrant virtual returns (uint256 proposal) {
        if (accounts.length != amounts.length || amounts.length != payloads.length) revert NoArrayParity();
        
        if (proposalType == ProposalType.VPERIOD) if (amounts[0] == 0 || amounts[0] > 365 days) revert PeriodBounds();

        //if (proposalType == ProposalType.GPERIOD) if (amounts[0] > 365 days) revert PeriodBounds();
        
        if (proposalType == ProposalType.QUORUM) if (amounts[0] > 100) revert QuorumMax();
        
        if (proposalType == ProposalType.SUPERMAJORITY) if (amounts[0] <= 51 || amounts[0] > 100) revert SupermajorityBounds();

        if (proposalType == ProposalType.TYPE) if (amounts[0] > 11 || amounts[1] > 3 || amounts.length != 2) revert TypeBounds();

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

    function cancelProposal(uint256 proposal) public payable nonReentrant virtual {
        Proposal storage prop = proposals[proposal];

        if (msg.sender != prop.proposer) revert NotProposer();

        if (prop.creationTime != 0) revert Sponsored();

        delete proposals[proposal];

        emit ProposalCancelled(msg.sender, proposal);
    }

    function sponsorProposal(uint256 proposal) public payable nonReentrant virtual {
        Proposal storage prop = proposals[proposal];

        if (balanceOf[msg.sender] == 0) revert NotMember();

        if (prop.proposer == address(0)) revert NotCurrentProposal();

        if (prop.creationTime != 0) revert Sponsored();

        prop.prevProposal = currentSponsoredProposal;

        currentSponsoredProposal = proposal;

        prop.creationTime = _safeCastTo32(block.timestamp);

        emit ProposalSponsored(msg.sender, proposal);
    } 

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
            if (block.timestamp > prop.creationTime + votingPeriod) revert NotVoteable();
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
                
                if (prop.proposalType == ProposalType.EXTENSION) 
                    for (uint256 i; i < prop.accounts.length; i++) {
                        if (prop.amounts[i] != 0) 
                            extensions[prop.accounts[i]] = !extensions[prop.accounts[i]];
                    
                        if (prop.payloads[i].length > 3) IKaliDAOextension(prop.accounts[i])
                            .setExtension(prop.payloads[i]);
                    }
                
                if (prop.proposalType == ProposalType.ESCAPE)
                    delete proposals[prop.amounts[0]];

                if (prop.proposalType == ProposalType.DOCS)
                    docs = prop.description;
                
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

    function callExtension(
        address extension, 
        uint256 amount, 
        bytes calldata extensionData
    ) public payable nonReentrant virtual returns (bool mint, uint256 amountOut) {
        if (!extensions[extension]) revert NotExtension();
        
        (mint, amountOut) = IKaliDAOextension(extension).callExtension{value: msg.value}
            (msg.sender, amount, extensionData);
        
        if (mint) {
            if (amountOut != 0) _mint(msg.sender, amountOut);
        }
    }

    function mintShares(address to, uint256 amount) public payable onlyExtension virtual {
        _mint(to, amount);
    }

    function _mint(address to, uint256 amount) internal virtual {
        totalSupply += amount;

        // cannot overflow because the sum of all user
        // balances can't exceed the max uint256 value
        unchecked {
            balanceOf[to] += amount;
        }

        emit Transfer(address(0), to, amount);
    }

    // function burnShares(address from, uint256 amount) public payable onlyExtension virtual {
    //     _burn(from, amount);
    // }

    /*///////////////////////////////////////////////////////////////
                            EXTRANIOUS 
    //////////////////////////////////////////////////////////////*/

    function depositDividend(uint _dividend) public onlyManager returns(bool) {
        
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
