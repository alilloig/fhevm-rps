import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Deploy and Interact Locally (--network localhost)
 * ===========================================================
 *
 * 1. From a separate terminal window, start a local Hardhat node:
 *    npx hardhat node
 *
 * 2. Deploy the FHERPS contract:
 *    npx hardhat --network localhost deploy
 *
 * 3. Get the contract address:
 *    npx hardhat --network localhost task:address
 *
 * 4. Create a game (as the host, using account 0):
 *    npx hardhat --network localhost task:create-game --move 1 --account 0
 *
 * 5. Join a game (as the guest, using account 1):
 *    npx hardhat --network localhost task:join-game --gameid 0 --move 2 --account 1
 *
 * 6. Check the result of the game:
 *    npx hardhat --network localhost task:get-result-and-decrypt --gameid 0 --account 0
 *
 * 7. Verify game details (optional):
 *    npx hardhat --network localhost task:is-solved --gameid 0
 *    npx hardhat --network localhost task:get-host --gameid 0 --account 0
 *    npx hardhat --network localhost task:get-guest --gameid 0 --account 1
 *    npx hardhat --network localhost task:get-host-move --gameid 0 --account 0
 *    npx hardhat --network localhost task:get-guest-move --gameid 0 --account 1
 * 
 * 8, Play a single player game (as the host, using account 0) and verify game details:
 *    npx hardhat --network localhost task:create-single-player-game --move 1 --account 0
 *    npx hardhat --network localhost task:is-solved --gameid 0
 *    npx hardhat --network localhost task:get-result-and-decrypt --gameid 0 --account 0
 *    npx hardhat --network localhost task:get-host --gameid 0 --account 0
 *    npx hardhat --network localhost task:get-guest --gameid 0 --account 0
 *    npx hardhat --network localhost task:get-host-move --gameid 0 --account 0
 *    npx hardhat --network localhost task:get-guest-move --gameid 0 --account 0
 * 
 */

/**
 * Example:
 *   - npx hardhat --network localhost task:address
 *   - npx hardhat --network sepolia task:address
 */
task("task:address", "Prints the FHERPS address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const fheRps = await deployments.get("FHERPS");
  console.log("FHERPS address is " + fheRps.address);
});

task("task:create-game", "Creates a new game")
  .addParam("move", "The move to play (0=rock, 1=paper, 2=scissors)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const move = parseInt(taskArguments.move);
    if (move < 1 || move > 3) {
      throw new Error(`Argument --move is not an integer between 1 and 3 (inclusive). Received: ${taskArguments.move}`);
    }
    await fhevm.initializeCLIApi();
    const FHERPSDeployement = await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployement.address}`);
    const signers = await ethers.getSigners();
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    // Encrypt the value passed as argument
    const encryptedValue = await fhevm
      .createEncryptedInput(FHERPSDeployement.address, signers[0].address)
      .add8(move)
      .encrypt();
    // Call the contract method to create a game and submit the move
    const tx = await fheRpsContract
      .connect(signers[0])
      .createGameAndSubmitMove(encryptedValue.handles[0], encryptedValue.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    // Look for the GameCreated event in the receipt logs
    let gameId;
    if (receipt && receipt.logs) {
      for (const log of receipt.logs) {
        try {
          const event = fheRpsContract.interface.parseLog(log);
          if (event && event.name === "GameCreated") {
            gameId = event.args.gameId;
            console.log(`Evento GameCreated emitido correctamente. gameId: ${gameId}`);
            break;
          }
        } catch {
          // Event not emitted properly
          throw new Error("Error fetching GameCreated event from receipt logs");
        }
      }
    }
    console.log(`FHERPS game ${gameId} created with move ${move}!`);

});

task("task:join-game", "Joins an existing game and submits a move")
  .addParam("gameid", "The ID of the game to join")
  .addParam("move", "The move to play (0=rock, 1=paper, 2=scissors)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const gameId = parseInt(taskArguments.gameid);
    const move = parseInt(taskArguments.move);
    if (move < 1 || move > 3) {
      throw new Error(`Argument --move is not an integer between 1 and 3 (inclusive). Received: ${taskArguments.move}`);
    }
    await fhevm.initializeCLIApi();
    const FHERPSDeployement = await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployement.address}`);
    const signers = await ethers.getSigners();
    const signer = signers[1]; // As per example, guest is account 1
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    // Encrypt the value passed as argument
    const encryptedValue = await fhevm
      .createEncryptedInput(FHERPSDeployement.address, signer.address)
      .add8(move)
      .encrypt();
    // Call the contract method to join a game and submit the move
    const tx = await fheRpsContract
      .connect(signer)
      .joinGameAndSubmitMove(gameId, encryptedValue.handles[0], encryptedValue.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    console.log(`FHERPS game ${gameId} joined with move ${move} by ${signer.address}!`);
  });

