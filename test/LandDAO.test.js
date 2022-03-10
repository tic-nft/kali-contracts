const { BigNumber } = require("ethers")
const chai = require("chai")
const { expect } = require("chai")
const { ethers } = require("hardhat")

const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

chai.should()

// Defaults to e18 using amount * 10^18
function getBigNumber(amount, decimals = 18) {
  return BigNumber.from(amount).mul(BigNumber.from(10).pow(decimals))
}

async function advanceTime(time) {
  await ethers.provider.send("evm_increaseTime", [time])
}

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
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
    )
    expect(await land.name()).to.equal("KALI")
    expect(await land.symbol()).to.equal("KALI")
    expect(await land.docs()).to.equal("DOCS")
    expect(await land.balanceOf(proposer.address)).to.equal(getBigNumber(5000, 0))
    expect(await land.quorum()).to.equal(0)
    expect(await land.supermajority()).to.equal(60)
    expect(await land.proposalVoteTypes(0)).to.equal(0)
    expect(await land.proposalVoteTypes(1)).to.equal(0)
    expect(await land.proposalVoteTypes(2)).to.equal(0)
    expect(await land.proposalVoteTypes(3)).to.equal(0)
    expect(await land.proposalVoteTypes(4)).to.equal(0)
    expect(await land.proposalVoteTypes(5)).to.equal(0)
    expect(await land.proposalVoteTypes(6)).to.equal(0)
    expect(await land.proposalVoteTypes(7)).to.equal(1)
    expect(await land.proposalVoteTypes(8)).to.equal(2)
    expect(await land.proposalVoteTypes(9)).to.equal(3)
    expect(await land.proposalVoteTypes(10)).to.equal(0)
    expect(await land.proposalVoteTypes(11)).to.equal(1)
    expect(await land.proposalVoteTypes(12)).to.equal(0)
    expect(await land.proposalVotePeriod(0)).to.equal(1)
    expect(await land.proposalVotePeriod(1)).to.equal(1)
    expect(await land.proposalVotePeriod(2)).to.equal(1)
    expect(await land.proposalVotePeriod(3)).to.equal(1)
    expect(await land.proposalVotePeriod(4)).to.equal(1)
    expect(await land.proposalVotePeriod(5)).to.equal(1)
    expect(await land.proposalVotePeriod(6)).to.equal(1)
    expect(await land.proposalVotePeriod(7)).to.equal(1)
    expect(await land.proposalVotePeriod(8)).to.equal(2)
    expect(await land.proposalVotePeriod(9)).to.equal(3)
    expect(await land.proposalVotePeriod(10)).to.equal(1)
    expect(await land.proposalVotePeriod(11)).to.equal(1)
    expect(await land.proposalVotePeriod(12)).to.equal(1)
  })
  it("Should revert if initialization vote type settings exceed or underflow bounds", async function () {
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
    ).should.be.reverted)
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [30, 0, 60], // quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0, 1], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
    ).should.be.reverted)
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 9], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
    ).should.be.reverted)
  })
  it("Should revert if initialization vote length settings exceed or underflow bounds", async function () {
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 1], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1] // vote days
    ).should.be.reverted)
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1, 1]
    ).should.be.reverted)
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 0, 1]
    ).should.be.reverted)
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 1],
      [1, 35, 1, 1, 1, 1, 1, 1, 2, 3, 1, 0, 1]
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
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
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
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
    ))
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
    ).should.be.reverted)
  })
  it("Should revert if voting period is initialized null or longer than 30 days", async function () {
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 0, 1] // vote days
    ).should.be.reverted)
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 60], // ]quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 2592001, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
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
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
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
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
    ).should.be.reverted)
    expect(await land.init(
      "KALI",
      "KALI",
      "DOCS",
      dai.address,
      [], // addresses of extensions
      [], // data for extensions
      [0, 101], // ]quorum, supermajority
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
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
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
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
      [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 0], // vote type
      [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 1, 1, 1] // vote days
    )
    // normal
    await land.propose(
      1,
      "TEST",
      [bob.address, bob.address],
      [3, 9000],
      [0x00, 0x00]
    )
    expect(await land.propose(
      1,
      "TEST",
      [bob.address, bob.address],
      [3, 0],
      [0x00, 0x00]
    ).should.be.reverted)
    expect(await land.propose(
      1,
      "TEST",
      [bob.address, bob.address],
      [3, 2592001],
      [0x00, 0x00]
    ).should.be.reverted)
    expect(await land.propose(
      1,
      "TEST",
      [bob.address, bob.address],
      [13, 9000],
      [0x00, 0x00]
    ).should.be.reverted)
  })
  it("Should revert if quorum proposal is for greater than 100", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [bob.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    // normal
    await land.propose(
      5,
      "TEST",
      [bob.address],
      [20],
      [0x00]
    )
    expect(await land.propose(
      5,
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
      true,
      [],
      [],
      [bob.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    // normal
    await land.propose(
      6,
      "TEST",
      [bob.address],
      [60],
      [0x00]
    )
    expect(await land.propose(
      6,
      "TEST",
      [bob.address],
      [51],
      [0x00]
    ).should.be.reverted)
    expect(await land.propose(
      6,
      "TEST",
      [bob.address],
      [101],
      [0x00]
    ).should.be.reverted)
  })
  it("Should revert if type proposal has proposal type greater than 10, vote type greater than 3, or setting length isn't 2", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [bob.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    // normal
    await land.propose(
      7,
      "TEST",
      [bob.address, alice.address],
      [0, 1],
      [0x00, 0x00]
    )
    expect(await land.propose(
      7,
      "TEST",
      [bob.address, alice.address],
      [12, 2],
      [0x00, 0x00]
    ).should.be.reverted)
    expect(await land.propose(
      7,
      "TEST",
      [bob.address, alice.address],
      [0, 5],
      [0x00, 0x00]
    ).should.be.reverted)
    expect(await land.propose(
      7,
      "TEST",
      [proposer.address, bob.address, alice.address],
      [0, 1, 0],
      [0x00, 0x00, 0x00]
    ).should.be.reverted)
  })
  it("Should allow proposer to cancel unsponsored proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.connect(alice).propose(
      0,
      "TEST",
      [alice.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.connect(alice).cancelProposal(1)
  })
  it("Should forbid non-proposer from cancelling unsponsored proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.connect(alice).propose(
      0,
      "TEST",
      [alice.address],
      [getBigNumber(1000)],
      [0x00]
    )
    expect(await land.cancelProposal(0).should.be.reverted)
  })
  it("Should forbid proposer from cancelling sponsored proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.connect(alice).propose(
      0,
      "TEST",
      [alice.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.sponsorProposal(1)
    expect(await land.connect(alice).cancelProposal(1).should.be.reverted)
  })
  it("Should forbid cancelling non-existent proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.connect(alice).propose(
      0,
      "TEST",
      [alice.address],
      [getBigNumber(1000)],
      [0x00]
    )
    expect(await land.connect(alice).cancelProposal(10).should.be.reverted)
  })
  it("Should allow sponsoring proposal and processing", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.connect(alice).propose(
      0,
      "TEST",
      [alice.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.sponsorProposal(1)
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(1000))
  })
  it("Should forbid non-member from sponsoring proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.connect(alice).propose(
      0,
      "TEST",
      [alice.address],
      [getBigNumber(1000)],
      [0x00]
    )
    expect(await land.connect(alice).sponsorProposal(0).should.be.reverted)
  })
  it("Should forbid sponsoring non-existent or processed proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.connect(alice).propose(
      0,
      "TEST",
      [alice.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.sponsorProposal(1)
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(1000))
    expect(await land.sponsorProposal(1).should.be.reverted)
    expect(await land.sponsorProposal(100).should.be.reverted)
  })
  it("Should forbid sponsoring an already sponsored proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.connect(alice).propose(
      0,
      "TEST",
      [alice.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.sponsorProposal(1)
    expect(await land.sponsorProposal(1).should.be.reverted)
  })
  it("Should allow self-sponsorship by a member", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(1, true)
  })
  it("Should forbid a member from voting again on proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(1, true)
    expect(await land.vote(1, true).should.be.reverted)
  })
  it("Should forbid voting after period ends", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await advanceTime(35)
    expect(await land.vote(1, true).should.be.reverted)
  })
  it("Should forbid processing before voting period ends", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(1, true)
    await advanceTime(29)
    expect(await land.processProposal(1).should.be.reverted)
  })
  it("Should forbid processing before grace period ends", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 30, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await advanceTime(29)
    await land.vote(1, true)
    expect(await land.processProposal(1).should.be.reverted)
  })
  it("Should process membership proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.balanceOf(proposer.address)).to.equal(getBigNumber(1001))
  })
  it("voteBySig should revert if the signature is invalid", async () => {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(0, "TEST", [alice.address], [0], [0x00])
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
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(0, "TEST", [alice.address], [getBigNumber(1000)], [0x00])

    const signature = await proposer._signTypedData(domain, types, value)
    const { r, s, v } = ethers.utils.splitSignature(signature)

    await land.voteBySig(proposer.address, 1, true, v, r, s)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(1000))
  })
  it("Should process burn (eviction) proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(1, "TEST", [proposer.address], [getBigNumber(1)], [0x00])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.balanceOf(proposer.address)).to.equal(0)
  })
  it("Should process contract call proposal - Single", async function () {
    let LandERC20 = await ethers.getContractFactory("LandERC20")
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
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(2, "TEST", [landERC20.address], [0], [payload])
    await land.vote(1, true)
    await advanceTime(35)
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
    let LandERC20 = await ethers.getContractFactory("LandERC20")
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
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      2,
      "TEST",
      [landERC20.address, dropETH.address],
      [0, getBigNumber(4)],
      [payload, payload2]
    )
    await land.vote(1, true)
    await advanceTime(35)
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
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(await land.votingPeriod()).to.equal(30)
    await land.propose(3, "TEST", [proposer.address], [90], [0x00])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.votingPeriod()).to.equal(90)
  })
  it("Should process grace period proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [90, 30, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(await land.gracePeriod()).to.equal(30)
    await land.propose(4, "TEST", [proposer.address], [60], [0x00])
    await land.vote(1, true)
    await advanceTime(125)
    await land.processProposal(1)
    expect(await land.gracePeriod()).to.equal(60)
  })
  it("Should process quorum proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(5, "TEST", [proposer.address], [100], [0x00])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.quorum()).to.equal(100)
  })
  it("Should process supermajority proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(6, "TEST", [proposer.address], [52], [0x00])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.supermajority()).to.equal(52)
  })
  it("Should process type proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      7,
      "TEST",
      [proposer.address, proposer.address],
      [0, 3],
      [0x00, 0x00]
    )
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.proposalVoteTypes(0)).to.equal(3)
  })
  it("Should process pause proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(8, "TEST", [proposer.address], [0], [0x00])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.paused()).to.equal(false)
  })
  it("Should process extension proposal - General", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(9, "TEST", [wethAddress], [0], [0x00])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.extensions(wethAddress)).to.equal(false)
  })
  it("Should toggle extension proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(9, "TEST", [wethAddress], [1], [0x00])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.extensions(wethAddress)).to.equal(true)
  })
  it("Should process extension proposal - LandDAOcrowdsale with ETH", async function () {
    // Instantiate LandDAO
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    // Instantiate LandWhiteListManager
    let LandWhitelistManager = await ethers.getContractFactory(
      "LandAccessManager"
    )
    let landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      wethAddress
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["uint256", "address", "uint8", "uint96", "uint32", "string"],
      [
        1,
        "0x0000000000000000000000000000000000000000",
        2,
        getBigNumber(100),
        1672174799,
        "DOCS"
      ]
    )
    await land.propose(9, "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    await landDAOcrowdsale 
      .connect(alice)
      .callExtension(land.address, getBigNumber(50), {
        value: getBigNumber(50),
      })
    expect(await ethers.provider.getBalance(land.address)).to.equal(
      getBigNumber(50)
    )
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(100))
  })
  it("Should process extension proposal - LandDAOcrowdsale with ERC20", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("LandERC20")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      "KALI",
      "KALI",
      "DOCS",
      [alice.address],
      [getBigNumber(1000)],
      false,
      alice.address
    )
    await purchaseToken.deployed()
    // Instantiate LandDAO
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    // Instantiate LandWhiteListManager
    let LandWhitelistManager = await ethers.getContractFactory(
      "LandAccessManager"
    )
    let landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    let LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    let landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      wethAddress
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["uint256", "address", "uint8", "uint96", "uint32", "string"],
      [1, purchaseToken.address, 2, getBigNumber(100), 1672174799, "DOCS"]
    )
    await land.propose(9, "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    await purchaseToken
      .connect(alice)
      .approve(landDAOcrowdsale.address, getBigNumber(50))
    await landDAOcrowdsale
      .connect(alice)
      .callExtension(land.address, getBigNumber(50))
    expect(await purchaseToken.balanceOf(land.address)).to.equal(
      getBigNumber(50)
    )
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(100))
  })
  it("Should process escape proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(1, true)
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(99)],
      [0x00]
    )
    await land.vote(2, false)
    await land.propose(10, "TEST", [proposer.address], [2], [0x00])
    await land.vote(3, true)
    await advanceTime(35)
    await land.processProposal(3)
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
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(11, "TEST", [], [], [])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.docs()).to.equal("TEST")
  })
  it("Should forbid processing a non-existent proposal", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(await land.processProposal(2).should.be.reverted)
  })
  it("Should forbid processing a proposal that was already processed", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.processProposal(1).should.be.reverted)
  })
  it("Should forbid processing a proposal before voting period ends", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(1, true)
    await advanceTime(20)
    expect(await land.processProposal(1).should.be.reverted)
  })
  it("Should forbid processing a proposal before previous processes", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    // normal
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    // check case
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(2, true)
    await land.propose(
      0,
      "TEST",
      [proposer.address],
      [getBigNumber(1000)],
      [0x00]
    )
    await land.vote(3, true)
    await advanceTime(35)
    expect(await land.processProposal(3).should.be.reverted)
    await land.processProposal(2)
    await land.processProposal(3)
  })
  it("Should forbid calling a non-whitelisted extension", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(await land.callExtension(wethAddress, 10, 0x0).should.be.reverted)
  })
  it("Should forbid non-whitelisted extension calling DAO", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(await land.connect(alice).callExtension(bob.address, 10, 0x0).should.be.reverted)
  })
  it("Should allow a member to transfer shares", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      false,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.transfer(receiver.address, getBigNumber(4))
    expect(await land.balanceOf(sender.address)).to.equal(getBigNumber(6))
    expect(await land.balanceOf(receiver.address)).to.equal(getBigNumber(4))
    // console.log(await land.balanceOf(sender.address))
    // console.log(await land.balanceOf(receiver.address))
  })
  it("Should not allow a member to transfer excess shares", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      false,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(
      await land.transfer(receiver.address, getBigNumber(11)).should.be.reverted
    )
  })
  it("Should not allow a member to transfer shares if paused", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(
      await land.transfer(receiver.address, getBigNumber(1)).should.be.reverted
    )
  })
  it("Should allow a member to burn shares", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.burn(getBigNumber(1))
  })
  it("Should not allow a member to burn excess shares", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(
      await land.burn(getBigNumber(11)).should.be.reverted
    )
  })
  it("Should allow a member to approve burn of shares (burnFrom)", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.approve(receiver.address, getBigNumber(1))
    expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(1))
    await land.connect(receiver).burnFrom(sender.address, getBigNumber(1))
  })
  it("Should not allow a member to approve excess burn of shares (burnFrom)", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.approve(receiver.address, getBigNumber(1))
    expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(1))
    expect(await land.connect(receiver).burnFrom(sender.address, getBigNumber(8)).should.be.reverted)
    expect(await land.connect(receiver).burnFrom(sender.address, getBigNumber(11)).should.be.reverted)
  })
  it("Should allow a member to approve pull transfers", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      false,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.approve(receiver.address, getBigNumber(4))
    expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(4))
  })
  it("Should allow an approved account to pull transfer (transferFrom)", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      false,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.approve(receiver.address, getBigNumber(4))
    expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(4))
    await land.connect(receiver).transferFrom(sender.address, receiver.address, getBigNumber(4))
  })
  it("Should not allow an account to pull transfer (transferFrom) beyond approval", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      false,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.approve(receiver.address, getBigNumber(4))
    expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(4))
    expect(await land.connect(receiver).transferFrom(sender.address, receiver.address, getBigNumber(5)).should.be.reverted)
  })
  it("Should not allow an approved account to pull transfer (transferFrom) if paused", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.approve(receiver.address, getBigNumber(4))
    expect(await land.allowance(sender.address, receiver.address)).to.equal(getBigNumber(4))
    expect(await land.connect(receiver).transferFrom(sender.address, receiver.address, getBigNumber(4)).should.be.reverted)
  })
  it("Should not allow vote tally after current timestamp", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [bob.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(
      await land.getPriorVotes(bob.address, 1941275221).should.be.reverted
    )
  })
  it("Should list member as 'delegate' if no delegation to others", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [bob.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(await land.delegates(bob.address)).to.equal(bob.address)
  })
  it("Should match current votes to undelegated balance", async function () {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [bob.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    expect(await land.getCurrentVotes(bob.address)).to.equal(getBigNumber(10))
  })
  it("Should allow vote delegation", async function () {
    let sender, receiver
    ;[sender, receiver] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.delegate(receiver.address)
    expect(await land.delegates(sender.address)).to.equal(receiver.address)
    expect(await land.getCurrentVotes(sender.address)).to.equal(0)
    expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(10))
    expect(await land.balanceOf(sender.address)).to.equal(getBigNumber(10))
    expect(await land.balanceOf(receiver.address)).to.equal(0)
    await land.delegate(sender.address)
    expect(await land.delegates(sender.address)).to.equal(sender.address)
    expect(await land.getCurrentVotes(sender.address)).to.equal(getBigNumber(10))
    expect(await land.getCurrentVotes(receiver.address)).to.equal(0)
  })
  it("Should update delegated balance after transfer", async function () {
    let sender, receiver, receiver2
    ;[sender, receiver, receiver2] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      false,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.delegate(receiver.address)
    expect(await land.getCurrentVotes(sender.address)).to.equal(0)
    expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(10))
    await land.transfer(receiver2.address, getBigNumber(5))
    expect(await land.getCurrentVotes(receiver2.address)).to.equal(getBigNumber(5))
    expect(await land.getCurrentVotes(sender.address)).to.equal(0)
    expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(5))
    await land.delegate(sender.address)
    expect(await land.getCurrentVotes(sender.address)).to.equal(getBigNumber(5))
  })
  it("Should update delegated balance after pull transfer (transferFrom)", async function () {
    let sender, receiver, receiver2
    ;[sender, receiver, receiver2] = await ethers.getSigners()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      false,
      [],
      [],
      [sender.address],
      [getBigNumber(10)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    await land.delegate(receiver.address)
    expect(await land.getCurrentVotes(sender.address)).to.equal(0)
    expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(10))
    await land.approve(receiver.address, getBigNumber(5))
    await land.connect(receiver).transferFrom(sender.address, receiver2.address, getBigNumber(5))
    expect(await land.getCurrentVotes(receiver2.address)).to.equal(getBigNumber(5))
    expect(await land.getCurrentVotes(sender.address)).to.equal(0)
    expect(await land.getCurrentVotes(receiver.address)).to.equal(getBigNumber(5))
    await land.delegate(sender.address)
    expect(await land.getCurrentVotes(sender.address)).to.equal(getBigNumber(5))
  })
  it("Should allow permit if the signature is valid", async () => {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    const domain = {
      name: "KALI",
      version: "1",
      chainId: 31337,
      verifyingContract: land.address,
    }
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    }
    const value = {
      owner: proposer.address,
      spender: bob.address,
      value: getBigNumber(1),
      nonce: 0,
      deadline: 1941543121
    }

    const signature = await proposer._signTypedData(domain, types, value)
    const { r, s, v } = ethers.utils.splitSignature(signature)
    
    await land.permit(proposer.address, bob.address, getBigNumber(1), 1941543121, v, r, s)

    // Unpause to unblock transferFrom
    await land.propose(8, "TEST", [proposer.address], [0], [0x00])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.paused()).to.equal(false)

    // console.log(
    //   "Proposer's balance before delegation: ",
    //   await land.balanceOf(proposer.address)
    // )
    // console.log(
    //   "Bob's balance before delegation: ",
    //   await land.balanceOf(bob.address)
    // )
    await land.connect(bob).transferFrom(proposer.address, bob.address, getBigNumber(1))
    // console.log(
    //   "Proposer's balance after delegation: ",
    //   await land.balanceOf(proposer.address)
    // )
    // console.log(
    //   "Bob's balance after delegation: ",
    //   await land.balanceOf(bob.address)
    // )
    expect(await land.balanceOf(bob.address)).to.equal(getBigNumber(1))
  })
  it("Should revert permit if the signature is invalid", async () => {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    const rs = ethers.utils.formatBytes32String("rs")
    expect(
      await land.permit(proposer.address, bob.address, getBigNumber(1), 1941525801, 0, rs, rs).should.be.reverted
    )
  })
  it("Should allow delegateBySig if the signature is valid", async () => {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    const domain = {
      name: "KALI",
      version: "1",
      chainId: 31337,
      verifyingContract: land.address,
    }
    const types = {
      Delegation: [
        { name: "delegatee", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "expiry", type: "uint256" },
      ],
    }
    const value = {
      delegatee: bob.address,
      nonce: 0,
      expiry: 1941543121
    }

    const signature = await proposer._signTypedData(domain, types, value)
    const { r, s, v } = ethers.utils.splitSignature(signature)

    land.delegateBySig(bob.address, 0, 1941525801, v, r, s)
  })
  it("Should revert delegateBySig if the signature is invalid", async () => {
    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    const rs = ethers.utils.formatBytes32String("rs")
    expect(
      await land.delegateBySig(bob.address, 0, 1941525801, 0, rs, rs).should.be.reverted
    )
  })
  it("Should revert reentrant calls", async () => {
    let ReentrantMock // ReentrantMock contract
    let reentrantMock // ReentrantMock contract instance

    Reentrant = await ethers.getContractFactory("ReentrantMock")
    reentrant = await Reentrant.deploy()
    await reentrant.deployed()

    await land.init(
      "KALI",
      "KALI",
      "DOCS",
      true,
      [],
      [],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )
    
    await land.propose(9, "TEST", [reentrant.address], [1], [0x0])
    await land.vote(1, true)
    await advanceTime(35)
    await land.processProposal(1)
    expect(await land.extensions(reentrant.address)).to.equal(true)
    
    expect(await land.callExtension(reentrant.address, 0, "").should.be.reverted)
  })
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
      true,
      [callMock.address],
      [0x00],
      [proposer.address],
      [getBigNumber(1)],
      [30, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    )

    expect(await callMock.called()).to.equal(false)
  })
})
