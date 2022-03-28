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

describe("LandDAOIntegration", function () {
  let Land // LandDAO contract
  let land // LandDAO contract instance
  let proposer // signerA
  let alice // signerB
  let bob // signerC
  let charlie // signerD
  let doug // signerE
  let edward // signerF
  let fred // signerG

  beforeEach(async () => {
    ;[proposer, alice, bob, charlie, doug, edward, fred] = await ethers.getSigners()

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

  it("Should meander with lots of edge cases over the lifetime of the process", async function () {
    // Instantiate purchaseToken
    let PurchaseToken = await ethers.getContractFactory("Dai")
    let purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address, bob.address, charlie.address, doug.address, edward.address, fred.address],
      [getBigNumber(1000000), getBigNumber(1000000), getBigNumber(1000000), getBigNumber(1000000), getBigNumber(1000000), getBigNumber(1000000), getBigNumber(1000000)]
    )
    console.log("before deploy")
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
    console.log("after deploy")
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
    console.log("Lots of people white listed")
    await landWhitelistManager.createList(
      [alice.address, bob.address, charlie.address, doug.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint96", "uint256"],
      [purchaseToken.address, getBigNumber(1000), getBigNumber(1500000)]
    )

    await land.propose(ProposalType["EXTENSION"], "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)

    console.log("Revert when you are not contributing enough")
    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address)

    expect(await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s).should.be.reverted)
    
    console.log("Contribute enough")
    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(15000), result.nonce, result.expiry, result.v, result.r, result.s)
    
    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(15000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(985000))
    console.log("The kickstart contract goal has not been reached yet")
    expect(await landDAOcrowdsale.callExtension().should.be.reverted)


    result = await signDaiPermit(ethers.provider, purchaseToken.address, bob.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(bob)
      .contribute(getBigNumber(55000), result.nonce, result.expiry, result.v, result.r, result.s)

    console.log("Now bob has donated")
    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(15000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(985000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(70000))

    result = await signDaiPermit(ethers.provider, purchaseToken.address, charlie.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(charlie)
      .contribute(getBigNumber(70000), result.nonce, result.expiry, result.v, result.r, result.s)
    console.log("Now charlie has donated")

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(15000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(985000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await landDAOcrowdsale.contributions(charlie.address)).to.equal(getBigNumber(70000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(930000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(140000))

    expect(await landDAOcrowdsale
      .connect(charlie)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s).should.be.reverted)

    console.log("Charlie tried a second donation with a repeated nonce and was reverted")

    result = await signDaiPermit(ethers.provider, purchaseToken.address, doug.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(doug)
      .contribute(getBigNumber(170000), result.nonce, result.expiry, result.v, result.r, result.s)
    console.log("Now doug has donated")

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(15000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(985000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await landDAOcrowdsale.contributions(charlie.address)).to.equal(getBigNumber(70000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(930000))
    expect(await landDAOcrowdsale.contributions(doug.address)).to.equal(getBigNumber(170000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(830000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(310000))

    // TODO: See how to get the accessList working
    // result = await signDaiPermit(ethers.provider, purchaseToken.address, edward.address, landDAOcrowdsale.address)

    // expect(await landDAOcrowdsale
    //   .connect(edward)
    //   .contribute(getBigNumber(5000), result.nonce, result.expiry, result.v, result.r, result.s).should.be.reverted)
    // console.log("Edward is not on the list so should be reverted")


    // await land.depositDividend(getBigNumber(1000), result.nonce, result.expiry, result.v, result.r, result.s)
    
    // expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(1000))
    // expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))
    // expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(900))

    // // withdraw too much
    // expect(await land.connect(alice).withdraw(getBigNumber(1001)).should.be.reverted)

    // await land.connect(alice).withdraw(getBigNumber(150))

    // expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(850))
    // expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))
    // expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(1050))
    // expect(await land.totalLoot()).to.equal(getBigNumber(850))
    // expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(950)) // 950 because there is 100 ready for purchasing
  })

})
