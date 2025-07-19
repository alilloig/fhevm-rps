# FHEVM Rock Paper Scissors

An FHEVM RPS Solidity implementation allowing players to play Rock-Paper-Scissors games privately.

## Considerations

The following guidelines have been followed when designing the smart contract:

1. Players' addresses and moves will be kept encrypted for everyone except themselves.
2. For HCU optimization reasons, plays will be encoded as an `euint8` as follows:

   - 🪨 : 1
   - 🧻 : 2
   - ✂️ : 3

   It is the dApp developer's responsibility to ensure that the values passed to the smart contract are within this
   range. Instead of performing a sanity check on the passed `euint8`, which would be expensive HCU-wise, the smart
   contract will adjust any value outside the range to match the expected values.

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
