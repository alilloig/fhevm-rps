# FHEVM Rock Paper Scissors

A [Zama's FHEVM](https://docs.zama.ai/protocol/solidity-guides/getting-started/overview) RPS Solidity implementation that allows players to play Rock-Paper-Scissors games privately.

## Considerations

The following guidelines were followed when designing the smart contract:

1. Players' addresses and moves are kept encrypted and are only accessible to themselves.
2. For HCU optimization, plays are encoded as an `euint8` as follows:

   - 🪨 : 1
   - 🧻 : 2
   - ✂️ : 3

   It is the dApp developer's responsibility to ensure that the values passed to the smart contract are within this
   range. Instead of performing a validity check on the provided `euint8` (which would be expensive in terms of HCU),
   the smart contract will automatically adjust any value outside the range to match the expected values.

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

| Host Move    | Guest Move   | Packed Value (Binary) | Packed Value (Decimal) | Outcome    |
| ------------ | ------------ | --------------------- | ---------------------- | ---------- |
| Rock (1)     | Rock (1)     | 0101                  | 5                      | Draw       |
| Rock (1)     | Paper (2)    | 0110                  | 6                      | Guest Wins |
| Rock (1)     | Scissors (3) | 0111                  | 7                      | Host Wins  |
| Paper (2)    | Rock (1)     | 1001                  | 9                      | Host Wins  |
| Paper (2)    | Paper (2)    | 1010                  | 10                     | Draw       |
| Paper (2)    | Scissors (3) | 1011                  | 11                     | Guest Wins |
| Scissors (3) | Rock (1)     | 1101                  | 13                     | Guest Wins |
| Scissors (3) | Paper (2)    | 1110                  | 14                     | Host Wins  |
| Scissors (3) | Scissors (3) | 1111                  | 15                     | Draw       |

## dApp Integration Guide

Developers building decentralized applications (dApps) on top of the `FHERPS` smart contract should consider the
following:

{% hint style="danger" %}
**Input Validation is Crucial:** The smart contract intentionally skips move validation (checking if the input is 1, 2, or 3) to save on HCU costs. This means your dApp **must** validate user input _before_ encrypting it and sending it to the contract. If an invalid value is submitted, the contract will not revert, but the game logic will produce an incorrect result.
{% endhint %}

{% hint style="info" %}
**Asynchronous and Anonymous Game Flow:** The contract is designed for anonymous gameplay. A user can create a game without revealing their identity, and any other user can join an existing game. To manage this, your dApp should:

*   **Track `GameCreated` Events:** Listen for `GameCreated` events to build a list of available games for users to join.
*   **Track `GameSolved` Events:** Listen for `GameSolved` events to remove games from the available list.
*   **Check Game Status:** Before a user attempts to join a game, use the `solved(gameId)` function to ensure it hasn't already been taken by another player.
{% endhint %}

{% hint style="info" %}
**Decrypting Game Results:** The game result is stored as an encrypted `euint8`. Your dApp will need to call the `encryptedResult(gameId)` view function and then use the `fhevm.publicDecryptEuint` method to decrypt the value on the client side, as shown in the usage examples.
{% endhint %}

{% hint style="success" %}
**User Experience for Anonymous Play:** Since the gameplay is anonymous, your dApp should focus on providing a seamless experience for discovering and joining open games. The core user interaction should be browsing a list of available games and joining one.
{% endhint %}

## Usage examples

This section provides examples of how to interact with the `FHERPS` smart contract using the provided Hardhat tasks.

### 1. Deploying the Contract

First, you need to deploy the contract to your network of choice (e.g., `localhost` for local testing or `sepolia` for the testnet).

```bash
npx hardhat deploy --network localhost
```

Once deployed, you can retrieve the contract address using the `task:address` task:

```bash
npx hardhat task:address --network localhost
# Output: FHERPS address is 0x...
```

### 2. Creating a Game

To create a new game, a user (the "host") must submit their move (1 for Rock, 2 for Paper, 3 for Scissors). The task `task:create-game` handles the encryption of the move and sends it to the contract.

**Command:**

```bash
# Replace --move 1 with 2 (Paper) or 3 (Scissors) as desired.
npx hardhat task:create-game --move 1 --network localhost
```

The task will output the `gameId` of the newly created game, which is needed for other players to join.

**Code Snippet from `tasks/FHERPS.ts`:**

This is how the move is encrypted and the `createGameAndSubmitMove` function is called.

```typescript
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, deployments, fhevm } from "hardhat";

// Assume contract, signers, and move are already initialized
const FHERPSDeployement = await deployments.get("FHERPS");
const signers = await ethers.getSigners();
const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
const move = 1; // Example move: Rock

// Encrypt the move for the host (signer[0])
const encryptedValue = await fhevm
  .createEncryptedInput(FHERPSDeployement.address, signers[0].address)
  .add8(move)
  .encrypt();

// Call the contract to create the game
const tx = await fheRpsContract
  .connect(signers[0])
  .createGameAndSubmitMove(encryptedValue.handles[0], encryptedValue.inputProof);

// The contract will emit a 'GameCreated' event with the gameId
```

### 3. Joining a Game

Another user (the "guest") can join an existing game using its `gameId`. They also submit their encrypted move.

**Command:**

```bash
# Replace --gameid 0 with the actual gameId.
# Replace --move 2 with the guest's move.
npx hardhat task:join-game --gameid 0 --move 2 --network localhost
```

**Code Snippet from `tasks/FHERPS.ts`:**

The guest's move is encrypted and sent to the `joinGameAndSubmitMove` function.

```typescript
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, deployments, fhevm } from "hardhat";

// Assume contract, signers, gameId, and move are initialized
const FHERPSDeployement = await deployments.get("FHERPS");
const signers = await ethers.getSigners();
const guestSigner = signers[1]; // Assuming the guest is the second account
const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
const gameId = 0;
const move = 2; // Example move: Paper

// Encrypt the move for the guest
const encryptedValue = await fhevm
  .createEncryptedInput(FHERPSDeployement.address, guestSigner.address)
  .add8(move)
  .encrypt();

// Call the contract to join the game
const tx = await fheRpsContract
  .connect(guestSigner)
  .joinGameAndSubmitMove(gameId, encryptedValue.handles[0], encryptedValue.inputProof);
```

### 4. Checking the Game Result

Once a guest joins a game, the result is calculated and stored encrypted in the contract. Anyone can query this encrypted result and decrypt it on the client-side.

**Command:**

```bash
npx hardhat task:get-result-and-decrypt --gameid 0 --network localhost
```

The task will output the encrypted result and the decrypted "clear" result (1 for host wins, 2 for guest wins, 3 for a draw).

**Code Snippet from `tasks/FHERPS.ts`:**

This shows how to fetch the encrypted result and decrypt it.

```typescript
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, deployments, fhevm } from "hardhat";

// Assume contract, gameId are initialized
const FHERPSDeployement = await deployments.get("FHERPS");
const fheRpsContract = await ethers.getContractAt("FHERPS", FHERPSDeployement.address);
const gameId = 0;

// Get the encrypted result from the contract
const encryptedResult = await fheRpsContract.encryptedResult(gameId);

// Decrypt the result publicly
const clearResult = await fhevm.publicDecryptEuint(
  FhevmType.euint8,
  encryptedResult
);

console.log(`Game ${gameId} result: ${clearResult}`);
```
