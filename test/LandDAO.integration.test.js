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

async function lootDivCalc(amount, user, dao) {
  return getBigNumber(amount).mul(getBigNumber(await dao.balanceOf(user.address), 0)).div(getBigNumber(await dao.totalSupply(), 0))
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
  'SELL': 8, // call for manager to sell property
  'PURCHASE': 9, // call to place funds in escrow for manager to use
  'MANAGER': 10, // call to set a new manager for property
  'DISTRIBUTE': 11 // call to divide the spoils and exit the property typically when the property could not be purchased
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

  let PurchaseToken
  let purchaseToken
  let LandWhitelistManager
  let landWhitelistManager
  let LandDAOcrowdsale
  let landDAOcrowdsale
  let CapCall
  let capCall


  before(async () => {
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
    PurchaseToken = await ethers.getContractFactory("Dai")
    purchaseToken = await PurchaseToken.deploy()
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
    LandWhitelistManager = await ethers.getContractFactory(
      "KaliAccessManager"
    )
    landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
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

    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address)

    expect(await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s).should.be.reverted)
    
  })

  it("Alice is contributing", async function () {
    
    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(15000), result.nonce, result.expiry, result.v, result.r, result.s)
    
    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(15000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(985000))
    expect(await landDAOcrowdsale.callExtension().should.be.reverted)
  })

  it("Now Bob is donating", async function () {
    result = await signDaiPermit(ethers.provider, purchaseToken.address, bob.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(bob)
      .contribute(getBigNumber(55000), result.nonce, result.expiry, result.v, result.r, result.s)

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(15000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(985000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(70000))
  })

  it("Now Charlie is donating", async function () {
    result = await signDaiPermit(ethers.provider, purchaseToken.address, charlie.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(charlie)
      .contribute(getBigNumber(70000), result.nonce, result.expiry, result.v, result.r, result.s)

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(15000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(985000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await landDAOcrowdsale.contributions(charlie.address)).to.equal(getBigNumber(70000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(930000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(140000))
  })

  it("Now revert trying to donate second time with same nonce", async function () {
    expect(await landDAOcrowdsale
      .connect(charlie)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s).should.be.reverted)

  })

  it("Doug donating", async function () {

    result = await signDaiPermit(ethers.provider, purchaseToken.address, doug.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(doug)
      .contribute(getBigNumber(170000), result.nonce, result.expiry, result.v, result.r, result.s)

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(15000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(985000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await landDAOcrowdsale.contributions(charlie.address)).to.equal(getBigNumber(70000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(930000))
    expect(await landDAOcrowdsale.contributions(doug.address)).to.equal(getBigNumber(170000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(830000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(310000))
  })
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
  
  it("Alice tries to withdraw too much", async function () {
    expect(await landDAOcrowdsale
      .connect(alice)
      .withdraw(getBigNumber(17000)).should.be.reverted)
  })

  it("Alice contributes more money than she has", async function () {
    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address)
    
    expect(await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(1500000), result.nonce, result.expiry, result.v, result.r, result.s).should.be.reverted)
  })

  it("Alice just contributes more", async function () {
    
    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(150000), result.nonce, result.expiry, result.v, result.r, result.s)

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(165000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(835000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await landDAOcrowdsale.contributions(charlie.address)).to.equal(getBigNumber(70000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(930000))
    expect(await landDAOcrowdsale.contributions(doug.address)).to.equal(getBigNumber(170000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(830000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(460000))
    expect(await landDAOcrowdsale.totalFunds()).to.equal(getBigNumber(460000))
  })

  it("Now Alice can withdraw something", async function () {
    
    await landDAOcrowdsale
      .connect(alice)
      .withdraw(getBigNumber(100000))

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(65000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(935000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await landDAOcrowdsale.contributions(charlie.address)).to.equal(getBigNumber(70000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(930000))
    expect(await landDAOcrowdsale.contributions(doug.address)).to.equal(getBigNumber(170000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(830000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(360000))
    expect(await landDAOcrowdsale.totalFunds()).to.equal(getBigNumber(360000))
  })

  it("Doug withdraws and then goes big", async function () {
    
    await landDAOcrowdsale
      .connect(doug)
      .withdraw(getBigNumber(70000))

    result = await signDaiPermit(ethers.provider, purchaseToken.address, doug.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(doug)
      .contribute(getBigNumber(500000), result.nonce, result.expiry, result.v, result.r, result.s)

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(65000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(935000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await landDAOcrowdsale.contributions(charlie.address)).to.equal(getBigNumber(70000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(930000))
    expect(await landDAOcrowdsale.contributions(doug.address)).to.equal(getBigNumber(600000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(400000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(790000))
    expect(await landDAOcrowdsale.totalFunds()).to.equal(getBigNumber(790000))
  })

  it("Charlie finishes it off", async function () {
    result = await signDaiPermit(ethers.provider, purchaseToken.address, charlie.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(charlie)
      .contribute(getBigNumber(930000), result.nonce, result.expiry, result.v, result.r, result.s)

    expect(await landDAOcrowdsale.contributions(alice.address)).to.equal(getBigNumber(65000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(935000))
    expect(await landDAOcrowdsale.contributions(bob.address)).to.equal(getBigNumber(55000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(945000))
    expect(await landDAOcrowdsale.contributions(charlie.address)).to.equal(getBigNumber(780000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(220000))
    expect(await landDAOcrowdsale.contributions(doug.address)).to.equal(getBigNumber(600000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(400000))
    expect(await purchaseToken.balanceOf(landDAOcrowdsale.address)).to.equal(getBigNumber(1500000))
    expect(await landDAOcrowdsale.totalFunds()).to.equal(getBigNumber(1500000))
    expect(await landDAOcrowdsale.complete()).to.be.true
  })

  it("Alice tries to withdraw when everything is complete", async function () {
    expect(await landDAOcrowdsale
      .connect(alice)
      .withdraw(getBigNumber(17000)).should.be.reverted)
  })

  it("Edward the saint decides to execute the contract", async function () {

    expect(await land.balanceOf(proposer.address)).to.equal(getBigNumber(5000, 0))
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(0, 0))
    expect(await land.balanceOf(bob.address)).to.equal(getBigNumber(0, 0))
    expect(await land.balanceOf(charlie.address)).to.equal(getBigNumber(0, 0))
    expect(await land.balanceOf(doug.address)).to.equal(getBigNumber(0, 0))
    expect(await land.balanceOf(edward.address)).to.equal(getBigNumber(0, 0))
    expect(await landDAOcrowdsale.distributed()).to.be.false

    await landDAOcrowdsale
      .connect(edward)
      .callExtension()

    expect(await land.balanceOf(proposer.address)).to.equal(getBigNumber(5000, 0))
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(4116, 0))
    expect(await land.balanceOf(bob.address)).to.equal(getBigNumber(3483, 0))
    expect(await land.balanceOf(charlie.address)).to.equal(getBigNumber(49400, 0))
    expect(await land.balanceOf(doug.address)).to.equal(getBigNumber(38000, 0))
    expect(await land.balanceOf(edward.address)).to.equal(getBigNumber(0, 0))
    expect(await land.totalSupply()).to.equal(getBigNumber(99999, 0)) // missing share from truncation
    expect(await land.propertyValue()).to.equal(getBigNumber(1500000, 0))
    expect(await landDAOcrowdsale.distributed()).to.be.true
    
  })

  it("Time to direct a purchase", async function () {
    await land.propose(ProposalType["PURCHASE"], "TEST", [proposer.address], [getBigNumber(1350000)], [0x00])
    let currentProposal = await land.proposalCount();
    await land.vote(currentProposal, true)
    await land.connect(charlie).vote(currentProposal, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(currentProposal)

    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(1350000))

    await land.withdraw(getBigNumber(1350000))

    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))
    expect(await purchaseToken.balanceOf(proposer.address)).to.equal(getBigNumber(2350000))
    expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(150000))
  })

  it("Set state to the active so that manager can collect dividends", async function () {
    expect(await land.currentState()).to.equal(0)
    await land.setState(1)
    expect(await land.currentState()).to.equal(1)
  })

  it("Pay a dividend", async function () {
    result = await signDaiPermit(ethers.provider, purchaseToken.address, proposer.address, land.address)

    let divPayment = 125000

    await land.depositDividend(getBigNumber(divPayment), result.nonce, result.expiry, result.v, result.r, result.s)

    expect(await purchaseToken.balanceOf(proposer.address)).to.equal(getBigNumber(2225000))
    expect(await purchaseToken.balanceOf(land.address)).to.equal(getBigNumber(275000))

    expect(await land.lootBalanceOf(proposer.address)).to.equal(await lootDivCalc(divPayment, proposer, land))
    expect(await land.lootBalanceOf(alice.address)).to.equal(await lootDivCalc(divPayment, alice, land))
    expect(await land.lootBalanceOf(bob.address)).to.equal(await lootDivCalc(divPayment, bob, land))
    expect(await land.lootBalanceOf(charlie.address)).to.equal(await lootDivCalc(divPayment, charlie, land))
    expect(await land.lootBalanceOf(doug.address)).to.equal(await lootDivCalc(divPayment, doug, land))
  })

  it("Call a Capital call", async function () {
    CapCall = await ethers.getContractFactory("LandDAOcapitalcall")
    capCall = await CapCall.deploy(
      landWhitelistManager.address,
      dai.address
    )
    await capCall.deployed()

    let payload = ethers.utils.defaultAbiCoder.encode(
      ["uint256", "uint256"],
      [getBigNumber(50000), minVoteTime]
    )

    await land.propose(ProposalType["EXTENSION"], "TEST", [capCall.address], [3], [payload])

    let currentProposal = await land.proposalCount();
    await land.vote(currentProposal, true)
    await land.connect(charlie).vote(currentProposal, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(currentProposal)

    expect(await capCall.period()).to.equal(minVoteTime)
    expect(await capCall.goal()).to.equal(getBigNumber(50000))
    expect(await capCall.memberShare(proposer.address)).to.equal(await lootDivCalc(50000, proposer, land))
    expect(await capCall.memberShare(doug.address)).to.equal(await lootDivCalc(50000, doug, land))
    expect(await capCall.contributions(proposer.address)).to.equal(0)
    expect(await capCall.members(0)).to.equal(proposer.address)
    expect(await capCall.members(4)).to.equal(doug.address)
  })

  it("Contribute to capital call, first fail with too much", async function () {
    
    expect(await capCall.connect(alice).contribute(getBigNumber(3000)).should.be.reverted)
    expect(await land.connect(bob).contributeLoot(getBigNumber(3000)).should.be.reverted)
    expect(await land.connect(edward).contributeLoot(getBigNumber(400)).should.be.reverted)

  })

  it("Contribute to something that makes sense", async function () {
    
    let aliceBalance = await purchaseToken.balanceOf(alice.address)
    let bobBalance = await land.lootBalanceOf(bob.address)

    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, capCall.address)
    console.log("first")
    await capCall.connect(alice).contribute(getBigNumber(1000), result.nonce, result.expiry, result.v, result.r, result.s)
    console.log("second")
    await land.connect(bob).contributeLoot(getBigNumber(1000), capCall.address)
    console.log("third")
    expect(await land.connect(edward).contributeLoot(getBigNumber(400), capCall.address).should.be.reverted)

    expect(await capCall.contributions(alice.address)).to.equal(getBigNumber(1000))
    expect(await capCall.contributions(bob.address)).to.equal(getBigNumber(1000))
    expect(await capCall.contributions(proposer.address)).to.equal(0)

    expect(await land.lootBalanceOf(bob.address)).to.equal(bobBalance.sub(getBigNumber(1000)))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(aliceBalance.sub(getBigNumber(1000)))
  })









  // start with a new contract just to get a funding and redistribution
  it("Starts a totally new contract system for cancellation", async function () {
    Land = await ethers.getContractFactory("LandDAO")
    land = await Land.deploy()
    await land.deployed()
    Dai = await ethers.getContractFactory("KaliERC20")
    dai = await Dai.deploy()
    await dai.deployed()

    // Instantiate purchaseToken
    PurchaseToken = await ethers.getContractFactory("Dai")
    purchaseToken = await PurchaseToken.deploy()
    await purchaseToken.deployed()
    await purchaseToken.init(
      [alice.address, proposer.address, bob.address, charlie.address, doug.address, edward.address, fred.address],
      [getBigNumber(1000000), getBigNumber(10000000), getBigNumber(1000000), getBigNumber(1000000), getBigNumber(1000000), getBigNumber(1000000), getBigNumber(1000000)]
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
    LandWhitelistManager = await ethers.getContractFactory(
      "KaliAccessManager"
    )
    landWhitelistManager = await LandWhitelistManager.deploy()
    await landWhitelistManager.deployed()
    // Instantiate extension contract
    LandDAOcrowdsale = await ethers.getContractFactory("LandDAOcrowdsale")
    landDAOcrowdsale = await LandDAOcrowdsale.deploy(
      landWhitelistManager.address,
      purchaseToken.address
    )
    await landDAOcrowdsale.deployed()
    // Set up whitelist
    await landWhitelistManager.createList(
      [alice.address, bob.address, charlie.address, doug.address],
      "0x074b43252ffb4a469154df5fb7fe4ecce30953ba8b7095fe1e006185f017ad10"
    )
    // Set up payload for extension proposal
    let payload = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint96", "uint256"],
      [purchaseToken.address, getBigNumber(1000), getBigNumber(1000000)]
    )

    await land.propose(ProposalType["EXTENSION"], "TEST", [landDAOcrowdsale.address], [1], [payload])
    await land.vote(1, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(1)

    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address)

    expect(await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(100), result.nonce, result.expiry, result.v, result.r, result.s).should.be.reverted)
    
  })

  it("Four people will contribute equally to complete the contract", async function () {
    result = await signDaiPermit(ethers.provider, purchaseToken.address, alice.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(alice)
      .contribute(getBigNumber(250000), result.nonce, result.expiry, result.v, result.r, result.s)

    result = await signDaiPermit(ethers.provider, purchaseToken.address, bob.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(bob)
      .contribute(getBigNumber(250000), result.nonce, result.expiry, result.v, result.r, result.s)

    result = await signDaiPermit(ethers.provider, purchaseToken.address, charlie.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(charlie)
      .contribute(getBigNumber(250000), result.nonce, result.expiry, result.v, result.r, result.s)

    result = await signDaiPermit(ethers.provider, purchaseToken.address, doug.address, landDAOcrowdsale.address)

    await landDAOcrowdsale
      .connect(doug)
      .contribute(getBigNumber(250000), result.nonce, result.expiry, result.v, result.r, result.s)

    await landDAOcrowdsale
      .connect(doug)
      .callExtension()

    expect(await land.balanceOf(proposer.address)).to.equal(getBigNumber(5000, 0))
    expect(await land.balanceOf(alice.address)).to.equal(getBigNumber(23750, 0))
    expect(await land.balanceOf(bob.address)).to.equal(getBigNumber(23750, 0))
    expect(await land.balanceOf(charlie.address)).to.equal(getBigNumber(23750, 0))
    expect(await land.balanceOf(doug.address)).to.equal(getBigNumber(23750, 0))
  })

  it("It has been some time so we need to just extract our money", async function () {

    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(bob.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(charlie.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(doug.address)).to.equal(getBigNumber(0))

    expect(await land.connect(alice).withdraw(getBigNumber(250000)).should.be.reverted)

    await land.propose(ProposalType["DISTRIBUTE"], "TEST", [], [], [])
    let currentProposal = await land.proposalCount();
    await land.vote(currentProposal, true)
    await land.connect(alice).vote(currentProposal, true)
    await land.connect(bob).vote(currentProposal, true)
    await advanceTime(minVoteTime + 1)
    await land.processProposal(currentProposal)

    expect(await land.lootBalanceOf(proposer.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(250000))
    expect(await land.lootBalanceOf(bob.address)).to.equal(getBigNumber(250000))
    expect(await land.lootBalanceOf(charlie.address)).to.equal(getBigNumber(250000))
    expect(await land.lootBalanceOf(doug.address)).to.equal(getBigNumber(250000))
  })

  it("Now I can withdraw funds back to myself in DAI", async function () {

    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(750000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(750000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(750000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(750000))

    await land.connect(alice).withdraw(getBigNumber(250000))

    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(bob.address)).to.equal(getBigNumber(250000))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(1000000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(750000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(750000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(750000))

    await land.connect(bob).withdraw(getBigNumber(150000))
    await land.connect(doug).withdraw(getBigNumber(250000))

    expect(await land.lootBalanceOf(bob.address)).to.equal(getBigNumber(100000))
    expect(await land.lootBalanceOf(doug.address)).to.equal(getBigNumber(0))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(1000000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(900000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(750000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(1000000))

    await land.connect(bob).withdraw(getBigNumber(100000))
    await land.connect(charlie).withdraw(getBigNumber(250000))

    expect(await land.lootBalanceOf(alice.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(bob.address)).to.equal(getBigNumber(0))
    expect(await land.lootBalanceOf(doug.address)).to.equal(getBigNumber(0))
    expect(await purchaseToken.balanceOf(alice.address)).to.equal(getBigNumber(1000000))
    expect(await purchaseToken.balanceOf(bob.address)).to.equal(getBigNumber(1000000))
    expect(await purchaseToken.balanceOf(charlie.address)).to.equal(getBigNumber(1000000))
    expect(await purchaseToken.balanceOf(doug.address)).to.equal(getBigNumber(1000000))
  })
})
