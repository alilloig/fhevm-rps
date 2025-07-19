# FHEVM Rock Paper Scissors

An FHEVM RPS Solidity implementation that allows players to play Rock-Paper-Scissors games privately.

## Considerations

The following guidelines were followed when designing the smart contract:

1. Players' addresses and moves are kept encrypted and are only accessible to themselves.
2. For HCU optimization, plays are encoded as an `euint8` as follows:

   - 🪨 : 1
   - 🧻 : 2
   - ✂️ : 3

   It is the dApp developer's responsibility to ensure that the values passed to the smart contract are within this range. Instead of performing a validity check on the provided `euint8` (which would be expensive in terms of HCU), the smart contract will automatically adjust any value outside the range to match the expected values.

3. When the game is marked as solved, the game result can be decrypted by anyone on the client side. The game result is
   encoded as an `euint8` value following this format:
   - 0: game not solved yet
   - 1: host wins
   - 2: guest wins
   - 3: draw

## Game Flow

Any user on the chain can create a new Rock-Paper-Scissors game. While creating the game, the user must include their
play in the transaction. The play and the host address will be stored encrypted in a `Game` struct in the contract. When
a game is created, a `GameCreated` event is emitted, including the `gameId` of the newly created game.

Any user can also join an already created game by passing its `gameId` to the smart contract. The guest player must
submit their play in the joining transaction as well. Then, the game outcome will be calculated and stored in the `Game`
struct, encrypted, making the result publicly decryptable.

Finally, anyone can query the `encryptedResult` for a certain `gameId` that has been marked as `gameSolved` and decrypt
it on the client side.

## Technical Implementation Details

To avoid unnecessary HCU costs, the algorithm for game resolution has been implemented using bitwise operations,
allowing for cheaper computations. When both plays are received by the smart contract, it first checks if they are the
same, resulting in a draw. Then, it packs the binary representation of both moves into a single `euint8` variable. For
instance, if the host played 🧻 (`0010`) and the guest played ✂️ (`0011`), the packed moves will equal `1011`, obtained
by shifting 🧻 two positions to the right and adding ✂️ in the last two bits. This results in a matrix of 9 possible
game outcomes, with their decimal values being (`7`, `9`, `14`) for the host winning and (`6`, `11`, `13`) for the guest
winning. To resolve the game, a boolean `AND` operation is performed on an `euint16` variable with its 7th, 9th, and
14th bits set to one (equivalent to the decimal number 17024) and another `euint16` variable with only the bit
corresponding to its packed move set to 1. If the result of this operation is `0`, the host won; otherwise, the guest
won the game.

## dApp Integration Guide

Developers building decentralized applications (dApps) on top of the `FHERPS` smart contract should consider the following:

1.  **Input Validation is Crucial:** The smart contract intentionally skips move validation (checking if the input is 1, 2, or 3) to save on HCU costs. This means your dApp **must** validate user input *before* encrypting it and sending it to the contract. If an invalid value is submitted, the contract will not revert, but the game logic will produce an incorrect result.

2.  **Asynchronous Game Flow and Event Handling:** The contract's functions do not return values like the `gameId`. Your dApp must listen for events to manage the game flow:
    *   **`GameCreated` Event:** After a user creates a game, your dApp needs to listen for the `GameCreated` event to retrieve the `gameId`. This ID is essential for the second player to join.
    *   **Game State:** To show users a list of open games, your dApp will need to build and maintain its own state. You can do this by listening to contract events from its deployment block onwards. A `GameCreated` event indicates a new open game, and a subsequent `GameSolved` (or similar) event would indicate the game is finished.

3.  **Decrypting Game Results:** The game result is stored as an encrypted `euint8`. Your dApp will need to call the `encryptedResult(gameId)` view function and then use the `fhevm.publicDecryptEuint` method to decrypt the value on the client side, as shown in the usage examples.

4.  **User Experience (UX) for Sharing Games:** Since the `gameId` is the key to joining a game, your dApp should provide a simple way for the host player to share the game with a friend, for example, by generating a shareable link like `https://your-dapp.com/play?gameId=123`.

