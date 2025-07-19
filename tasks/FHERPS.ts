import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Deploy and Interact Locally (--network localhost)
 * ===========================================================
 *
 * 1. From a separate terminal window:
 *
 *   npx hardhat node
 *
 * 2. Deploy the FHERPS contract
 *
 *   npx hardhat --network localhost deploy
 *
 * 3. Interact with the FHERPS contract
 *
 *   npx hardhat --network localhost task:address
 *   npx hardhat --network localhost task:create-game --move 1
 *   npx hardhat --network localhost task:join-game --gameid 1 --move 2
 *   npx hardhat --network localhost task:address
 *
 *
 * Tutorial: Deploy and Interact on Sepolia (--network sepolia)
 * ===========================================================
 *
 * 1. Deploy the FHECounter contract
 *
 *   npx hardhat --network sepolia deploy
 *
 * 2. Interact with the FHECounter contract
 *
 *   npx hardhat --network sepolia task:decrypt-count
 *   npx hardhat --network sepolia task:increment --value 2
 *   npx hardhat --network sepolia task:decrement --value 1
 *   npx hardhat --network sepolia task:decrypt-count
 *
 */

/**
 * Example:
 *   - npx hardhat --network localhost task:address
 *   - npx hardhat --network sepolia task:address
 */
task("task:address", "Prints the FHERPS address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const fherps = await deployments.get("FHERPS");

  console.log("FHERPS address is " + fherps.address);
});

/**
 * Task to create a new game and submit the host's move
 */
task("task:create-game", "Creates a new game and submits the host's move")
  .addParam("move", "The host's move (0, 1, or 2)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const move = parseInt(taskArguments.move);
    if (![0, 1, 2].includes(move)) {
      throw new Error(`Invalid move. Must be 0, 1, or 2.`);
    }

    await fhevm.initializeCLIApi();

    const FHERPSDeployment = await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployment.address}`);

    const signers = await ethers.getSigners();

    const fherpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployment.address);

    const encryptedMove = await fhevm
      .createEncryptedInput(FHERPSDeployment.address, signers[0].address)
      .add8(move)
      .encrypt();

    const tx = await fherpsContract.createGameAndSubmitMove(encryptedMove.handles[0], encryptedMove.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log(`Game created successfully!`);
  });

/**
 * Task to join an existing game and submit the guest's move
 */
task("task:join-game", "Joins a game and submits the guest's move")
  .addParam("gameid", "The ID of the game to join")
  .addParam("move", "The guest's move (0, 1, or 2)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const gameId = parseInt(taskArguments.gameid);
    const move = parseInt(taskArguments.move);
    if (![0, 1, 2].includes(move)) {
      throw new Error(`Invalid move. Must be 0, 1, or 2.`);
    }

    await fhevm.initializeCLIApi();

    const FHERPSDeployment = await deployments.get("FHERPS");
    console.log(`FHERPS: ${FHERPSDeployment.address}`);

    const signers = await ethers.getSigners();

    const fherpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployment.address);

    const encryptedMove = await fhevm
      .createEncryptedInput(FHERPSDeployment.address, signers[0].address)
      .add8(move)
      .encrypt();

    const tx = await fherpsContract.joinGameAndSubmitMove(gameId, encryptedMove.handles[0], encryptedMove.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log(`Joined game successfully!`);
  });
