(function attachGameValidation(root, factory) {
  const constants = typeof module === "object" && module.exports ? require("./constants.js") : root.WizardConstants;
  const api = factory(constants);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardGameValidation = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createGameValidationModule(Constants) {
  "use strict";

  const { GAME_STATUS, ROUND_PHASE } = Constants;
  const MAX_FUTURE_TIMESTAMP_SKEW_MS = 24 * 60 * 60 * 1000;

  function createGameValidation({
    MIN_PLAYERS,
    MAX_PLAYERS,
    TOTAL_CARDS,
    getStandardRounds,
    getMaximumRounds,
    getDealerForRound,
    getStartingPlayerForRound,
    createRound,
    isBidSumValid,
    getSpecialCardErrors,
    recalculateCurrentBids,
    validateTrickSum,
    calculatePoints
  }) {
    // Imports must be complete; local saves may capture an in-progress Witch selection.
    function validateImportedGameState(candidate) {
      return validateGameState(candidate, { allowIncompleteWitchSelection: false });
    }

    function validatePersistableGameState(candidate) {
      return validateGameState(candidate, { allowIncompleteWitchSelection: true });
    }

    function hasOwn(object, key) {
      return Object.prototype.hasOwnProperty.call(object, key);
    }

    function isValidStateId(value) {
      return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value);
    }

    function isValidDateString(value) {
      if (typeof value !== "string") return false;

      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && date.toISOString() === value;
    }

    function validateGameState(candidate, options) {
      const errors = [];
      const allowedStatuses = new Set(Object.values(GAME_STATUS));
      const allowedPhases = new Set(Object.values(ROUND_PHASE));

      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return ["The file does not contain a valid game state."];
      }

      if (candidate.version !== "1.0") {
        errors.push("The file is not a valid Wizard game state for version 1.0.");
      }

      if (candidate.schemaVersion !== 4) {
        errors.push("The game state does not use the current schema version 4.");
      }

      if (!isValidStateId(candidate.gameId)) {
        errors.push("The game ID is missing or invalid.");
      }

      if (!isValidDateString(candidate.updatedAt)) {
        errors.push("The game does not have a valid last-updated date.");
      } else if (Date.parse(candidate.updatedAt) > Date.now() + MAX_FUTURE_TIMESTAMP_SKEW_MS) {
        errors.push("The game's last-updated date is implausibly far in the future.");
      }

      const players = Array.isArray(candidate.players) ? candidate.players : [];
      if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
        errors.push(`The game state must contain between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
        return errors;
      }

      const playerIds = [];
      players.forEach((player, index) => {
        const id = player?.id;
        if (!isValidStateId(id)) {
          errors.push(`Player ${index + 1} does not have a valid ID.`);
        } else {
          playerIds.push(id);
        }

        if (
          typeof player?.name !== "string" ||
          player.name.length > 30 ||
          (candidate.status !== GAME_STATUS.SETUP && !player.name.trim())
        ) {
          errors.push(`Player ${index + 1} does not have a valid name.`);
        }

        if (!Number.isInteger(player?.seatPosition) || player.seatPosition !== index) {
          errors.push("The players' seating order is ambiguous.");
        }
      });

      if (playerIds.length !== players.length) return errors;

      const playerIdSet = new Set(playerIds);
      if (playerIdSet.size !== playerIds.length) {
        errors.push("Player IDs must be unique.");
        return errors;
      }

      if (!allowedStatuses.has(candidate.status)) {
        errors.push("The game status is invalid.");
      }

      if (!playerIdSet.has(candidate.firstDealerId)) {
        errors.push("The dealer is invalid.");
      }

      if (!["full", "individual"].includes(candidate.roundMode)) {
        errors.push("The round mode is invalid.");
      }

      const maximumRounds = getMaximumRounds(players.length, TOTAL_CARDS);
      if (
        !Number.isInteger(candidate.totalRounds) ||
        candidate.totalRounds < 1 ||
        candidate.totalRounds > maximumRounds
      ) {
        errors.push(`The number of rounds must be between 1 and ${maximumRounds}.`);
      } else if (candidate.roundMode === "full" && candidate.totalRounds !== getStandardRounds(players.length)) {
        errors.push("The number of rounds does not match the selected full game.");
      }

      if (
        !Number.isInteger(candidate.currentRound) ||
        !Number.isInteger(candidate.totalRounds) ||
        candidate.currentRound < 1 ||
        candidate.currentRound > candidate.totalRounds
      ) {
        errors.push("The current round is invalid.");
      }

      if (candidate.totalCards !== TOTAL_CARDS) {
        errors.push(`The game state must be based on ${TOTAL_CARDS} cards.`);
      }

      if (typeof candidate.setupDealerRandomized !== "boolean") {
        errors.push("The dealer-selection status is missing or invalid.");
      }

      if (candidate.status !== GAME_STATUS.SETUP && candidate.setupDealerRandomized !== true) {
        errors.push("A dealer must be set for a started game.");
      }

      if (typeof candidate.roundOneHintConfirmed !== "boolean") {
        errors.push("The first-round confirmation status is missing or invalid.");
      }

      const rounds = Array.isArray(candidate.rounds) ? candidate.rounds : null;
      if (!rounds) {
        errors.push("The game state's rounds are missing.");
        return errors;
      }

      const seenRoundNumbers = new Set();
      const validatedRounds = [];

      for (const rawRound of rounds) {
        const roundNumber = rawRound?.number;
        if (
          !Number.isInteger(roundNumber) ||
          !Number.isInteger(candidate.totalRounds) ||
          roundNumber < 1 ||
          roundNumber > candidate.totalRounds
        ) {
          errors.push("At least one round number is invalid.");
          continue;
        }

        if (seenRoundNumbers.has(roundNumber)) {
          errors.push(`Round ${roundNumber} occurs more than once.`);
          continue;
        }
        seenRoundNumbers.add(roundNumber);

        if (!allowedPhases.has(rawRound.phase)) {
          errors.push(`Round ${roundNumber} has an invalid phase.`);
        }

        if (typeof rawRound.completed !== "boolean") {
          errors.push(`Round ${roundNumber} does not have an unambiguous completion status.`);
        }
        if (!hasOwn(rawRound, "completedAt")) {
          errors.push(`Round ${roundNumber} does not contain its completion date field.`);
        }

        const expectedDealer = getDealerForRound(players, candidate.firstDealerId, roundNumber);
        const expectedStarter = getStartingPlayerForRound(players, candidate.firstDealerId, roundNumber);
        if (rawRound.dealerId !== expectedDealer?.id) {
          errors.push(`The dealer in round ${roundNumber} is invalid.`);
        }
        if (rawRound.startingPlayerId !== expectedStarter?.id) {
          errors.push(`The starting player in round ${roundNumber} is invalid.`);
        }

        const specialCards = validateImportedSpecialCards(rawRound.specialCards, players, roundNumber, errors);
        const playerResults = validateImportedPlayerResults(
          rawRound.playerResults,
          players,
          roundNumber,
          Boolean(rawRound.completed),
          errors
        );

        if (!specialCards || !playerResults) continue;

        const normalizedRound = {
          ...createRound(players, candidate.firstDealerId, roundNumber),
          phase: rawRound.phase,
          completed: Boolean(rawRound.completed),
          completedAt: rawRound.completedAt ?? null,
          playerResults,
          specialCards
        };

        if (
          [ROUND_PHASE.SPECIAL_CARDS, ROUND_PHASE.TRICKS, ROUND_PHASE.RESULT].includes(rawRound.phase) &&
          !isBidSumValid(normalizedRound)
        ) {
          errors.push(`The bid total in round ${roundNumber} is invalid.`);
        }

        getSpecialCardErrors(normalizedRound, players, options).forEach((error) =>
          errors.push(`Round ${roundNumber}: ${error}`)
        );

        // Verify derived values from storage and imports against the primary round inputs.
        const recalculated = recalculateCurrentBids(normalizedRound, players);
        for (const player of players) {
          if (playerResults[player.id].currentBid !== recalculated.playerResults[player.id].currentBid) {
            errors.push(`${player.name}'s current bid in round ${roundNumber} is inconsistent.`);
          }
        }

        if (rawRound.completed) {
          if (rawRound.phase !== ROUND_PHASE.RESULT) {
            errors.push(`Completed round ${roundNumber} must be in the result phase.`);
          }
          if (!isValidDateString(rawRound.completedAt)) {
            errors.push(`Round ${roundNumber} does not have a valid completion date.`);
          }
          if (!validateTrickSum(normalizedRound).valid) {
            errors.push(`The trick total in round ${roundNumber} is invalid.`);
          }

          for (const player of players) {
            const result = playerResults[player.id];
            if (result.roundPoints !== calculatePoints(result.currentBid, result.tricks)) {
              errors.push(`${player.name}'s points in round ${roundNumber} are invalid.`);
            }
          }
        } else {
          if (rawRound.phase === ROUND_PHASE.RESULT) {
            errors.push(`Open round ${roundNumber} must not be in the result phase.`);
          }
          if (rawRound.completedAt != null) {
            errors.push(`Open round ${roundNumber} must not have a completion date.`);
          }
        }

        validatedRounds.push(normalizedRound);
      }

      validateImportedRoundSequence(candidate, validatedRounds, errors);
      return [...new Set(errors)];
    }

    function validateImportedPlayerResults(rawResults, players, roundNumber, completed, errors) {
      if (!rawResults || typeof rawResults !== "object" || Array.isArray(rawResults)) {
        errors.push(`The player data for round ${roundNumber} is missing.`);
        return null;
      }

      const expectedIds = new Set(players.map((player) => player.id));
      const resultIds = Object.keys(rawResults);
      if (resultIds.length !== expectedIds.size || resultIds.some((id) => !expectedIds.has(id))) {
        errors.push(`The player data for round ${roundNumber} is ambiguous.`);
        return null;
      }

      const results = {};
      for (const player of players) {
        const rawResult = rawResults[player.id];
        if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) {
          errors.push(`${player.name}'s player data for round ${roundNumber} is missing.`);
          return null;
        }

        const requiredResultFields = ["originalBid", "currentBid", "tricks", "roundPoints"];
        if (requiredResultFields.some((field) => !hasOwn(rawResult, field))) {
          errors.push(`${player.name}'s player data for round ${roundNumber} is incomplete.`);
          return null;
        }

        if (
          !Number.isInteger(rawResult.originalBid) ||
          rawResult.originalBid < 0 ||
          rawResult.originalBid > roundNumber ||
          !Number.isInteger(rawResult.tricks) ||
          rawResult.tricks < 0 ||
          rawResult.tricks > roundNumber
        ) {
          errors.push(`Original bids and tricks in round ${roundNumber} must be between 0 and ${roundNumber}.`);
          return null;
        }

        if (!Number.isInteger(rawResult.currentBid) || rawResult.currentBid < 0) {
          errors.push(`The current bid in round ${roundNumber} must be a non-negative integer.`);
          return null;
        }

        if (completed) {
          if (!Number.isInteger(rawResult.roundPoints)) {
            errors.push(`${player.name}'s points in round ${roundNumber} are missing.`);
            return null;
          }
        } else if (rawResult.roundPoints != null) {
          errors.push("An open round must not contain points yet.");
          return null;
        }

        results[player.id] = {
          originalBid: rawResult.originalBid,
          currentBid: rawResult.currentBid,
          tricks: rawResult.tricks,
          roundPoints: rawResult.roundPoints ?? null
        };
      }

      return results;
    }

    function validateImportedSpecialCards(rawCards, players, roundNumber, errors) {
      if (!rawCards || typeof rawCards !== "object" || Array.isArray(rawCards)) {
        errors.push(`The special-card data for round ${roundNumber} is missing or invalid.`);
        return null;
      }

      const requiredCardFields = ["cloud", "bomb", "witch", "secondCloud", "secondBomb"];
      if (requiredCardFields.some((field) => !hasOwn(rawCards, field))) {
        errors.push(`The special-card data for round ${roundNumber} is incomplete.`);
        return null;
      }

      const normalized = createRound(players, players[0].id, roundNumber).specialCards;

      for (const key of ["cloud", "secondCloud"]) {
        const rawCloud = rawCards[key];
        if (
          !rawCloud ||
          typeof rawCloud !== "object" ||
          Array.isArray(rawCloud) ||
          !hasOwn(rawCloud, "active") ||
          !hasOwn(rawCloud, "playerId") ||
          !hasOwn(rawCloud, "change") ||
          typeof rawCloud.active !== "boolean"
        ) {
          errors.push(`The ${key} special card in round ${roundNumber} is invalid.`);
          return null;
        }

        normalized[key] = {
          active: rawCloud.active,
          playerId: rawCloud.playerId,
          change: rawCloud.change
        };

        if (
          (rawCloud.active &&
            (!players.some((player) => player.id === normalized[key].playerId) ||
              ![-1, 1].includes(normalized[key].change))) ||
          (!rawCloud.active && (normalized[key].playerId !== null || normalized[key].change !== 0))
        ) {
          errors.push(`The ${key} special card in round ${roundNumber} is inconsistent.`);
        }
      }

      for (const key of ["bomb", "secondBomb"]) {
        const rawBomb = rawCards[key];
        if (
          !rawBomb ||
          typeof rawBomb !== "object" ||
          Array.isArray(rawBomb) ||
          !hasOwn(rawBomb, "active") ||
          typeof rawBomb.active !== "boolean"
        ) {
          errors.push(`The ${key} special card in round ${roundNumber} is invalid.`);
          return null;
        }
        normalized[key].active = rawBomb.active;
      }

      if (
        !rawCards.witch ||
        typeof rawCards.witch !== "object" ||
        Array.isArray(rawCards.witch) ||
        !hasOwn(rawCards.witch, "active") ||
        !hasOwn(rawCards.witch, "secondEffect") ||
        typeof rawCards.witch.active !== "boolean" ||
        ![null, "cloud", "bomb"].includes(rawCards.witch.secondEffect)
      ) {
        errors.push(`The Witch in round ${roundNumber} is invalid.`);
        return null;
      }
      normalized.witch = {
        active: rawCards.witch.active,
        secondEffect: rawCards.witch.secondEffect
      };

      return normalized;
    }

    function validateImportedRoundSequence(candidate, rounds, errors) {
      const sorted = [...rounds].sort((a, b) => a.number - b.number);

      if (candidate.status === GAME_STATUS.SETUP) {
        if (sorted.length > 0 || candidate.currentRound !== 1) {
          errors.push("A game that has not started must not contain any rounds.");
        }
        return;
      }

      const expectedCount = candidate.status === GAME_STATUS.COMPLETED ? candidate.totalRounds : candidate.currentRound;

      if (sorted.length !== expectedCount || sorted.some((round, index) => round.number !== index + 1)) {
        errors.push("Rounds must be complete, unique, and consecutive.");
        return;
      }

      if (candidate.status === GAME_STATUS.COMPLETED) {
        if (candidate.currentRound !== candidate.totalRounds || sorted.some((round) => !round.completed)) {
          errors.push("A completed game must contain every round as completed.");
        }
        return;
      }

      if (sorted.some((round) => round.number < candidate.currentRound && !round.completed)) {
        errors.push("Previous rounds must be completed.");
      }
    }

    function createCanonicalGameState(candidate, { includeArchiveMetadata = false } = {}) {
      const players = candidate.players.map((player) => ({
        id: player.id,
        name: player.name,
        seatPosition: player.seatPosition
      }));
      const rounds = candidate.rounds.map((round) => {
        const playerResults = {};

        for (const player of players) {
          const result = round.playerResults[player.id];
          playerResults[player.id] = {
            originalBid: result.originalBid,
            currentBid: result.currentBid,
            tricks: result.tricks,
            roundPoints: result.roundPoints
          };
        }

        return {
          number: round.number,
          dealerId: round.dealerId,
          startingPlayerId: round.startingPlayerId,
          phase: round.phase,
          playerResults,
          specialCards: {
            cloud: {
              active: round.specialCards.cloud.active,
              playerId: round.specialCards.cloud.playerId,
              change: round.specialCards.cloud.change
            },
            bomb: {
              active: round.specialCards.bomb.active
            },
            witch: {
              active: round.specialCards.witch.active,
              secondEffect: round.specialCards.witch.secondEffect
            },
            secondCloud: {
              active: round.specialCards.secondCloud.active,
              playerId: round.specialCards.secondCloud.playerId,
              change: round.specialCards.secondCloud.change
            },
            secondBomb: {
              active: round.specialCards.secondBomb.active
            }
          },
          completed: round.completed,
          completedAt: round.completedAt
        };
      });
      const state = {
        version: candidate.version,
        schemaVersion: candidate.schemaVersion,
        gameId: candidate.gameId,
        status: candidate.status,
        totalCards: candidate.totalCards,
        players,
        firstDealerId: candidate.firstDealerId,
        setupDealerRandomized: candidate.setupDealerRandomized,
        roundMode: candidate.roundMode,
        totalRounds: candidate.totalRounds,
        currentRound: candidate.currentRound,
        roundOneHintConfirmed: candidate.roundOneHintConfirmed,
        rounds,
        updatedAt: candidate.updatedAt
      };

      if (includeArchiveMetadata && isValidDateString(candidate.archivedAt)) {
        state.archivedAt = candidate.archivedAt;
      }

      return state;
    }

    return Object.freeze({
      validateImportedGameState,
      validatePersistableGameState,
      createCanonicalGameState
    });
  }

  return Object.freeze({ createGameValidation });
});