task("task:get-result-and-decrypt", "Gets the result of a game and decrypts it on the client side")
  .addParam("gameid", "The ID of the game")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const FHERPSDeployement = await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployement.address}`);
    const signers = await ethers.getSigners();
    const signer = signers[1];
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    const encryptedResult = await fheRpsContract.connect(signer).encryptedResult(taskArguments.gameid);
    if (encryptedResult === ethers.ZeroHash) {
      console.log(`encrypted result: ${encryptedResult}`);
      console.log("clear result    : 0");
      return;
    }
    const clearResult = await fhevm.publicDecryptEuint(
      FhevmType.euint8,
      encryptedResult
    );
    console.log(`Encrypted result: ${encryptedResult}`);
    console.log(`Clear result    : ${clearResult}`);
  });

task("task:is-solved", "Checks if a game is solved")
  .addParam("gameid", "The ID of the game")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const FHERPSDeployement = await deployments.get("FHERPS");
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    const signers = await ethers.getSigners();
    const signer = signers[1];
    const isSolved = await fheRpsContract.connect(signer).solved(taskArguments.gameid);
    console.log(`Game ${taskArguments.gameid} is solved?: ${isSolved}`);
  });

task("task:get-host", "Gets the host of a game")
  .addParam("gameid", "The ID of the game")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const FHERPSDeployement = await deployments.get("FHERPS");
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    const signers = await ethers.getSigners();
    const hostWallet = signers[1];
    const encryptedHost = await fheRpsContract.connect(hostWallet).host(taskArguments.gameid);
    if (encryptedHost === ethers.ZeroAddress) {
      console.log(`Host of game ${taskArguments.gameid} is: 0x0000000000000000000000000000000000000000`);
      return;
    }
    const host = await fhevm.userDecryptEaddress(
      encryptedHost,
      FHERPSDeployement.address,
      hostWallet,
    );
    console.log(`Host of game ${taskArguments.gameid} is: ${host}`);
  });

task("task:get-guest", "Gets the guest of a game")
  .addParam("gameid", "The ID of the game")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const FHERPSDeployement = await deployments.get("FHERPS");
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    const signers = await ethers.getSigners();
    const guestWallet = signers[1];
    const encryptedGuest = await fheRpsContract.connect(guestWallet).guest(taskArguments.gameid);
    if (encryptedGuest === ethers.ZeroAddress) {
      console.log(`Guest of game ${taskArguments.gameid} is: 0x0000000000000000000000000000000000000000`);
      return;
    }
    const guest = await fhevm.userDecryptEaddress(
      encryptedGuest,
      FHERPSDeployement.address,
      guestWallet,
    );
    console.log(`Guest of game ${taskArguments.gameid} is: ${guest}`);
  });

task("task:get-host-move", "Gets the host's move of a game")
  .addParam("gameid", "The ID of the game")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const FHERPSDeployement = await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployement.address}`);
    const signers = await ethers.getSigners();
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    const encryptedMove = await fheRpsContract.hostMove(taskArguments.gameid);
    if (encryptedMove === ethers.ZeroHash) {
      console.log(`encrypted move: ${encryptedMove}`);
      console.log("clear move    : 0");
      return;
    }
    const clearMove = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedMove,
      FHERPSDeployement.address,
      signers[0],
    );
    console.log(`Encrypted move: ${encryptedMove}`);
    console.log(`Clear move    : ${clearMove}`);
  });

task("task:get-guest-move", "Gets the guest's move of a game")
  .addParam("gameid", "The ID of the game")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const FHERPSDeployement = await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployement.address}`);
    const signers = await ethers.getSigners();
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    const encryptedMove = await fheRpsContract.guestMove(taskArguments.gameid);
    if (encryptedMove === ethers.ZeroHash) {
      console.log(`encrypted move: ${encryptedMove}`);
      console.log("clear move    : 0");
      return;
    }
    const clearMove = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedMove,
      FHERPSDeployement.address,
      signers[1], // Guest is account 1
    );
    console.log(`Encrypted move: ${encryptedMove}`);
    console.log(`Clear move    : ${clearMove}`);
  });

task("task:create-single-player-game", "Creates a new single player game")
  .addParam("move", "The move to play (0=rock, 1=paper, 2=scissors)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    const move = parseInt(taskArguments.move);
    if (move < 1 || move > 3) {
      throw new Error(`Argument --move is not an integer between 1 and 3 (inclusive). Received: ${taskArguments.move}`);
    }
    await fhevm.initializeCLIApi();
    const FHERPSDeployement = await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployement.address}`);
    const signers = await ethers.getSigners();
    const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
    // Encrypt the value passed as argument
    const encryptedValue = await fhevm
      .createEncryptedInput(FHERPSDeployement.address, signers[0].address)
      .add8(move)
      .encrypt();
    // Call the contract method to create a game and submit the move
    const tx = await fheRpsContract
      .connect(signers[0])
      .playSinglePlayerGame(encryptedValue.handles[0], encryptedValue.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
    // Look for the GameCreated event in the receipt logs
    let gameId;
    if (receipt && receipt.logs) {
      for (const log of receipt.logs) {
        try {
          const event = fheRpsContract.interface.parseLog(log);
          if (event && event.name === "GameCreated") {
            gameId = event.args.gameId;
            console.log(`Evento GameCreated emitido correctamente. gameId: ${gameId}`);
            break;
          }
        } catch {
          // Event not emitted properly
          throw new Error("Error fetching GameCreated event from receipt logs");
        }
      }
    }
    console.log(`FHERPS single player game ${gameId} created with move ${move}!`);
  });