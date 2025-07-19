// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    FHE,
    eaddress,
    ebool,
    euint8,
    euint16,
    externalEaddress,
    externalEbool,
    externalEuint8
} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title RPS game on FHEVM
contract FHERPS is SepoliaConfig {
    // Events
    event GameCreated(uint256 gameId);
    event GameSolved(uint256 gameId);

    // Custom errors
    error GameNotFound(uint256 gameId);
    error UnauthorizedHostAddress(uint256 gameId);
    error UnauthorizedHostMove(uint256 gameId);
    error UnauthorizedGuestAddress(uint256 gameId);
    error UnauthorizedGuestMove(uint256 gameId);
    error GameNotSolved(uint256 gameId);
    error GameAlreadySolved(uint256 gameId);

    // Game struct
    struct Game {
        uint256 gameId;
        eaddress host; // Host player address
        eaddress guest; // Guest player address
        euint8 hostMove;
        euint8 guestMove; // Guest move, initially empty
        euint8 encryptedResult; // 0: not played yet, 1: host wins, 2: guest wins, 3: draw
        bool solved; // Flag to indicate if the game has been solved
    }

    // State variables
    uint256 public gameIdCounter;
    mapping(uint256 => Game) public games;

    // Bitwise mask constant for host winning plays
    euint16 internal HOST_WINNING_MASK;

    // Constructor to initialize the gameIdCounter and HOST_WINNING_MASK
    constructor() {
        gameIdCounter = 0;
        // Mask with winning plays (7: RockScissors, 9: PaperRock, 14: ScissorsPaper)
        // bit positions set at 1 (0100001010000000)
        HOST_WINNING_MASK = FHE.asEuint16(17024);
        FHE.allowThis(HOST_WINNING_MASK); // Allow the contract to operate on the HOST_WINNING_MASK
    }

    /// @notice Get the address of the game host
    /// @param gameId The ID of the game to retrieve the host address for
    /// @dev Only the host can access its address.
    ///      Hosts can use this function to verify game integrity.
    /// @return The encrypted address of the host player
    function host(uint256 gameId) external view returns (eaddress) {
        if (games[gameId].gameId != gameId) revert GameNotFound(gameId);
        if (!FHE.isSenderAllowed(games[gameId].host)) revert UnauthorizedHostAddress(gameId);
        return games[gameId].host;
    }

    /// @notice Get the host's move in the game
    /// @param gameId The ID of the game to retrieve the host's move for
    /// @dev Only the host can access its move.
    ///      Hosts can use this function to verify their own move was submitted right.
    /// @return The encrypted move of the host player
    function hostMove(uint256 gameId) external view returns (euint8) {
        if (!(games[gameId].gameId == gameId)) revert GameNotFound(gameId);
        if (!FHE.isSenderAllowed(games[gameId].hostMove)) revert UnauthorizedHostMove(gameId);
        return games[gameId].hostMove;
    }

    /// @notice Get the address of the game guest
    /// @param gameId The ID of the game to retrieve the guest address for
    /// @dev Only the guest can access its address.
    ///      Guests can use this function to verify game integrity.
    /// @return The encrypted address of the guest player
    function guest(uint256 gameId) external view returns (eaddress) {
        if (games[gameId].gameId != gameId) revert GameNotFound(gameId);
        if (!FHE.isSenderAllowed(games[gameId].guest)) revert UnauthorizedGuestAddress(gameId);
        return games[gameId].guest;
    }

    /// @notice Get the guest's move in the game
    /// @param gameId The ID of the game to retrieve the guest's move for
    /// @dev Only the guest can access its move.
    ///      Guests can use this function to verify their own move was submitted right.
    /// @return The encrypted move of the guest player
    function guestMove(uint256 gameId) external view returns (euint8) {
        if (games[gameId].gameId != gameId) revert GameNotFound(gameId);
        if (!FHE.isSenderAllowed(games[gameId].guestMove)) revert UnauthorizedGuestMove(gameId);
        return games[gameId].guestMove;
    }

    /// @notice Get the encrypted result of the game
    /// @param gameId The ID of the game to retrieve the result for
    /// @dev The result is encrypted and can be decrypted by anyone who once the guest
    /// has submitted their move.
    /// The result is 0 if the game is not played yet, 1 if the host wins, 2 if the
    /// guest wins, and 3 if it's a draw.
    function encryptedResult(uint256 gameId) external view returns (euint8) {
        if (games[gameId].gameId != gameId) revert GameNotFound(gameId);
        if (!games[gameId].solved) revert GameNotSolved(gameId);
        return games[gameId].encryptedResult;
    }

    /// @notice Check if the game has been solved
    /// @param gameId The ID of the game to check
    /// @dev This function allows anyone to check if a game has been solved.
    /// @return true if the game has been solved, false otherwise
    function solved(uint256 gameId) external view returns (bool) {
        if (games[gameId].gameId != gameId) revert GameNotFound(gameId);
        return games[gameId].solved;
    }

    /// @notice Create a new game and submit the host's move
    /// @param encryptedMove The encrypted move of the host player
    /// @param inputProof The proof of the encrypted move
    /// @dev The host's move is validated by the client, ensuring it is a valid move
    /// (0, 1, or 2) by doing a bitwise AND with 0b11
    /// @dev The game is created with the host's address and move, and the guest's
    /// address and move are initially empty
    /// @dev The game result is initially set to 0 (not played yet)
    /// @dev The contract allows itself to operate on the Game's encrypted fields
    /// @dev The gameIdCounter is incremented after creating the game
    /// @dev Emits a GameCreated event with the gameId
    function createGameAndSubmitMove(externalEuint8 encryptedMove, bytes calldata inputProof) external {
        // Get the game ID
        uint256 gameId = gameIdCounter;
        // Get the encrypted move from the external input
        euint8 move = FHE.fromExternal(encryptedMove, inputProof);
        // To avoid unnecessary HCU calls, we delegate the move validation to clients,
        // doing a bitwise AND 0x00000011 to the move to enforce that it is a valid move value
        move = FHE.and(move, FHE.asEuint8(3));
        // Create the game instance
        games[gameId] = Game({
            gameId: gameId,
            host: FHE.asEaddress(msg.sender),
            guest: FHE.asEaddress(address(0)), // Guest is initially empty
            hostMove: move,
            guestMove: FHE.asEuint8(0), // Guest move is initially empty
            encryptedResult: FHE.asEuint8(0), // 0: not played yet, 1: host wins, 2: guest wins, 3: draw
            solved: false
        });
        // Allow the contract to operate on the Game's encrypted fields
        FHE.allowThis(games[gameId].host);
        FHE.allow(games[gameId].host, msg.sender);
        FHE.allowThis(games[gameId].guest);
        FHE.allowThis(games[gameId].hostMove);
        FHE.allow(games[gameId].hostMove, msg.sender);
        FHE.allowThis(games[gameId].guestMove);
        FHE.allowThis(games[gameId].encryptedResult);
        // Increment gameIdCounter
        gameIdCounter++;
        // Emit event with gameId
        emit GameCreated(gameId);
    }

    /// @notice Join a game and submit the guest's move
    /// @param gameId The ID of the game to join
    /// @param encryptedMove The encrypted move of the guest player
    /// @param inputProof The proof of the encrypted move
    /// @dev The guest's move is validated by the client, ensuring it is a valid move
    /// (0, 1, or 2) by doing a bitwise AND with 0b11
    /// @dev The game is updated with the guest's address and move
    /// @dev The game result is calculated based on both moves, and the encrypted result is stored
    /// @dev The contract allows itself to operate on the Game's encrypted fields
    /// @dev The guest player is allowed to check on their own address and move
    /// @dev The game result is made publicly decryptable
    /// @dev Emits a GameSolved event with the gameId
    function joinGameAndSubmitMove(uint256 gameId, externalEuint8 encryptedMove, bytes calldata inputProof) external {
        // Check if game exists
        if (games[gameId].gameId != gameId) revert GameNotFound(gameId);
        // Check if the game has been already solved
        if (games[gameId].solved) revert GameAlreadySolved(gameId);
        // Mark the game as solved
        games[gameId].solved = true;
        // Set the guest player to the sender's address
        games[gameId].guest = FHE.asEaddress(msg.sender);
        // Get the encrypted move from the external input
        euint8 move = FHE.fromExternal(encryptedMove, inputProof);
        // To avoid unnecessary HCU calls, we delegate the move validation to clients,
        // doing a bitwise AND 0b11 to the move to enforce it is a valid move value
        move = FHE.and(move, FHE.asEuint8(3));
        // Store the guest move in the game
        games[gameId].guestMove = move;
        // Check if both moves are equal, so game is a draw
        ebool draw = FHE.eq(move, games[gameId].hostMove);
        // Pack both moves into a single euint16
        // The first 2 bits are the host initial move, the last 2 bits are the guest freshly submitted move
        euint8 packedMoves = FHE.shl(games[gameId].hostMove, FHE.asEuint8(2));
        packedMoves = FHE.or(packedMoves, move);
        // Get the game result by applying the GUEST_WINNING_MASK to 1 shifted packed moves times left
        euint16 gameResult = FHE.and(HOST_WINNING_MASK, FHE.asEuint16(FHE.shl(FHE.asEuint8(1), packedMoves)));
        // If the result is different than 0, the host wins
        ebool hostWins = FHE.ne(gameResult, FHE.asEuint16(0));
        // Set the game result
        games[gameId].encryptedResult = FHE.select(hostWins, FHE.asEuint8(1), FHE.asEuint8(2));
        // If the game was a draw, we overwrite the encryptedResult with 0, otherwise we keep the value
        games[gameId].encryptedResult = FHE.select(draw, FHE.asEuint8(0), games[gameId].encryptedResult);
        // Allow the contract to operate on the updated fields
        FHE.allowThis(games[gameId].guest);
        FHE.allowThis(games[gameId].guestMove);
        // Allow the guest player to check on their own address and move
        FHE.allow(games[gameId].guest, msg.sender);
        FHE.allow(games[gameId].guestMove, msg.sender);
        // Allow anyone to decrypt the game result
        FHE.allowThis(games[gameId].encryptedResult);
        FHE.makePubliclyDecryptable(games[gameId].encryptedResult);
        // Emit event with gameId
        emit GameSolved(gameId);
    }

    /*function playSinglePlayerGame(externalEuint8 encryptedMove, bytes calldata inputProof) external {
        uint256 gameId = gameIdCounter;
        eaddress host = FHE.asEaddress(msg.sender);
        // create the game instance
        // Increment gameIdCounter
        gameIdCounter++;
    }*/
}
