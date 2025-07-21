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

// Helper function to play a full game and get the result
async function playGameAndGetResult(
  hostMove: number,
  guestMove: number,
  fherpsContract: FHERPS,
  fherpsContractAddress: string,
  alice: HardhatEthersSigner,
  bob: HardhatEthersSigner,
  fhevm: HardhatFhevmRuntimeEnvironment,
) {
  // Host creates a game
  const encryptedHostMove = await fhevm.createEncryptedInput(fherpsContractAddress, alice.address).add8(hostMove).encrypt();
  const createTx = await fherpsContract
    .connect(alice)
    .createGameAndSubmitMove(encryptedHostMove.handles[0], encryptedHostMove.inputProof);
  await createTx.wait();
  // Since we redeploy the contract before each test, we can assume the game ID is always 0
  // In a real scenario, you would retrieve the game ID from the event or state
  const gameId = 0;
  // Guest joins the game
  const encryptedGuestMove = await fhevm.createEncryptedInput(fherpsContractAddress, bob.address).add8(guestMove).encrypt();
  const joinTx = await fherpsContract
    .connect(bob)
    .joinGameAndSubmitMove(gameId, encryptedGuestMove.handles[0], encryptedGuestMove.inputProof);
  await joinTx.wait();
  // Retrieve and decrypt the result
  const encryptedResult = await fherpsContract.encryptedResult(gameId);
  const result = await fhevm.publicDecryptEuint(FhevmType.euint8, encryptedResult);
  return result;
}

