import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { FHERPS, FHERPS__factory } from "../types";
import { expect } from "chai";
import { FhevmType, HardhatFhevmRuntimeEnvironment } from "@fhevm/hardhat-plugin";
import "@typechain/hardhat";
import * as hre from "hardhat";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("FHERPS")) as FHERPS__factory;
  const fherpsContract = (await factory.deploy()) as FHERPS;
  const fherpsContractAddress = await fherpsContract.getAddress();

  return { fherpsContract, fherpsContractAddress };
}

describe("FHERPS", function () {
  let signers: Signers;
  let fherpsContract: FHERPS;
  let fherpsContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
    console.log("Deployer address:", signers.deployer.address);
    console.log("Alice address:", signers.alice.address);
    console.log("Bob address:", signers.bob.address);
  });

  beforeEach(async () => {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      throw new Error(`This hardhat test suite cannot run on Sepolia Testnet`);
    }
    ({ fherpsContract, fherpsContractAddress } = await deployFixture());
  });

  it("should create a game and submit the host's move", async function () {
    const hostMove = 1; // Example move: Paper

    const encryptedMove = await fhevm
      .createEncryptedInput(fherpsContractAddress, signers.alice.address)
      .add8(hostMove)
      .encrypt();

    const tx = await fherpsContract
      .connect(signers.alice)
      .createGameAndSubmitMove(encryptedMove.handles[0], encryptedMove.inputProof);
    await tx.wait();

    const game = await fherpsContract.games(0);
    expect(game.gameId).to.eq(0);
  });

  it("should join a game and submit the guest's move", async function () {
    const hostMove = 1; // Example move: Paper
    const guestMove = 2; // Example move: Scissors

    // Host creates a game
    const encryptedHostMove = await fhevm
      .createEncryptedInput(fherpsContractAddress, signers.alice.address)
      .add8(hostMove)
      .encrypt();

    let tx = await fherpsContract
      .connect(signers.alice)
      .createGameAndSubmitMove(encryptedHostMove.handles[0], encryptedHostMove.inputProof);
    await tx.wait();

    // Guest joins the game
    const encryptedGuestMove = await fhevm
      .createEncryptedInput(fherpsContractAddress, signers.bob.address)
      .add8(guestMove)
      .encrypt();

    tx = await fherpsContract
      .connect(signers.bob)
      .joinGameAndSubmitMove(0, encryptedGuestMove.handles[0], encryptedGuestMove.inputProof);
    await tx.wait();

    const game = await fherpsContract.games(0);
    expect(game.gameId).to.eq(0);
  });

  it("should not be able to join a non-existent game", async function () {
    const guestMove = 2; // Example move: Scissors

    const encryptedGuestMove = await fhevm
      .createEncryptedInput(fherpsContractAddress, signers.bob.address)
      .add8(guestMove)
      .encrypt();

    await expect(
      fherpsContract
        .connect(signers.bob)
        .joinGameAndSubmitMove(999, encryptedGuestMove.handles[0], encryptedGuestMove.inputProof),
    )
      .to.be.revertedWithCustomError(fherpsContract, "GameNotFound")
      .withArgs(999);
  });

  it("should not be able to join a resolved game", async function () {
    const hostMove = 1; // Example move: Paper
    const guestMove = 2; // Example move: Scissors

    // Host creates a game
    const encryptedHostMove = await fhevm
      .createEncryptedInput(fherpsContractAddress, signers.alice.address)
      .add8(hostMove)
      .encrypt();

    let tx = await fherpsContract
      .connect(signers.alice)
      .createGameAndSubmitMove(encryptedHostMove.handles[0], encryptedHostMove.inputProof);
    await tx.wait();

    // Guest joins the game
    const encryptedGuestMove = await fhevm
      .createEncryptedInput(fherpsContractAddress, signers.bob.address)
      .add8(guestMove)
      .encrypt();

    tx = await fherpsContract
      .connect(signers.bob)
      .joinGameAndSubmitMove(0, encryptedGuestMove.handles[0], encryptedGuestMove.inputProof);
    await tx.wait();

    // Attempt to join the resolved game
    await expect(
      fherpsContract
        .connect(signers.bob)
        .joinGameAndSubmitMove(0, encryptedGuestMove.handles[0], encryptedGuestMove.inputProof),
    )
      .to.be.revertedWithCustomError(fherpsContract, "GameAlreadySolved")
      .withArgs(0);
  });

  it("should be able to check a resolved game result", async function () {
    const hostMove = 1; // Example move: Paper
    const guestMove = 2; // Example move: Scissors

    const fhevm: HardhatFhevmRuntimeEnvironment = hre.fhevm;

    // Encrypt the host's move
    const encryptedHostMove = await fhevm
      .createEncryptedInput(fherpsContractAddress, signers.alice.address)
      .add8(hostMove)
      .encrypt();
    // Host creates a game and submits their move
    let tx = await fherpsContract
      .connect(signers.alice)
      .createGameAndSubmitMove(encryptedHostMove.handles[0], encryptedHostMove.inputProof);
    await tx.wait();
    // Encrypt the guest's move
    const encryptedGuestMove = await fhevm
      .createEncryptedInput(fherpsContractAddress, signers.bob.address)
      .add8(guestMove)
      .encrypt();
    // Guest joins the game and submits their move
    tx = await fherpsContract
      .connect(signers.bob)
      .joinGameAndSubmitMove(0, encryptedGuestMove.handles[0], encryptedGuestMove.inputProof);
    await tx.wait();
    // Retrieve the encrypted result
    const encryptedResult = await fherpsContract.connect(signers.deployer).encryptedResult(0);
    await tx.wait();
    // Decrypt it
    const result = await fhevm.publicDecryptEuint(FhevmType.euint8, encryptedResult);
    // Check that the result matches the expected outcome (guest wins)
    expect(result).to.eq(2);
  });
});
