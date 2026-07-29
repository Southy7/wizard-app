(function attachGameLogic(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardGameLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createGameLogic() {
  "use strict";

  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 6;
  const TOTAL_CARDS = 70;
  const MAX_FUTURE_TIMESTAMP_SKEW_MS = 24 * 60 * 60 * 1000;

  const STANDARD_ROUNDS = Object.freeze({
    3: 20,
    4: 15,
    5: 12,
    6: 10
  });

  // Players, seating order, and round limits
  function createId(prefix = "player") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createPlayer(index, name = "") {
    return {
      id: createId("player"),
      name,
      seatPosition: index
    };
  }

  function normalizeSeatPositions(players) {
    return (Array.isArray(players) ? players : []).map((player, index) => ({
      ...player,
      seatPosition: index
    }));
  }

  function getStandardRounds(playerCount) {
    return STANDARD_ROUNDS[playerCount] ?? 1;
  }

  function getMaximumRounds(playerCount, totalCards = TOTAL_CARDS) {
    if (!Number.isInteger(playerCount) || playerCount <= 0) {
      return 0;
    }

    return Math.floor(totalCards / playerCount);
  }

  function clampRoundCount(roundCount, playerCount, totalCards = TOTAL_CARDS) {
    const maximum = getMaximumRounds(playerCount, totalCards);
    const numericValue = Number.parseInt(roundCount, 10);
    const safeValue = Number.isFinite(numericValue) ? numericValue : getStandardRounds(playerCount);

    return Math.min(Math.max(safeValue, 1), maximum);
  }

  function getNextPlayer(players, playerId) {
    if (!Array.isArray(players) || players.length === 0) {
      return null;
    }

    const index = players.findIndex((player) => player.id === playerId);
    if (index === -1) return null;

    return players[(index + 1) % players.length];
  }

  function getDealerForRound(players, firstDealerId, roundNumber) {
    if (!Array.isArray(players) || players.length === 0) return null;

    const firstDealerIndex = players.findIndex((player) => player.id === firstDealerId);
    const numericRound = Number.parseInt(roundNumber, 10);

    if (firstDealerIndex === -1 || !Number.isInteger(numericRound) || numericRound < 1) {
      return null;
    }

    return players[(firstDealerIndex + numericRound - 1) % players.length];
  }

  function getStartingPlayerForRound(players, firstDealerId, roundNumber) {
    const dealer = getDealerForRound(players, firstDealerId, roundNumber);
    return dealer ? getNextPlayer(players, dealer.id) : null;
  }

  function getPlayersFromStartingPlayer(players, startingPlayerId) {
    if (!Array.isArray(players) || players.length === 0) return [];

    const startIndex = players.findIndex((player) => player.id === startingPlayerId);
    if (startIndex === -1) return [...players];

    return [...players.slice(startIndex), ...players.slice(0, startIndex)];
  }

  function movePlayer(players, playerId, direction) {
    const copy = [...players];
    const index = copy.findIndex((player) => player.id === playerId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (index === -1 || targetIndex < 0 || targetIndex >= copy.length) {
      return normalizeSeatPositions(copy);
    }

    [copy[index], copy[targetIndex]] = [copy[targetIndex], copy[index]];
    return normalizeSeatPositions(copy);
  }

  function getDuplicateNameIds(players) {
    const groups = new Map();

    for (const player of players) {
      const normalizedName = String(player.name ?? "").trim().toLocaleLowerCase("en-US");
      if (!normalizedName) continue;

      if (!groups.has(normalizedName)) groups.set(normalizedName, []);
      groups.get(normalizedName).push(player.id);
    }

    return new Set(
      [...groups.values()]
        .filter((ids) => ids.length > 1)
        .flat()
    );
  }

  function validateSetup(state) {
    const errors = [];
    const players = Array.isArray(state?.players) ? state.players : [];

    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      errors.push(`There must be between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
    }

    if (players.some((player) => !String(player.name ?? "").trim())) {
      errors.push("Please enter a name for every player.");
    }

    if (!players.some((player) => player.id === state?.firstDealerId)) {
      errors.push("Please select a valid dealer.");
    }

    const maximumRounds = getMaximumRounds(players.length, state?.totalCards ?? TOTAL_CARDS);
    if (!Number.isInteger(state?.totalRounds) || state.totalRounds < 1 || state.totalRounds > maximumRounds) {
      errors.push(`The number of rounds must be between 1 and ${maximumRounds}.`);
    }

    return errors;
  }

  // Imported data must represent a complete, playable state. Temporary UI states
  // are accepted exclusively by validatePersistableGameState.
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
    const allowedStatuses = new Set(["setup", "running", "completed"]);
    const allowedPhases = new Set(["bids", "play", "tricks", "result"]);

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

      if (typeof player?.name !== "string"
        || player.name.length > 30
        || (candidate.status !== "setup" && !player.name.trim())) {
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
    if (!Number.isInteger(candidate.totalRounds)
      || candidate.totalRounds < 1
      || candidate.totalRounds > maximumRounds) {
      errors.push(`The number of rounds must be between 1 and ${maximumRounds}.`);
    } else if (candidate.roundMode === "full" && candidate.totalRounds !== getStandardRounds(players.length)) {
      errors.push("The number of rounds does not match the selected full game.");
    }

    if (!Number.isInteger(candidate.currentRound)
      || !Number.isInteger(candidate.totalRounds)
      || candidate.currentRound < 1
      || candidate.currentRound > candidate.totalRounds) {
      errors.push("The current round is invalid.");
    }

    if (candidate.totalCards !== TOTAL_CARDS) {
      errors.push(`The game state must be based on ${TOTAL_CARDS} cards.`);
    }

    if (typeof candidate.setupDealerRandomized !== "boolean") {
      errors.push("The dealer-selection status is missing or invalid.");
    }

    if (candidate.status !== "setup" && candidate.setupDealerRandomized !== true) {
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
      if (!Number.isInteger(roundNumber)
        || !Number.isInteger(candidate.totalRounds)
        || roundNumber < 1
        || roundNumber > candidate.totalRounds) {
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

      if (["play", "tricks", "result"].includes(rawRound.phase)
        && !isBidSumValid(normalizedRound)) {
        errors.push(`The bid total in round ${roundNumber} is invalid.`);
      }

      getSpecialCardErrors(normalizedRound, players, options)
        .forEach((error) => errors.push(`Round ${roundNumber}: ${error}`));

      const recalculated = recalculateCurrentBids(normalizedRound, players);
      for (const player of players) {
        if (playerResults[player.id].currentBid !== recalculated.playerResults[player.id].currentBid) {
          errors.push(`${player.name}'s current bid in round ${roundNumber} is inconsistent.`);
        }
      }

      if (rawRound.completed) {
        if (rawRound.phase !== "result") {
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
        if (rawRound.phase === "result") {
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

      if (!Number.isInteger(rawResult.originalBid)
        || rawResult.originalBid < 0
        || rawResult.originalBid > roundNumber
        || !Number.isInteger(rawResult.tricks)
        || rawResult.tricks < 0
        || rawResult.tricks > roundNumber) {
        errors.push(`Original bids and tricks in round ${roundNumber} must be between 0 and ${roundNumber}.`);
        return null;
      }

      // Clouds may increase the current bid beyond the round number. Its exact
      // value is verified below by recalculating all current bids.
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

    const cards = rawCards;
    const requiredCardFields = ["cloud", "bomb", "witch", "secondCloud", "secondBomb"];
    if (requiredCardFields.some((field) => !hasOwn(cards, field))) {
      errors.push(`The special-card data for round ${roundNumber} is incomplete.`);
      return null;
    }

    const normalized = createRound(players, players[0].id, roundNumber).specialCards;

    for (const key of ["cloud", "secondCloud"]) {
      const rawCloud = cards[key];
      if (!rawCloud || typeof rawCloud !== "object" || Array.isArray(rawCloud)
        || !hasOwn(rawCloud, "active")
        || !hasOwn(rawCloud, "playerId")
        || !hasOwn(rawCloud, "change")
        || typeof rawCloud.active !== "boolean") {
        errors.push(`The ${key} special card in round ${roundNumber} is invalid.`);
        return null;
      }

      normalized[key] = {
        active: rawCloud.active,
        playerId: rawCloud.playerId,
        change: rawCloud.change
      };

      if ((rawCloud.active && (!players.some((player) => player.id === normalized[key].playerId)
          || ![-1, 1].includes(normalized[key].change)))
        || (!rawCloud.active && (normalized[key].playerId !== null
          || normalized[key].change !== 0))) {
        errors.push(`The ${key} special card in round ${roundNumber} is inconsistent.`);
      }
    }

    for (const key of ["bomb", "secondBomb"]) {
      const rawBomb = cards[key];
      if (!rawBomb || typeof rawBomb !== "object" || Array.isArray(rawBomb)
        || !hasOwn(rawBomb, "active")
        || typeof rawBomb.active !== "boolean") {
        errors.push(`The ${key} special card in round ${roundNumber} is invalid.`);
        return null;
      }
      normalized[key].active = rawBomb.active;
    }

    if (!cards.witch || typeof cards.witch !== "object" || Array.isArray(cards.witch)
      || !hasOwn(cards.witch, "active")
      || !hasOwn(cards.witch, "secondEffect")
      || typeof cards.witch.active !== "boolean"
      || ![null, "cloud", "bomb"].includes(cards.witch.secondEffect)) {
      errors.push(`The Witch in round ${roundNumber} is invalid.`);
      return null;
    }
    normalized.witch = {
      active: cards.witch.active,
      secondEffect: cards.witch.secondEffect
    };

    return normalized;
  }

  function validateImportedRoundSequence(candidate, rounds, errors) {
    const sorted = [...rounds].sort((a, b) => a.number - b.number);

    if (candidate.status === "setup") {
      if (sorted.length > 0 || candidate.currentRound !== 1) {
        errors.push("A game that has not started must not contain any rounds.");
      }
      return;
    }

    const expectedCount = candidate.status === "completed"
      ? candidate.totalRounds
      : candidate.currentRound;

    if (sorted.length !== expectedCount
      || sorted.some((round, index) => round.number !== index + 1)) {
      errors.push("Rounds must be complete, unique, and consecutive.");
      return;
    }

    if (candidate.status === "completed") {
      if (candidate.currentRound !== candidate.totalRounds || sorted.some((round) => !round.completed)) {
        errors.push("A completed game must contain every round as completed.");
      }
      return;
    }

    if (sorted.some((round) => round.number < candidate.currentRound && !round.completed)) {
      errors.push("Previous rounds must be completed.");
    }
  }

  // Base structure of a round, including every supported special card
  function createPlayerResult() {
    return {
      originalBid: 0,
      currentBid: 0,
      tricks: 0,
      roundPoints: null
    };
  }

  function createRound(players, firstDealerId, roundNumber) {
    const dealer = getDealerForRound(players, firstDealerId, roundNumber);
    const starter = getStartingPlayerForRound(players, firstDealerId, roundNumber);
    const playerResults = {};

    for (const player of players) {
      playerResults[player.id] = createPlayerResult();
    }

    return {
      number: roundNumber,
      dealerId: dealer?.id ?? null,
      startingPlayerId: starter?.id ?? null,
      phase: "bids",
      playerResults,
      specialCards: {
        cloud: {
          active: false,
          playerId: null,
          change: 0
        },
        bomb: {
          active: false
        },
        witch: {
          active: false,
          secondEffect: null
        },
        secondCloud: {
          active: false,
          playerId: null,
          change: 0
        },
        secondBomb: {
          active: false
        }
      },
      completed: false,
      completedAt: null
    };
  }

  // Bids and special-card effects
  function getBidSum(round) {
    return Object.values(round?.playerResults ?? {})
      .reduce((sum, result) => sum + (Number(result?.originalBid) || 0), 0);
  }

  function getBidDifference(round) {
    return getBidSum(round) - (Number(round?.number) || 0);
  }

  function isBidSumValid(round) {
    return getBidDifference(round) !== 0;
  }

  function getCloudEvents(round) {
    const cards = round?.specialCards ?? {};
    const events = [];

    if (cards.cloud?.active) {
      events.push({ key: "cloud", ...cards.cloud });
    }

    if (cards.secondCloud?.active) {
      events.push({ key: "secondCloud", ...cards.secondCloud });
    }

    return events;
  }

  function getActiveBombCount(round) {
    const cards = round?.specialCards ?? {};
    let count = cards.bomb?.active ? 1 : 0;
    if (cards.secondBomb?.active) count += 1;
    return count;
  }

  function calculateCurrentBidMap(round, players) {
    const currentBids = {};

    for (const player of players) {
      currentBids[player.id] = Number(round?.playerResults?.[player.id]?.originalBid) || 0;
    }

    for (const event of getCloudEvents(round)) {
      if (Object.prototype.hasOwnProperty.call(currentBids, event.playerId)) {
        currentBids[event.playerId] += Number(event.change) || 0;
      }
    }

    return currentBids;
  }

  function recalculateCurrentBids(round, players) {
    const currentBids = calculateCurrentBidMap(round, players);
    const playerResults = { ...round.playerResults };

    for (const player of players) {
      playerResults[player.id] = {
        ...createPlayerResult(),
        ...playerResults[player.id],
        currentBid: currentBids[player.id]
      };
    }

    return {
      ...round,
      playerResults
    };
  }

  function getSpecialCardErrors(round, players, options = {}) {
    const errors = [];
    const cards = round?.specialCards ?? {};
    const playerIds = new Set(players.map((player) => player.id));
    const validChange = (value) => value === -1 || value === 1;

    if (cards.cloud?.active) {
      if (!playerIds.has(cards.cloud.playerId) || !validChange(cards.cloud.change)) {
        errors.push("The first Cloud selection is incomplete.");
      }
    }

    if (cards.witch?.secondEffect === "cloud" && !cards.secondCloud?.active) {
      errors.push("The '2nd Cloud' selection is incomplete.");
    }

    if (cards.witch?.active && !cards.cloud?.active && !cards.bomb?.active) {
      errors.push("The Witch requires a Cloud or Bomb first.");
    }

    if (cards.witch?.active
      && !cards.witch?.secondEffect
      && !(options.allowIncompleteWitchSelection && round?.phase === "play")) {
      errors.push("Select a second Cloud or Bomb for the Witch.");
    }

    if (cards.witch?.secondEffect === "bomb" && !cards.secondBomb?.active) {
      errors.push("The '2nd Bomb' selection is incomplete.");
    }

    if (cards.secondCloud?.active) {
      if (!cards.witch?.active || cards.witch.secondEffect !== "cloud" || !cards.cloud?.active) {
        errors.push("The second Cloud requires the Witch and the first Cloud.");
      }
      if (!playerIds.has(cards.secondCloud.playerId) || !validChange(cards.secondCloud.change)) {
        errors.push("The second Cloud selection is incomplete.");
      }
    }

    if (cards.secondBomb?.active) {
      if (!cards.witch?.active || cards.witch.secondEffect !== "bomb" || !cards.bomb?.active) {
        errors.push("The second Bomb requires the Witch and the first Bomb.");
      }
    }

    if (!cards.witch?.active && (cards.secondCloud?.active || cards.secondBomb?.active || cards.witch?.secondEffect)) {
      errors.push("A second special-card effect requires an active Witch.");
    }

    if (cards.secondCloud?.active && cards.secondBomb?.active) {
      errors.push("Only one second special card may be selected through the Witch.");
    }

    const currentBids = calculateCurrentBidMap(round, players);
    if (Object.values(currentBids).some((bid) => bid < 0)) {
      errors.push("A Cloud adjustment would result in a negative bid.");
    }

    return errors;
  }

  // Trick validation and point calculation
  function getExpectedTrickCount(round) {
    return Math.max(0, (Number(round?.number) || 0) - getActiveBombCount(round));
  }

  function getTrickSum(round) {
    return Object.values(round?.playerResults ?? {})
      .reduce((sum, result) => sum + (Number(result?.tricks) || 0), 0);
  }

  function validateTrickSum(round) {
    const actual = getTrickSum(round);
    const expected = getExpectedTrickCount(round);

    return {
      valid: actual === expected,
      actual,
      expected,
      difference: actual - expected
    };
  }

  function calculatePoints(currentBid, tricks) {
    const bid = Number(currentBid) || 0;
    const won = Number(tricks) || 0;

    if (bid === won) {
      return 20 + (won * 10);
    }

    return -10 * Math.abs(bid - won);
  }

  function calculateRoundPoints(round, players) {
    const recalculated = recalculateCurrentBids(round, players);
    const playerResults = { ...recalculated.playerResults };

    for (const player of players) {
      const result = playerResults[player.id];
      playerResults[player.id] = {
        ...result,
        roundPoints: calculatePoints(result.currentBid, result.tricks)
      };
    }

    return {
      ...recalculated,
      playerResults
    };
  }

  function calculateTotalPoints(rounds, players) {
    const totals = Object.fromEntries(players.map((player) => [player.id, 0]));

    for (const round of Array.isArray(rounds) ? rounds : []) {
      if (!round?.completed) continue;

      for (const player of players) {
        totals[player.id] += Number(round.playerResults?.[player.id]?.roundPoints) || 0;
      }
    }

    return totals;
  }

  // Complete initial state for a new game
  function createInitialGameState(playerCount = MIN_PLAYERS) {
    const safeCount = Math.min(Math.max(playerCount, MIN_PLAYERS), MAX_PLAYERS);
    const players = Array.from({ length: safeCount }, (_, index) => createPlayer(index));

    return {
      version: "1.0",
      schemaVersion: 4,
      gameId: createId("game"),
      status: "setup",
      totalCards: TOTAL_CARDS,
      players,
      firstDealerId: players[0].id,
      setupDealerRandomized: false,
      roundMode: "full",
      totalRounds: getStandardRounds(safeCount),
      currentRound: 1,
      roundOneHintConfirmed: false,
      rounds: [],
      updatedAt: new Date().toISOString()
    };
  }

  return Object.freeze({
    MIN_PLAYERS,
    MAX_PLAYERS,
    createPlayer,
    normalizeSeatPositions,
    getStandardRounds,
    getMaximumRounds,
    clampRoundCount,
    getDealerForRound,
    getStartingPlayerForRound,
    getPlayersFromStartingPlayer,
    movePlayer,
    getDuplicateNameIds,
    validateSetup,
    validateImportedGameState,
    validatePersistableGameState,
    createRound,
    getBidSum,
    getBidDifference,
    isBidSumValid,
    getActiveBombCount,
    recalculateCurrentBids,
    getSpecialCardErrors,
    getExpectedTrickCount,
    validateTrickSum,
    calculatePoints,
    calculateRoundPoints,
    calculateTotalPoints,
    createInitialGameState
  });
});
