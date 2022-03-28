const { BigNumber } = require("ethers")
const chai = require("chai")
const { expect } = require("chai")
const { ethers } = require("hardhat")
const { signDaiPermit } = require("eth-permit");

const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"



chai.should()

// Defaults to e18 using amount * 10^18
function getBigNumber(amount, decimals = 18) {
  return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals))
}

async function mine(blocks){
  await ethers.provider.send("evm_mine", [blocks])
}

async function advanceTime(time) {
  await ethers.provider.send("evm_increaseTime", [time])
}

const ProposalType = {
  'CALL': 0, // call contracts
  'VPERIOD': 1, // set `votingPeriod`
  'QUORUM': 2, // set `quorum`
  'SUPERMAJORITY': 3, // set `supermajority`
  'TYPE': 4, // set `VoteType` to `ProposalType`
  // 'PAUSE': 5, // flip membership transferability
  'EXTENSION': 5, // flip `extensions` whitelisting
  'ESCAPE': 6, // delete pending proposal in case of revert
  'DOCS': 7, // amend org docs
  'CAPITALCALL': 8, // specific proposal to raise capital for expense
  'TOKENSALE': 9,
  'SELL': 10, // call for manager to sell property
  'PURCHASE': 11, // call to place funds in escrow for manager to use
  'MANAGER': 12, // call to set a new manager for property
  'DISTRIBUTE': 13 // call to divide the spoils and exit the property typically when the property could not be purchased
}

const numProposals = Object.keys(ProposalType).length
const minVoteTime = 12 * 60 * 60
const maxVoteTime = 30 * 24 * 60 * 60