describe("FHE Rock Paper Scissors Testing", function () {
  let signers: Signers;
  let fherpsContract: FHERPS;
  let fherpsContractAddress: string;

  const ROCK = 1;
  const PAPER = 2;
  const SCISSORS = 3;

  const NOT_SOLVED = 0;
  const HOST_WINS = 1;
  const GUEST_WINS = 2;
  const DRAW = 3;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
    console.log("Deployer address:", signers.deployer.address);
    console.log("Alice (host) address:", signers.alice.address);
    console.log("Bob (guest) address:", signers.bob.address);
  });

  beforeEach(async () => {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      throw new Error(`This hardhat test suite cannot run on Sepolia Testnet`);
    }
    ({ fherpsContract, fherpsContractAddress } = await deployFixture());
  });

  describe("Unit tests", function () {
    it("should create a game and submit the host's move", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.alice.address)
        .add8(PAPER)
        .encrypt();
      const tx = await fherpsContract
        .connect(signers.alice)
        .createGameAndSubmitMove(encryptedMove.handles[0], encryptedMove.inputProof);
      await tx.wait();
      const game = await fherpsContract.games(0);
      expect(game.gameId).to.eq(0);
    });

    it("should join a game and submit the guest's move", async function () {
      // Host creates a game
      const encryptedHostMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.alice.address)
        .add8(PAPER)
        .encrypt();

      let tx = await fherpsContract
        .connect(signers.alice)
        .createGameAndSubmitMove(encryptedHostMove.handles[0], encryptedHostMove.inputProof);
      await tx.wait();

      // Guest joins the game
      const encryptedGuestMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.bob.address)
        .add8(SCISSORS)
        .encrypt();

      tx = await fherpsContract
        .connect(signers.bob)
        .joinGameAndSubmitMove(0, encryptedGuestMove.handles[0], encryptedGuestMove.inputProof);
      await tx.wait();

      const game = await fherpsContract.games(0);
      expect(game.gameId).to.eq(0);
    });

    it("should not be able to join a non-existent game", async function () {
      const encryptedGuestMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.bob.address)
        .add8(SCISSORS)
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
      // Host creates a game
      const encryptedHostMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.alice.address)
        .add8(PAPER)
        .encrypt();

      let tx = await fherpsContract
        .connect(signers.alice)
        .createGameAndSubmitMove(encryptedHostMove.handles[0], encryptedHostMove.inputProof);
      await tx.wait();

      // Guest joins the game
      const encryptedGuestMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.bob.address)
        .add8(SCISSORS)
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
      const fhevm: HardhatFhevmRuntimeEnvironment = hre.fhevm;

      // Encrypt the host's move
      const encryptedHostMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.alice.address)
        .add8(PAPER)
        .encrypt();
      // Host creates a game and submits their move
      let tx = await fherpsContract
        .connect(signers.alice)
        .createGameAndSubmitMove(encryptedHostMove.handles[0], encryptedHostMove.inputProof);
      await tx.wait();
      // Encrypt the guest's move
      const encryptedGuestMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.bob.address)
        .add8(SCISSORS)
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

  describe("Game Outcomes", function () {
    it("should result in a draw when both players choose the same move (Rock vs Rock)", async function () {
      const resultRock = await playGameAndGetResult(
        ROCK,
        ROCK,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(resultRock).to.eq(DRAW);
    });

    it("should result in a draw when both players choose the same move (Paper vs Paper)", async function () {
      const resultPaper = await playGameAndGetResult(
        PAPER,
        PAPER,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(resultPaper).to.eq(DRAW);
    });

    it("should result in a draw when both players choose the same move (Scissors vs Scissors)", async function () {
      const resultScissors = await playGameAndGetResult(
        SCISSORS,
        SCISSORS,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(resultScissors).to.eq(DRAW);
    });

    it("should result in host winning (Rock vs Scissors)", async function () {
      const result = await playGameAndGetResult(
        ROCK,
        SCISSORS,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(result).to.eq(HOST_WINS);
    });

    // failing
    it("should result in host winning (Paper vs Rock)", async function () {
      const result = await playGameAndGetResult(
        PAPER,
        ROCK,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(result).to.eq(HOST_WINS);
    });

    // failing
    it("should result in host winning (Scissors vs Paper)", async function () {
      const result = await playGameAndGetResult(
        SCISSORS,
        PAPER,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(result).to.eq(HOST_WINS);
    });

    it("should result in guest winning (Scissors vs Rock)", async function () {
      const result = await playGameAndGetResult(
        SCISSORS,
        ROCK,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(result).to.eq(GUEST_WINS);
    });

    it("should result in guest winning (Rock vs Paper)", async function () {
      const result = await playGameAndGetResult(
        ROCK,
        PAPER,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(result).to.eq(GUEST_WINS);
    });

    it("should result in guest winning (Paper vs Scissors)", async function () {
      const result = await playGameAndGetResult(
        PAPER,
        SCISSORS,
        fherpsContract,
        fherpsContractAddress,
        signers.alice,
        signers.bob,
        fhevm,
      );
      expect(result).to.eq(GUEST_WINS);
    });
  });

  describe("Single Player Game", function () {
    it("should create a single player game and it should be solved", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.alice.address)
        .add8(SCISSORS)
        .encrypt();

      const tx = await fherpsContract
        .connect(signers.alice)
        .playSinglePlayerGame(encryptedMove.handles[0], encryptedMove.inputProof);
      await tx.wait();

      const gameId = (await fherpsContract.gameIdCounter()) - 1n;
      const isSolved = await fherpsContract.solved(gameId);
      expect(isSolved).to.equal(true);
    });

    it("should create a single player game and allow host to see their move", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.alice.address)
        .add8(SCISSORS)
        .encrypt();

      const tx = await fherpsContract
        .connect(signers.alice)
        .playSinglePlayerGame(encryptedMove.handles[0], encryptedMove.inputProof);
      await tx.wait();
      const gameId = (await fherpsContract.gameIdCounter()) - 1n;

      const hostMoveEncrypted = await fherpsContract.connect(signers.alice).hostMove(gameId);
      const hostMoveDecrypted = await fhevm.userDecryptEuint(FhevmType.euint8, hostMoveEncrypted, fherpsContractAddress, signers.alice);
      expect(hostMoveDecrypted).to.eq(SCISSORS);
    });

    it("should create a single player game and allow host to see guest(computer) move", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.alice.address)
        .add8(SCISSORS)
        .encrypt();

      const tx = await fherpsContract
        .connect(signers.alice)
        .playSinglePlayerGame(encryptedMove.handles[0], encryptedMove.inputProof);
      await tx.wait();
      const gameId = (await fherpsContract.gameIdCounter()) - 1n;

      const guestMoveEncrypted = await fherpsContract.connect(signers.alice).guestMove(gameId);
      const guestMoveDecrypted = await fhevm.userDecryptEuint(FhevmType.euint8, guestMoveEncrypted, fherpsContractAddress, signers.alice);
      expect(guestMoveDecrypted).to.be.within(1, 3); // Computer move is random 1, 2, or 3
    });

    it("should create a single player game and allow host to see the result", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(fherpsContractAddress, signers.alice.address)
        .add8(SCISSORS)
        .encrypt();

      const tx = await fherpsContract
        .connect(signers.alice)
        .playSinglePlayerGame(encryptedMove.handles[0], encryptedMove.inputProof);
      await tx.wait();
      const gameId = (await fherpsContract.gameIdCounter()) - 1n;

      const encryptedResult = await fherpsContract.encryptedResult(gameId);
      const result = await fhevm.publicDecryptEuint(FhevmType.euint8, encryptedResult);
      expect(result).to.be.within(1, 3); // Result can be 1 (host wins), 2 (guest wins), or 3 (draw)
    });
  });
});