## Usage examples

Here are some examples of how to interact with the `FHERPS` smart contract using TypeScript and `ethers.js`.

### 1. Deploying the Contract

First, you need to get the contract factory and deploy it.

```typescript
import { ethers } from "hardhat";
import { FHERPS, FHERPS__factory } from "../types";

async function deploy() {
  const factory = (await ethers.getContractFactory("FHERPS")) as FHERPS__factory;
  const fherpsContract = (await factory.deploy()) as FHERPS;
  const fherpsContractAddress = await fherpsContract.getAddress();
  console.log(`FHERPS contract deployed at: ${fherpsContractAddress}`);
  return { fherpsContract, fherpsContractAddress };
}
```

### 2. Creating a Game

To create a game, a player (the "host") needs to encrypt their move and submit it to the `createGameAndSubmitMove` function.

```typescript
import { fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

async function createGame(
  fherpsContract: FHERPS,
  fherpsContractAddress: string,
  hostSigner: HardhatEthersSigner
) {
  const hostMove = 1; // 1: Rock, 2: Paper, 3: Scissors

  // Encrypt the host's move
  const encryptedMove = await fhevm
    .createEncryptedInput(fherpsContractAddress, hostSigner.address)
    .add8(hostMove)
    .encrypt();

  // Create the game and submit the move
  const tx = await fherpsContract
    .connect(hostSigner)
    .createGameAndSubmitMove(encryptedMove.handles[0], encryptedMove.inputProof);
  
  // Wait for the transaction to be mined and get the receipt
  const receipt = await tx.wait();

  // Find the GameCreated event to get the gameId
  let gameId;
  if (receipt.logs) {
      const event = fherpsContract.interface.parseLog(receipt.logs[0]);
      if (event && event.name === "GameCreated") {
        gameId = event.args.gameId;
        console.log(`Game created with ID: ${gameId}`);
      }
  }
  return gameId;
}
```

### 3. Joining a Game

Another player (the "guest") can join an existing game by providing the `gameId`. They also need to encrypt and submit their move.

```typescript
import { fhevm } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

async function joinGame(
  fherpsContract: FHERPS,
  fherpsContractAddress: string,
  guestSigner: HardhatEthersSigner,
  gameId: number
) {
  const guestMove = 2; // 1: Rock, 2: Paper, 3: Scissors

  // Encrypt the guest's move
  const encryptedGuestMove = await fhevm
    .createEncryptedInput(fherpsContractAddress, guestSigner.address)
    .add8(guestMove)
    .encrypt();

  // Join the game and submit the move
  const tx = await fherpsContract
    .connect(guestSigner)
    .joinGameAndSubmitMove(gameId, encryptedGuestMove.handles[0], encryptedGuestMove.inputProof);
  await tx.wait();
  console.log(`Player ${guestSigner.address} joined game ${gameId}`);
}
```

### 4. Checking the Game Result

Once both players have submitted their moves, anyone can retrieve the encrypted result and decrypt it publicly.

```typescript
import { FhevmType, HardhatFhevmRuntimeEnvironment } from "@fhevm/hardhat-plugin";
import * as hre from "hardhat";

async function checkResult(fherpsContract: FHERPS, gameId: number) {
  const fhevm: HardhatFhevmRuntimeEnvironment = hre.fhevm;

  // Retrieve the encrypted result from the contract
  const encryptedResult = await fherpsContract.encryptedResult(gameId);

  // Decrypt the result
  const result = await fhevm.publicDecryptEuint(
      FhevmType.euint8,
      encryptedResult
  );

  // 0: not solved, 1: host wins, 2: guest wins, 3: draw
  console.log(`Game ${gameId} result: ${result}`);
  return result;
}
```

[![GitBook](https://img.shields.io/static/v1?message=Documented%20on%20GitBook&logo=gitbook&logoColor=ffffff&label=%20&labelColor=5c5c5c&color=3F89A1)](https://www.gitbook.com/preview?utm_source=gitbook_readme_badge&utm_medium=organic&utm_campaign=preview_documentation&utm_content=link)