describe("LandDAO", function () {
  let Land // LandDAO contract
  let land // LandDAO contract instance
  let proposer // signerA
  let alice // signerB
  let bob // signerC

  beforeEach(async () => {
    ;[proposer, alice, bob] = await ethers.getSigners()

    Land = await ethers.getContractFactory("LandDAO")
    land = await Land.deploy()
    await land.deployed()
    Dai = await ethers.getContractFactory("KaliERC20")
    dai = await Dai.deploy()
    await dai.deployed()
    // console.log(land.address)
    // console.log("alice eth balance", await alice.getBalance())
    // console.log("bob eth balance", await bob.getBalance())
    
  })

  it("Should initialize with correct params", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1),
      Array(numProposals).fill(minVoteTime)
    )
    expect(await land.name()).to.equal("KALI")
    expect(await land.symbol()).to.equal("KALI")
    expect(await land.docs()).to.equal("DOCS")
    expect(await land.balanceOf(proposer.address)).to.equal(getBigNumber(5000, 0))
    expect(await land.quorum()).to.equal(0)
    expect(await land.supermajority()).to.equal(60)
    for (i = 0; i < numProposals; i++){
      expect(await land.proposalVoteTypes(i)).to.equal(1)
      expect(await land.proposalVotePeriod(i)).to.equal(minVoteTime)
    }
  })
  it("Should revert if initialization governance exceed or underflow bounds", async function () {
    // too many items in array
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [30, 0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
    // not enough items in array
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
  })
  it("Should revert if initialization vote type settings exceed or underflow bounds", async function () {
    // too few vote types
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals-1).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
    // too many vote types
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      [...Array(numProposals).fill(1), 1], // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
    // vote type out of bounds
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      [...Array(numProposals-1).fill(1), 9], // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
  })
  it("Should revert if initialization vote length settings exceed or underflow bounds", async function () {
    // too few vote times
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals-1).fill(minVoteTime) // vote time
    ).should.be.reverted)
    // too many vote times
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals+1).fill(minVoteTime) // vote time
    ).should.be.reverted)
  })
  it("Should revert if initialization arrays don't match", async function () {
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [bob.address], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
  })
  it("Should revert if already initialized", async function () {
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ))
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
  })
  it("Should revert if voting period is initialized null or longer than 30 days", async function () {
    // vote time too low
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      [...Array(numProposals-1).fill(minVoteTime), minVoteTime-1] // vote time
    ).should.be.reverted)
    // vote time exceed bounds
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      [...Array(numProposals-1).fill(minVoteTime), maxVoteTime+1] // vote time
    ).should.be.reverted)
  })
  it("Should revert if quorum is initialized greater than 100", async function () {
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [101, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
  })
  it("Should revert if supermajority is initialized less than 52 or greater than 100", async function () {
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 51], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 101], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    ).should.be.reverted)
  })
  it("Should revert if proposal arrays don't match", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    expect(await land.propose(
      0,
      "TEST",
      [bob.address, alice.address],
      [getBigNumber(1000)],
      [0x00]
    ).should.be.reverted)
  })
  it("Should revert if voting period proposal is for null or longer than 30 days", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    // normal
    await land.propose(
      ProposalType['VPERIOD'],
      "TEST",
      [bob.address, bob.address],
      [3, minVoteTime],
      [0x00, 0x00]
    )
    expect(await land.propose(
      ProposalType['VPERIOD'],
      "TEST",
      [bob.address, bob.address],
      [3, minVoteTime - 1],
      [0x00, 0x00]
    ).should.be.reverted)
    expect(await land.propose(
      ProposalType['VPERIOD'],
      "TEST",
      [bob.address, bob.address],
      [3, maxVoteTime + 1],
      [0x00, 0x00]
    ).should.be.reverted)
    // setting for proposal out of bounds
    expect(await land.propose(
      ProposalType['VPERIOD'],
      "TEST",
      [bob.address, bob.address],
      [numProposals, minVoteTime],
      [0x00, 0x00]
    ).should.be.reverted)
    // extra value in array
    expect(await land.propose(
      ProposalType['VPERIOD'],
      "TEST",
      [proposer.address, bob.address, alice.address],
      [3, minVoteTime, 10],
      [0x00, 0x00, 0x00]
    ).should.be.reverted)
  })
  it("Should revert if quorum proposal is for greater than 100", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    // normal
    await land.propose(
      ProposalType['QUORUM'],
      "TEST",
      [bob.address],
      [20],
      [0x00]
    )
    expect(await land.propose(
      ProposalType['QUORUM'],
      "TEST",
      [bob.address],
      [101],
      [0x00]
    ).should.be.reverted)
  })
  it("Should revert if supermajority proposal is for less than 52 or greater than 100", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    // normal
    await land.propose(
      ProposalType['SUPERMAJORITY'],
      "TEST",
      [bob.address],
      [60],
      [0x00]
    )
    expect(await land.propose(
      ProposalType['SUPERMAJORITY'],
      "TEST",
      [bob.address],
      [51],
      [0x00]
    ).should.be.reverted)
    expect(await land.propose(
      ProposalType['SUPERMAJORITY'],
      "TEST",
      [bob.address],
      [101],
      [0x00]
    ).should.be.reverted)
  })
  it("Should revert if type proposal has proposal type greater than 12, vote type greater than 3, or setting length isn't 2", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    // normal
    await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [0, 1],
      [0x00, 0x00]
    )
    expect(await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [numProposals, 2],
      [0x00, 0x00]
    ).should.be.reverted)
    expect(await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [0, 5],
      [0x00, 0x00]
    ).should.be.reverted)
    expect(await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [proposer.address, bob.address, alice.address],
      [0, 1, 0],
      [0x00, 0x00, 0x00]
    ).should.be.reverted)
  })
  // it("Should allow proposer to cancel unsponsored proposal", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // ]quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   await land.connect(alice).propose(
  //     ProposalType['TYPE'],
  //     "TEST",
  //     [bob.address, alice.address],
  //     [0, 1],
  //     [0x00, 0x00]
  //   )
  //   await land.connect(alice).cancelProposal(1)

  //   //TODO: How do we know this proposal was actually cancelled?
  // })
  // it("Should forbid non-proposer from cancelling unsponsored proposal", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // ]quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   await land.connect(alice).propose(
  //     ProposalType['TYPE'],
  //     "TEST",
  //     [bob.address, alice.address],
  //     [0, 1],
  //     [0x00, 0x00]
  //   )
  //   expect(await land.cancelProposal(0).should.be.reverted)
  // })
  // it("Should forbid proposer from cancelling sponsored proposal", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // ]quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   await land.connect(alice).propose(
  //     ProposalType['TYPE'],
  //     "TEST",
  //     [bob.address, alice.address],
  //     [0, 1],
  //     [0x00, 0x00]
  //   )
  //   await land.sponsorProposal(1)
  //   expect(await land.connect(alice).cancelProposal(1).should.be.reverted)
  // })
  // it("Should forbid cancelling non-existent proposal", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // ]quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   await land.connect(alice).propose(
  //     ProposalType['TYPE'],
  //     "TEST",
  //     [bob.address, alice.address],
  //     [0, 1],
  //     [0x00, 0x00]
  //   )
  //   expect(await land.connect(alice).cancelProposal(10).should.be.reverted)
  // })
  // it("Should allow sponsoring proposal and processing", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   expect(await land.proposalVoteTypes(0)).to.equal(1)
  //   await land.connect(alice).propose(
  //     ProposalType['TYPE'],
  //     "TEST",
  //     [bob.address, alice.address],
  //     [0, 2],
  //     [0x00, 0x00]
  //   )
  //   expect(await land.weights(1, proposer.address)).to.equal(5000)
  //   await land.sponsorProposal(1)
  //   await land.vote(1, true)
  //   await advanceTime(minVoteTime + 1)
  //   expect(await land.voted(1, proposer.address)).to.be.true
  //   await land.processProposal(1)
  //   //await expect(land.processProposal(1)).to.emit(land, "VoteEmitter").withArgs(1, 5000, 0)
  //   // await expect(land.processProposal(1)).to.emit(land, "ProcessEmitter").withArgs(ProposalType['TYPE'], 0, 2, true)
  //   expect(await land.proposalVoteTypes(0)).to.equal(2)
  // })
  // it("Should forbid non-member from sponsoring proposal", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   await land.connect(alice).propose(
  //     ProposalType['TYPE'],
  //     "TEST",
  //     [bob.address, alice.address],
  //     [0, 2],
  //     [0x00, 0x00]
  //   )
  //   expect(await land.connect(alice).sponsorProposal(1).should.be.reverted)
  // })
  // it("Should forbid sponsoring non-existent or processed proposal", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   await land.connect(alice).propose(
  //     ProposalType['TYPE'],
  //     "TEST",
  //     [bob.address, alice.address],
  //     [0, 2],
  //     [0x00, 0x00]
  //   )
  //   await land.sponsorProposal(1)
  //   await land.vote(1, true)
  //   await advanceTime(minVoteTime + 1)
  //   await land.processProposal(1)
  //   expect(await land.proposalVoteTypes(0)).to.equal(2)
  //   expect(await land.sponsorProposal(1).should.be.reverted)
  //   expect(await land.sponsorProposal(100).should.be.reverted)
  // })
  // it("Should forbid sponsoring an already sponsored proposal", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   await land.connect(alice).propose(
  //     ProposalType['TYPE'],
  //     "TEST",
  //     [bob.address, alice.address],
  //     [0, 2],
  //     [0x00, 0x00]
  //   )
  //   await land.sponsorProposal(1)
  //   expect(await land.sponsorProposal(1).should.be.reverted)
  // })
  it("Should allow self-sponsorship by a member", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [0, 2],
      [0x00, 0x00]
    )
    await land.vote(1, true)
  })
  it("Should forbid a member from voting again on proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [0, 2],
      [0x00, 0x00]
    )
    await land.vote(1, true)
    expect(await land.vote(1, true).should.be.reverted)
  })
  it("Should forbid voting after period ends", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [0, 2],
      [0x00, 0x00]
    )
    await advanceTime(minVoteTime + 1)
    expect(await land.vote(1, true).should.be.reverted)
  })
  it("Should forbid processing before voting period ends", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [0, 2],
      [0x00, 0x00]
    )
    await land.vote(1, true)
    await advanceTime(7000)
    expect(await land.processProposal(1).should.be.reverted)
  })
  it("voteBySig should revert if the signature is invalid", async () => {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [0, 2],
      [0x00, 0x00]
    )
    const rs = ethers.utils.formatBytes32String("rs")
    expect(
      land.voteBySig(proposer.address, 0, true, 0, rs, rs).should.be.reverted
    )
  })
  it("Should process membership proposal via voteBySig", async () => {
    const domain = {
      name: "KALI",
      version: "1",
      chainId: 31337,
      verifyingContract: land.address,
    }
    const types = {
      SignVote: [
        { name: "signer", type: "address" },
        { name: "proposal", type: "uint256" },
        { name: "approve", type: "bool" },
      ],
    }
    const value = {
      signer: proposer.address,
      proposal: 1,
      approve: true,
    }

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(
      ProposalType['TYPE'],
      "TEST",
      [bob.address, alice.address],
      [0, 2],
      [0x00, 0x00]
    )

    const signature = await proposer._signTypedData(domain, types, value)
    const { r, s, v } = ethers.utils.splitSignature(signature)

    await land.voteBySig(proposer.address, 1, true, v, r, s)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.proposalVoteTypes(0)).to.equal(2)
  })
  it("Should process contract call proposal - Single", async function () {
    let LandERC20 = await ethers.getContractFactory("KaliERC20")
    let landERC20 = await LandERC20.deploy()
    await landERC20.deployed()
    await landERC20.init(
      "KALI",
      "KALI",
      "DOCS",
      [land.address],
      [getBigNumber(100)],
      false,
      land.address
    )
    let payload = landERC20.interface.encodeFunctionData("transfer", [
      alice.address,
      getBigNumber(15)
    ])
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    expect(await landERC20.balanceOf(alice.address)).to.equal(getBigNumber(0))
    await land.propose(ProposalType["CALL"], "TEST", [landERC20.address], [0], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await landERC20.totalSupply()).to.equal(getBigNumber(100))
    expect(await landERC20.balanceOf(alice.address)).to.equal(getBigNumber(15))
  })
  it("Should process contract call proposal - Multiple", async function () {
    // Send Eth to Land
    proposer.sendTransaction({
      to: land.address,
      value: getBigNumber(10),
    })
    // Instantiate 1st contract
    let LandERC20 = await ethers.getContractFactory("KaliERC20")
    let landERC20 = await LandERC20.deploy()
    await landERC20.deployed()
    await landERC20.init(
      "KALI",
      "KALI",
      "DOCS",
      [land.address],
      [getBigNumber(100)],
      false,
      land.address
    )
    let payload = landERC20.interface.encodeFunctionData("transfer", [
      alice.address,
      getBigNumber(15)
    ])
    // Instantiate 2nd contract
    let DropETH = await ethers.getContractFactory("DropETH")
    let dropETH = await DropETH.deploy()
    await dropETH.deployed()
    let payload2 = dropETH.interface.encodeFunctionData("dropETH", [
      [alice.address, bob.address],
      "hello",
    ])
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(
      ProposalType["CALL"],
      "TEST",
      [landERC20.address, dropETH.address],
      [0, getBigNumber(4)],
      [payload, payload2]
    )
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await landERC20.totalSupply()).to.equal(getBigNumber(100))
    expect(await landERC20.balanceOf(alice.address)).to.equal(getBigNumber(15))
    expect(await dropETH.amount()).to.equal(getBigNumber(2))
    expect(await dropETH.recipients(1)).to.equal(bob.address)
  })
  it("Should process voting period proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    expect(await land.proposalVotePeriod(0)).to.equal(minVoteTime)
    await land.propose(ProposalType["VPERIOD"], "TEST", [proposer.address, alice.address], [0, minVoteTime + 50], [0x00, 0x00])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.proposalVotePeriod(0)).to.equal(minVoteTime + 50)
  })
  it("Should process quorum proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    expect(await land.quorum()).to.equal(0)
    await land.propose(ProposalType["QUORUM"], "TEST", [proposer.address], [100], [0x00])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.quorum()).to.equal(100)
  })
  it("Should process supermajority proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    expect(await land.supermajority()).to.equal(60)
    await land.propose(ProposalType["SUPERMAJORITY"], "TEST", [proposer.address], [52], [0x00])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.supermajority()).to.equal(52)
  })
  it("Should process type proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(
      ProposalType["TYPE"],
      "TEST",
      [proposer.address, proposer.address],
      [5, 0],
      [0x00, 0x00]
    )
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.proposalVoteTypes(5)).to.equal(0)
  })
  it("Should process extension proposal - General", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(ProposalType["EXTENSION"], "TEST", [wethAddress], [0], [0x00])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.extensions(wethAddress)).to.equal(false)
  })
  it("Should toggle extension proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(ProposalType["EXTENSION"], "TEST", [wethAddress], [1], [0x00])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.extensions(wethAddress)).to.equal(true)
  })
  // it("Should process extension proposal - LandDAOcrowdsale with ETH", async function () {
  //   // Instantiate LandDAO
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [proposer.address],
  //     [getBigNumber(1)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   // Instantiate LandWhiteListManager
  //   let LandWhitelistManager = await ethers.getContractFactory(
  //     "LandAccessManager"
  //   )
  //   let landWhitelistManager = await LandWhitelistManager.deploy()
  //   await landWhitelistManager.deployed()
  //   // Instantiate extension contract
  //   let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
  //   let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
  //     landWhitelistManager.address,
  //     wethAddress
  //   )
  //   await landDAOcrowdsale.deployed()
  //   // Set up whitelist
  //   await landWhitelistManager.createList(
  //     [alice.address],
  //     "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
  //   )
  //   // Set up payload for extension proposal
  //   let payload = ethers.utils.defaultAbiCoder.encode(
  //     ["uint256", "address", "uint8", "uint96", "uint32", "string"],
  //     [
  //       1,
  //       "0x0000000000000000000000000000000000000000",
  //       2,
  //       getBigNumber(100),
  //       1672174799,
  //       "DOCS"
  //     ]
  //   )
  //   await land.propose(9, "TEST", [landDAOcrowdsale.address], [1], [payload])
  //   await land.vote(1, true)
  //   await advanceTime(35)
  //   await land.processProposal(1)
  //   await landDAOcrowdsale 
  //     .connect(alice)
  //     .callExtension(land.address, getBigNumber(50), {
  //       value: getBigNumber(50),
  //     })
  //   expect(await ethers.provider.getBalance(land.address)).to.equal(
  //     getBigNumber(50)
  //   )
  //   expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(100))
  // }

  it("Should process extension proposal - LandDAOcrowdsale with DAI", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("Dai")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address],
      [getBigNumber(1000), getBigNumber(1000)]
    )
    
    // Instantiate LandDAO
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    // Instantiate LandWhiteListManager
    let LandWhitelistManager = await ethers.getContractFactory(
      "KaliAccessManager"
    )
    let landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      wethAddress,
      purchaseToken.address
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint96", "uint256"],
      [purchaseToken.address, getBigNumber(1000), getBigNumber(100)]
    )
    expect(await landDAOcrowdsale.goal()).to.equal(getBigNumber(0))
    expect(await landDAOcrowdsale.fundingERC20()).to.equal("0x0000000000000000000000000000000000000000")
    expect(await landDAOcrowdsale.purchaseLimit()).to.equal(getBigNumber(0))
    expect(await landDAOcrowdsale.totalFunds()).to.equal(getBigNumber(0))
    
    await land.propose(ProposalType["EXTENSION"], "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)

    expect(await landDAOcrowdsale.goal()).to.equal(getBigNumber(100))
    expect(await landDAOcrowdsale.fundingERC20()).to.equal(purchaseToken.address)
    expect(await landDAOcrowdsale.dai()).to.equal(purchaseToken.address)
    expect(await landDAOcrowdsale.purchaseLimit()).to.equal(getBigNumber(1000))
    expect(await landDAOcrowdsale.totalFunds()).to.equal(getBigNumber(0))

    const result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address);

    // transResp = await purchaseToken.connect(alice).permit(alice.address, landDAOcrowdsale.address, result.nonce, result.expiry, true, result.v, result.r, result.s)
    // transReceipt = await transResp.wait()
    // console.log(transReceipt.events)

    //  await expect(land.processProposal(1)).to.emit(land, "ProcessEmitter").withArgs(ProposalType['TYPE'], 0, 2, true)
    
    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s)
    //  .to.emit(purchaseToken, 'PermitFired').withArgs(alice.address, landDAOcrowdsale.address, getBigNumber(result.nonce), getBigNumber(result.expiry), true, result.v, result.r, result.s, result.s)
    
    expect(await landDAOcrowdsale.members(0)).to.equal(alice.address)
    expect(await landDAOcrowdsale.totalFunds()).to.equal(getBigNumber(100))
    expect(await landDAOcrowdsale.complete()).to.be.true
    
    await landDAOcrowdsale.callExtension()
    
    expect(await purchaseToken.balanceOf(land.address)).to.equal(
      getBigNumber(100)
    )
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(95000, 0))
  })
  it("Should process escape proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(ProposalType["QUORUM"], "TEST", [proposer.address], [100], [0x00])
    await land.vote(1, true)
    await land.propose(ProposalType["QUORUM"], "TEST", [proposer.address], [75], [0x00])
    await land.vote(2, true)
    await land.propose(ProposalType["ESCAPE"], "TEST", [proposer.address], [2], [0x00])
    await land.vote(3, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(3)

    expect(await land.processProposal(2).should.be.reverted)
    await land.processProposal(1)

    expect(await land.quorum()).to.equal(100)
    // Proposal #1 remains intact
    // console.log(await land.proposals(0))
    // Proposal #2 deleted
    // console.log(await land.proposals(1))
  })
  it("Should process docs proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(ProposalType["DOCS"], "TEST", [], [], [])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.docs()).to.equal("TEST")
  })
  // Process LandDAO introduced proposals
  //
  //
  it("Should process manager proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(ProposalType["MANAGER"], "TEST", [alice.address], [0], [0x00])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.manager()).to.equal(alice.address)
  })
  it("Should not allow a zero address manager", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )

    expect(await land.propose(ProposalType["MANAGER"], "TEST", [0x0], [0], [0x00]).should.be.reverted)
  })
  it("Should process PURCHASE proposal by moving funds to manager account", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("Dai")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address],
      [getBigNumber(1000), getBigNumber(1000)]
    )
    
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      purchaseToken.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )

    // Instantiate LandWhiteListManager
    let LandWhitelistManager = await ethers.getContractFactory(
      "KaliAccessManager"
    )
    let landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      wethAddress,
      purchaseToken.address
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint96", "uint256"],
      [purchaseToken.address, getBigNumber(1000), getBigNumber(100)]
    )

    await land.propose(ProposalType["EXTENSION"], "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)

    const result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address);

    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s)
    
    expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(0))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(100))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(900))

    await landDAOcrowdsale.callExtension()
    // funding and minting are now complete
    // now we make sure it can be purchased

    expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(100))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))

    await land.propose(ProposalType["PURCHASE"], "TEST", [alice.address], [getBigNumber(90)], [0x00])
    await land.vote(2, true)
    await land.connect(alice).vote(2, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(2)
    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(90))
    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(0))
  })
  it("Should process DISTRIBUTE proposal before state change", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("Dai")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address],
      [getBigNumber(1000), getBigNumber(1000)]
    )
    
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      purchaseToken.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )

    // Instantiate LandWhiteListManager
    let LandWhitelistManager = await ethers.getContractFactory(
      "KaliAccessManager"
    )
    let landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      wethAddress,
      purchaseToken.address
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint96", "uint256"],
      [purchaseToken.address, getBigNumber(1000), getBigNumber(100)]
    )

    await land.propose(ProposalType["EXTENSION"], "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)

    const result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address);

    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s)
    
    await landDAOcrowdsale.callExtension()
    // funding and minting are now complete
    // now we make sure it can be purchased

    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(0))
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(95000, 0))

    await land.propose(ProposalType["DISTRIBUTE"], "TEST", [], [], [])

    await land.vote(2, true)
    await land.connect(alice).vote(2, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(2)
    expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(100))
    expect(await land.totalLoot()).to.equal(getBigNumber(100))
    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(100))
    
  })

  it("Should process DISTRIBUTE proposal after the state change", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("Dai")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address],
      [getBigNumber(1000), getBigNumber(1000)]
    )
    
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      purchaseToken.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )

    // Instantiate LandWhiteListManager
    let LandWhitelistManager = await ethers.getContractFactory(
      "KaliAccessManager"
    )
    let landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      wethAddress,
      purchaseToken.address
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint96", "uint256"],
      [purchaseToken.address, getBigNumber(1000), getBigNumber(100)]
    )

    await land.propose(ProposalType["EXTENSION"], "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)

    const result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address);

    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s)
    
    await landDAOcrowdsale.callExtension()
    // funding and minting are now complete
    // now we make sure it can be purchased

    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(0))

    await land.setState(1)

    await land.propose(ProposalType["DISTRIBUTE"], "TEST", [], [], [])

    await land.vote(2, true)
    await land.connect(alice).vote(2, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(2)

    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(95))
    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(5))
    
  })

  it("Only manager can set the state", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("Dai")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address],
      [getBigNumber(1000), getBigNumber(1000)]
    )
    
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      purchaseToken.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )

    await land.setState(1)

    expect(await land.connect(alice).setState(2).should.be.reverted)
  })

  // Test deposit dividend and withdraw
  it("Deposit dividend before and after state change", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("Dai")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address],
      [getBigNumber(1000), getBigNumber(10000)]
    )
    
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      purchaseToken.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )

    // Instantiate LandWhiteListManager
    let LandWhitelistManager = await ethers.getContractFactory(
      "KaliAccessManager"
    )
    let landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      wethAddress,
      purchaseToken.address
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint96", "uint256"],
      [purchaseToken.address, getBigNumber(1000), getBigNumber(100)]
    )

    await land.propose(ProposalType["EXTENSION"], "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)

    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address);

    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s)
    
    await landDAOcrowdsale.callExtension()

    result = await signDaiPermit(ethers.provider, purchaseToken.address, proposer.address, land.address)

    await land.depositDividend(getBigNumber(1000), result.nonce, result.expiry, result.v, result.r, result.s)
    
    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(1000))
    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))
    expect(await land.totalLoot()).to.equal(getBigNumber(1000))
    expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(1100)) // because there is 100 non loot for purchasing

    await land.setState(1)

    result = await signDaiPermit(ethers.provider, purchaseToken.address, proposer.address, land.address)

    await land.depositDividend(getBigNumber(1000), result.nonce, result.expiry, result.v, result.r, result.s)
    
    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(1950))
    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(50))
    expect(await land.totalLoot()).to.equal(getBigNumber(2000))
    expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(2100)) // because there is 100 non loot for purchasing

    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, land.address)
    expect(await land.connect(alice).depositDividend(getBigNumber(10), result.nonce, result.expiry, result.v, result.r, result.s).should.be.reverted)
  })

  it("Should allow a user to withdraw their loot and fail when they withdraw too much", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("Dai")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address],
      [getBigNumber(1000), getBigNumber(10000)]
    )
    
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      purchaseToken.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )

    // Instantiate LandWhiteListManager
    let LandWhitelistManager = await ethers.getContractFactory(
      "KaliAccessManager"
    )
    let landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      wethAddress,
      purchaseToken.address
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint96", "uint256"],
      [purchaseToken.address, getBigNumber(1000), getBigNumber(100)]
    )

    await land.propose(ProposalType["EXTENSION"], "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)

    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address);

    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s)
    
    await landDAOcrowdsale.callExtension()

    result = await signDaiPermit(ethers.provider, purchaseToken.address, proposer.address, land.address)

    await land.depositDividend(getBigNumber(1000), result.nonce, result.expiry, result.v, result.r, result.s)
    
    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(1000))
    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(900))

    // withdraw too much
    expect(await land.connect(alice).withdraw(getBigNumber(1001)).should.be.reverted)

    await land.connect(alice).withdraw(getBigNumber(150))

    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(850))
    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(1050))
    expect(await land.totalLoot()).to.equal(getBigNumber(850))
    expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(950)) // 950 because there is 100 ready for purchasing
  })



  it("Should forbid processing a non-existent proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    expect(await land.processProposal(2).should.be.reverted)
  })
  it("Should forbid processing a proposal that was already processed", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(ProposalType["QUORUM"], "TEST", [proposer.address], [100], [0x00])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)
    expect(await land.processProposal(1).should.be.reverted)
  })
  it("Should forbid processing a proposal before voting period ends", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(ProposalType["QUORUM"], "TEST", [proposer.address], [100], [0x00])
    await land.vote(1, true)
    await advanceTime(minVoteTime - 12)
    expect(await land.processProposal(1).should.be.reverted)
  })
  it("Should forbid processing a proposal before previous processes", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )
    await land.propose(ProposalType["QUORUM"], "TEST", [proposer.address], [100], [0x00])
    await land.propose(ProposalType["QUORUM"], "TEST", [proposer.address], [100], [0x00])
    await land.vote(2, true)
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    expect(await land.processProposal(2).should.be.reverted)
    await land.processProposal(1)
    await land.processProposal(2)
  })
  // it("Should forbid calling a non-whitelisted extension", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
  //   expect(await land.callExtension(wethAddress, 10, 0x0).should.be.reverted)
  // })
  // it("Should forbid non-whitelisted extension calling DAO", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [proposer.address],
  //     [getBigNumber(1)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   expect(await land.connect(alice).callExtension(bob.address, 10, 0x0).should.be.reverted)
  // })
  // it("Should allow a member to transfer shares", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     false,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.transfer(receiver.address, getBigNumber(4))
  //   expect(await land.balanceOf(sender.address)).to.equal(getBigNumber(6))
  //   expect(await land.balanceOf(receiver.address)).to.equal(getBigNumber(4))
  //   // console.log(await land.balanceOf(sender.address))
  //   // console.log(await land.balanceOf(receiver.address))
  // })
  // it("Should not allow a member to transfer excess shares", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     false,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   expect(
  //     await land.transfer(receiver.address, getBigNumber(11)).should.be.reverted
  //   )
  // })
  // it("Should not allow a member to transfer shares if paused", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   expect(
  //     await land.transfer(receiver.address, getBigNumber(1)).should.be.reverted
  //   )
  // })
  // it("Should allow a member to burn shares", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.burn(getBigNumber(1))
  // })
  // it("Should not allow a member to burn excess shares", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   expect(
  //     await land.burn(getBigNumber(11)).should.be.reverted
  //   )
  // })
  // it("Should allow a member to approve burn of shares (burnFrom)", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.approve(receiver.address, getBigNumber(1))
  //   expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(1))
  //   await land.connect(receiver).burnFrom(sender.address, getBigNumber(1))
  // })
  // it("Should not allow a member to approve excess burn of shares (burnFrom)", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.approve(receiver.address, getBigNumber(1))
  //   expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(1))
  //   expect(await land.connect(receiver).burnFrom(sender.address, getBigNumber(8)).should.be.reverted)
  //   expect(await land.connect(receiver).burnFrom(sender.address, getBigNumber(11)).should.be.reverted)
  // })
  // it("Should allow a member to approve pull transfers", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     false,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.approve(receiver.address, getBigNumber(4))
  //   expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(4))
  // })
  // it("Should allow an approved account to pull transfer (transferFrom)", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     false,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.approve(receiver.address, getBigNumber(4))
  //   expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(4))
  //   await land.connect(receiver).transferFrom(sender.address, receiver.address, getBigNumber(4))
  // })
  // it("Should not allow an account to pull transfer (transferFrom) beyond approval", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     false,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.approve(receiver.address, getBigNumber(4))
  //   expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(4))
  //   expect(await land.connect(receiver).transferFrom(sender.address, receiver.address, getBigNumber(5)).should.be.reverted)
  // })
  // it("Should not allow an approved account to pull transfer (transferFrom) if paused", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.approve(receiver.address, getBigNumber(4))
  //   expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(4))
  //   expect(await land.connect(receiver).transferFrom(sender.address, receiver.address, getBigNumber(4)).should.be.reverted)
  // })
  // it("Should not allow vote tally after current timestamp", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [bob.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   expect(
  //     await land.getPriorVotes(bob.address, 1941275221).should.be.reverted
  //   )
  // })
  // it("Should list member as 'delegate' if no delegation to others", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [bob.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   expect(await land.delegates(bob.address)).to.equal(bob.address)
  // })
  // it("Should match current votes to undelegated balance", async function () {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [bob.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   expect(await land.getCurrentVotes(bob.address)).to.equal(getBigNumber(10))
  // })
  // it("Should allow vote delegation", async function () {
  //   let sender, receiver
  //   ;[sender, receiver] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.delegate(receiver.address)
  //   expect(await land.delegates(sender.address)).to.equal(receiver.address)
  //   expect(await land.getCurrentVotes(sender.address)).to.equal(0)
  //   expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(10))
  //   expect(await land.balanceOf(sender.address)).to.equal(getBigNumber(10))
  //   expect(await land.balanceOf(receiver.address)).to.equal(0)
  //   await land.delegate(sender.address)
  //   expect(await land.delegates(sender.address)).to.equal(sender.address)
  //   expect(await land.getCurrentVotes(sender.address)).to.equal(getBigNumber(10))
  //   expect(await land.getCurrentVotes(receiver.address)).to.equal(0)
  // })
  // it("Should update delegated balance after transfer", async function () {
  //   let sender, receiver, receiver2
  //   ;[sender, receiver, receiver2] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     false,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.delegate(receiver.address)
  //   expect(await land.getCurrentVotes(sender.address)).to.equal(0)
  //   expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(10))
  //   await land.transfer(receiver2.address, getBigNumber(5))
  //   expect(await land.getCurrentVotes(receiver2.address)).to.equal(getBigNumber(5))
  //   expect(await land.getCurrentVotes(sender.address)).to.equal(0)
  //   expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(5))
  //   await land.delegate(sender.address)
  //   expect(await land.getCurrentVotes(sender.address)).to.equal(getBigNumber(5))
  // })
  // it("Should update delegated balance after pull transfer (transferFrom)", async function () {
  //   let sender, receiver, receiver2
  //   ;[sender, receiver, receiver2] = await ethers.getSigners()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     false,
  //     [],
  //     [],
  //     [sender.address],
  //     [getBigNumber(10)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   await land.delegate(receiver.address)
  //   expect(await land.getCurrentVotes(sender.address)).to.equal(0)
  //   expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(10))
  //   await land.approve(receiver.address, getBigNumber(5))
  //   await land.connect(receiver).transferFrom(sender.address, receiver2.address, getBigNumber(5))
  //   expect(await land.getCurrentVotes(receiver2.address)).to.equal(getBigNumber(5))
  //   expect(await land.getCurrentVotes(sender.address)).to.equal(0)
  //   expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(5))
  //   await land.delegate(sender.address)
  //   expect(await land.getCurrentVotes(sender.address)).to.equal(getBigNumber(5))
  // })
  // it("Should allow permit if the signature is valid", async () => {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [proposer.address],
  //     [getBigNumber(1)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   const domain = {
  //     name: "KALI",
  //     version: "1",
  //     chainId: 31337,
  //     verifyingContract: land.address,
  //   }
  //   const types = {
  //     Permit: [
  //       { name: "owner", type: "address" },
  //       { name: "spender", type: "address" },
  //       { name: "value", type: "uint256" },
  //       { name: "nonce", type: "uint256" },
  //       { name: "deadline", type: "uint256" },
  //     ],
  //   }
  //   const value = {
  //     owner: proposer.address,
  //     spender: bob.address,
  //     value: getBigNumber(1),
  //     nonce: 0,
  //     deadline: 1941543121
  //   }

  //   const signature = await proposer._signTypedData(domain, types, value)
  //   const { r, s, v } = ethers.utils.splitSignature(signature)
    
  //   await land.permit(proposer.address, bob.address, getBigNumber(1), 1941543121, v, r, s)

  //   // Unpause to unblock transferFrom
  //   await land.propose(8, "TEST", [proposer.address], [0], [0x00])
  //   await land.vote(1, true)
  //   await advanceTime(35)
  //   await land.processProposal(1)
  //   expect(await land.paused()).to.equal(false)

  //   // console.log(
  //   //   "Proposer's balance before delegation: ",
  //   //   await land.balanceOf(proposer.address)
  //   // )
  //   // console.log(
  //   //   "Bob's balance before delegation: ",
  //   //   await land.balanceOf(bob.address)
  //   // )
  //   await land.connect(bob).transferFrom(proposer.address, bob.address, getBigNumber(1))
  //   // console.log(
  //   //   "Proposer's balance after delegation: ",
  //   //   await land.balanceOf(proposer.address)
  //   // )
  //   // console.log(
  //   //   "Bob's balance after delegation: ",
  //   //   await land.balanceOf(bob.address)
  //   // )
  //   expect(await land.balanceOf(bob.address)).to.equal(getBigNumber(1))
  // })
  // it("Should revert permit if the signature is invalid", async () => {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [proposer.address],
  //     [getBigNumber(1)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   const rs = ethers.utils.formatBytes32String("rs")
  //   expect(
  //     await land.permit(proposer.address, bob.address, getBigNumber(1), 1941525801, 0, rs, rs).should.be.reverted
  //   )
  // })
  // it("Should allow delegateBySig if the signature is valid", async () => {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [proposer.address],
  //     [getBigNumber(1)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   const domain = {
  //     name: "KALI",
  //     version: "1",
  //     chainId: 31337,
  //     verifyingContract: land.address,
  //   }
  //   const types = {
  //     Delegation: [
  //       { name: "delegatee", type: "address" },
  //       { name: "nonce", type: "uint256" },
  //       { name: "expiry", type: "uint256" },
  //     ],
  //   }
  //   const value = {
  //     delegatee: bob.address,
  //     nonce: 0,
  //     expiry: 1941543121
  //   }

  //   const signature = await proposer._signTypedData(domain, types, value)
  //   const { r, s, v } = ethers.utils.splitSignature(signature)

  //   land.delegateBySig(bob.address, 0, 1941525801, v, r, s)
  // })
  // it("Should revert delegateBySig if the signature is invalid", async () => {
  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     true,
  //     [],
  //     [],
  //     [proposer.address],
  //     [getBigNumber(1)],
  //     [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  //   )
  //   const rs = ethers.utils.formatBytes32String("rs")
  //   expect(
  //     await land.delegateBySig(bob.address, 0, 1941525801, 0, rs, rs).should.be.reverted
  //   )
  // })
  // it("Should revert reentrant calls", async () => {
  //   let ReentrantMock // ReentrantMock contract
  //   let reentrantMock // ReentrantMock contract instance

  //   Reentrant = await ethers.getContractFactory("ReentrantMock")
  //   reentrant = await Reentrant.deploy()
  //   await reentrant.deployed()

  //   await land.init(
  //     "KALI",
  //     "KALI",
  //     "DOCS",
  //     dai.address,
  //     [], // addresses of extensions
  //     [], // data for extensions
  //     [0, 60], // quorum, supermajority
  //     Array(numProposals).fill(1), // vote type
  //     Array(numProposals).fill(minVoteTime) // vote time
  //   )
    
  //   await land.propose(ProposalType["EXTENSION"], "TEST", [reentrant.address], [1], [0x0])
  //   await land.vote(1, true)
  //   await advanceTime(minVoteTime + 1)
  //   await land.processProposal(1)
  //   expect(await land.extensions(reentrant.address)).to.equal(true)
    
  //   expect(await land.callExtension(reentrant.address, 0, "").should.be.reverted)
  // })
  it("Should not call if null length payload", async () => {
    let CallMock // CallMock contract
    let callMock // CallMock contract instance

    CallMock = await ethers.getContractFactory("CallMock")
    callMock = await CallMock.deploy()
    await callMock.deployed()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      Array(numProposals).fill(1), // vote type
      Array(numProposals).fill(minVoteTime) // vote time
    )

    expect(await callMock.called()).to.equal(false)
  })
})
