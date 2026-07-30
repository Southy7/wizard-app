(function attachGameLogic(root, factory) {
  const validationModule =
    typeof module === "object" && module.exports ? require("./game-validation.js") : root.WizardGameValidation;
  const constants = typeof module === "object" && module.exports ? require("./constants.js") : root.WizardConstants;
  const api = factory(validationModule, constants);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardGameLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createGameLogic(ValidationModule, Constants) {
  "use strict";

  const { GAME_STATUS, ROUND_PHASE } = Constants;
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 6;
  const TOTAL_CARDS = 70;

  const STANDARD_ROUNDS = Object.freeze({
    3: 20,
    4: 15,
    5: 12,
    6: 10
  });

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
      const normalizedName = String(player.name ?? "")
        .trim()
        .toLocaleLowerCase("en-US");
      if (!normalizedName) continue;

      if (!groups.has(normalizedName)) groups.set(normalizedName, []);
      groups.get(normalizedName).push(player.id);
    }

    return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
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
      phase: ROUND_PHASE.BIDS,
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

  function getBidSum(round) {
    return Object.values(round?.playerResults ?? {}).reduce(
      (sum, result) => sum + (Number(result?.originalBid) || 0),
      0
    );
  }

  function getBidDifference(round) {
    return getBidSum(round) - (Number(round?.number) || 0);
  }

  function isBidSumValid(round) {
    // This Wizard variant forbids the total bids from matching the number of available tricks.
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

    if (
      cards.witch?.active &&
      !cards.witch?.secondEffect &&
      !(options.allowIncompleteWitchSelection && round?.phase === ROUND_PHASE.SPECIAL_CARDS)
    ) {
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

  function getExpectedTrickCount(round) {
    // Bombed tricks are discarded and therefore cannot be assigned to a player.
    return Math.max(0, (Number(round?.number) || 0) - getActiveBombCount(round));
  }

  function getTrickSum(round) {
    return Object.values(round?.playerResults ?? {}).reduce((sum, result) => sum + (Number(result?.tricks) || 0), 0);
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
      return 20 + won * 10;
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

  function createInitialGameState(playerCount = MIN_PLAYERS) {
    const safeCount = Math.min(Math.max(playerCount, MIN_PLAYERS), MAX_PLAYERS);
    const players = Array.from({ length: safeCount }, (_, index) => createPlayer(index));

    return {
      version: "1.0",
      schemaVersion: 4,
      gameId: createId("game"),
      status: GAME_STATUS.SETUP,
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

  const { validateImportedGameState, validatePersistableGameState, createCanonicalGameState } =
    ValidationModule.createGameValidation({
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
    });

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
    createCanonicalGameState,
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
