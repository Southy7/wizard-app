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

  const STANDARD_ROUNDS = Object.freeze({
    3: 20,
    4: 15,
    5: 12,
    6: 10
  });

  // Spieler, Sitzordnung und Rundengrenzen
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
      const normalizedName = String(player.name ?? "").trim().toLocaleLowerCase("de-DE");
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
      errors.push(`Es müssen zwischen ${MIN_PLAYERS} und ${MAX_PLAYERS} Spieler angelegt sein.`);
    }

    if (players.some((player) => !String(player.name ?? "").trim())) {
      errors.push("Bitte trage für jeden Spieler einen Namen ein.");
    }

    if (!players.some((player) => player.id === state?.firstDealerId)) {
      errors.push("Bitte wähle einen gültigen Kartengeber aus.");
    }

    const maximumRounds = getMaximumRounds(players.length, state?.totalCards ?? TOTAL_CARDS);
    if (!Number.isInteger(state?.totalRounds) || state.totalRounds < 1 || state.totalRounds > maximumRounds) {
      errors.push(`Die Rundenzahl muss zwischen 1 und ${maximumRounds} liegen.`);
    }

    return errors;
  }

  // Grundstruktur einer Runde einschließlich aller möglichen Sonderkarten
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
          change: 0,
          suppressedByBomb: false
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
          change: 0,
          suppressedByBomb: false
        },
        secondBomb: {
          active: false
        }
      },
      completed: false,
      completedAt: null
    };
  }

  // Ansagen und Auswirkungen der Sonderkarten
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
      if (!event.suppressedByBomb && Object.prototype.hasOwnProperty.call(currentBids, event.playerId)) {
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

  function getSpecialCardErrors(round, players) {
    const errors = [];
    const cards = round?.specialCards ?? {};
    const playerIds = new Set(players.map((player) => player.id));
    const validChange = (value) => value === -1 || value === 1;

    if (cards.cloud?.active) {
      if (!playerIds.has(cards.cloud.playerId) || !validChange(cards.cloud.change)) {
        errors.push("Die erste Wolke ist nicht vollständig erfasst.");
      }
    }

    if (cards.witch?.secondEffect === "cloud" && !cards.secondCloud?.active) {
      errors.push("Die Auswahl '2. Wolke' ist nicht vollständig erfasst.");
    }

    if (cards.witch?.secondEffect === "bomb" && !cards.secondBomb?.active) {
      errors.push("Die Auswahl '2. Bombe' ist nicht vollständig erfasst.");
    }

    if (cards.secondCloud?.active) {
      if (!cards.witch?.active || cards.witch.secondEffect !== "cloud" || !cards.cloud?.active) {
        errors.push("Die zweite Wolke benötigt Hexe und erste Wolke.");
      }
      if (!playerIds.has(cards.secondCloud.playerId) || !validChange(cards.secondCloud.change)) {
        errors.push("Die zweite Wolke ist nicht vollständig erfasst.");
      }
    }

    if (cards.secondBomb?.active) {
      if (!cards.witch?.active || cards.witch.secondEffect !== "bomb" || !cards.bomb?.active) {
        errors.push("Die zweite Bombe benötigt Hexe und erste Bombe.");
      }
    }

    if (!cards.witch?.active && (cards.secondCloud?.active || cards.secondBomb?.active || cards.witch?.secondEffect)) {
      errors.push("Ein zweiter Sonderkarteneffekt ist nur mit aktiver Hexe möglich.");
    }

    if (cards.secondCloud?.active && cards.secondBomb?.active) {
      errors.push("Durch die Hexe darf nur eine zweite Sonderkarte gewählt werden.");
    }

    const suppressedClouds = getCloudEvents(round).filter((event) => event.suppressedByBomb).length;
    if (suppressedClouds > getActiveBombCount(round)) {
      errors.push("Mehr Wolken wurden mit einer Bombe kombiniert als Bombenstiche vorhanden sind.");
    }

    const currentBids = calculateCurrentBidMap(round, players);
    if (Object.values(currentBids).some((bid) => bid < 0)) {
      errors.push("Eine Wolkenänderung würde eine negative Ansage erzeugen.");
    }

    return errors;
  }

  // Stichprüfung und Punkteberechnung
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

  // Vollständiger Ausgangszustand für eine neue Partie
  function createInitialGameState(playerCount = MIN_PLAYERS) {
    const safeCount = Math.min(Math.max(playerCount, MIN_PLAYERS), MAX_PLAYERS);
    const players = Array.from({ length: safeCount }, (_, index) => createPlayer(index));

    return {
      version: "1.0",
      schemaVersion: 3,
      status: "setup",
      totalCards: TOTAL_CARDS,
      players,
      firstDealerId: players[0].id,
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
    TOTAL_CARDS,
    STANDARD_ROUNDS,
    createPlayer,
    normalizeSeatPositions,
    getStandardRounds,
    getMaximumRounds,
    clampRoundCount,
    getNextPlayer,
    getDealerForRound,
    getStartingPlayerForRound,
    getPlayersFromStartingPlayer,
    movePlayer,
    getDuplicateNameIds,
    validateSetup,
    createPlayerResult,
    createRound,
    getBidSum,
    getBidDifference,
    isBidSumValid,
    getCloudEvents,
    getActiveBombCount,
    calculateCurrentBidMap,
    recalculateCurrentBids,
    getSpecialCardErrors,
    getExpectedTrickCount,
    getTrickSum,
    validateTrickSum,
    calculatePoints,
    calculateRoundPoints,
    calculateTotalPoints,
    createInitialGameState
  });
});
