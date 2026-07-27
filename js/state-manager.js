(function attachStateManager(root, factory) {
  const api = factory(root.WizardGameLogic);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardStateManager = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createStateManager(Logic) {
  "use strict";

  if (!Logic) {
    throw new Error("WizardGameLogic wird für die Zustandsverwaltung benötigt.");
  }

  // Gespeicherte Daten werden bereinigt, damit auch ältere Spielstände sicher geladen werden.
  function hydrateState(savedState) {
    const rawPlayers = Array.isArray(savedState.players)
      ? savedState.players.slice(0, Logic.MAX_PLAYERS)
      : [];

    const sanitizedPlayers = rawPlayers.map((player, index) => ({
      id: typeof player?.id === "string" && player.id ? player.id : Logic.createPlayer(index).id,
      name: typeof player?.name === "string" ? player.name.slice(0, 30) : "",
      seatPosition: index
    }));

    while (sanitizedPlayers.length < Logic.MIN_PLAYERS) {
      sanitizedPlayers.push(Logic.createPlayer(sanitizedPlayers.length));
    }

    const players = Logic.normalizeSeatPositions(sanitizedPlayers);
    const playerCount = players.length;
    const totalCards = Logic.TOTAL_CARDS;
    const firstDealerId = players.some((player) => player.id === savedState.firstDealerId)
      ? savedState.firstDealerId
      : players[0].id;
    const clampedRounds = Logic.clampRoundCount(savedState.totalRounds, playerCount, totalCards);
    const standardRounds = Logic.getStandardRounds(playerCount);
    const roundMode = ["full", "individual"].includes(savedState.roundMode)
      ? savedState.roundMode
      : clampedRounds === standardRounds ? "full" : "individual";
    const totalRounds = roundMode === "full" ? standardRounds : clampedRounds;
    const currentRound = Math.min(Math.max(Number.parseInt(savedState.currentRound, 10) || 1, 1), totalRounds);

    const initialState = Logic.createInitialGameState(playerCount);
    const hydrated = {
      ...initialState,
      ...savedState,
      version: "1.0",
      schemaVersion: 4,
      gameId: typeof savedState.gameId === "string" && savedState.gameId ? savedState.gameId : initialState.gameId,
      totalCards,
      players,
      firstDealerId,
      setupDealerRandomized: Boolean(savedState.setupDealerRandomized),
      roundMode,
      totalRounds,
      currentRound,
      roundOneHintConfirmed: Boolean(savedState.roundOneHintConfirmed),
      updatedAt: typeof savedState.updatedAt === "string" ? savedState.updatedAt : null,
      rounds: []
    };

    const rawRounds = Array.isArray(savedState.rounds) ? savedState.rounds : [];
    hydrated.rounds = rawRounds
      .filter((round) => Number.isInteger(Number(round?.number)))
      .map((round) => hydrateRound(round, players, firstDealerId))
      .filter((round) => round.number >= 1 && round.number <= totalRounds)
      .sort((a, b) => a.number - b.number);

    if (hydrated.status === "running" && !hydrated.rounds.some((round) => round.number === currentRound)) {
      hydrated.rounds.push(Logic.createRound(players, firstDealerId, currentRound));
      hydrated.rounds.sort((a, b) => a.number - b.number);
    }

    if (!["setup", "running", "completed"].includes(hydrated.status)) {
      hydrated.status = hydrated.rounds.length > 0 ? "running" : "setup";
    }

    return hydrated;
  }

  function hydrateRound(rawRound, players, firstDealerId) {
    const roundNumber = Math.max(1, Number.parseInt(rawRound?.number, 10) || 1);
    const base = Logic.createRound(players, firstDealerId, roundNumber);
    const allowedPhases = new Set(["bids", "play", "tricks", "result"]);
    const playerResults = {};

    for (const player of players) {
      const rawResult = rawRound?.playerResults?.[player.id] ?? {};
      playerResults[player.id] = {
        originalBid: Math.max(0, Number.parseInt(rawResult.originalBid, 10) || 0),
        currentBid: Math.max(0, Number.parseInt(rawResult.currentBid, 10) || 0),
        tricks: Math.max(0, Number.parseInt(rawResult.tricks, 10) || 0),
        roundPoints: Number.isFinite(Number(rawResult.roundPoints)) ? Number(rawResult.roundPoints) : null
      };
    }

    const rawCards = rawRound?.specialCards ?? {};
    const round = {
      ...base,
      ...rawRound,
      number: roundNumber,
      dealerId: Logic.getDealerForRound(players, firstDealerId, roundNumber)?.id ?? null,
      startingPlayerId: Logic.getStartingPlayerForRound(players, firstDealerId, roundNumber)?.id ?? null,
      phase: allowedPhases.has(rawRound?.phase) ? rawRound.phase : "bids",
      playerResults,
      specialCards: {
        cloud: hydrateCloud(rawCards.cloud),
        bomb: { active: Boolean(rawCards.bomb?.active) },
        witch: {
          active: Boolean(rawCards.witch?.active),
          secondEffect: ["cloud", "bomb"].includes(rawCards.witch?.secondEffect)
            ? rawCards.witch.secondEffect
            : null
        },
        secondCloud: hydrateCloud(rawCards.secondCloud),
        secondBomb: { active: Boolean(rawCards.secondBomb?.active) }
      },
      completed: Boolean(rawRound?.completed),
      completedAt: typeof rawRound?.completedAt === "string" ? rawRound.completedAt : null
    };

    normalizeSpecialDependencies(round);
    if (!round.completed && round.phase === "result") {
      round.phase = "tricks";
    }

    let recalculated = Logic.recalculateCurrentBids(round, players);
    if (recalculated.completed) {
      recalculated = Logic.calculateRoundPoints(recalculated, players);
      recalculated.phase = "result";
    }

    return recalculated;
  }

  function hydrateCloud(rawCloud) {
    return {
      active: Boolean(rawCloud?.active),
      playerId: typeof rawCloud?.playerId === "string" ? rawCloud.playerId : null,
      change: rawCloud?.change === -1 ? -1 : rawCloud?.change === 1 ? 1 : 0
    };
  }

  function normalizeSpecialDependencies(round) {
    const cards = round.specialCards;

    if (!cards.cloud.active) {
      Object.assign(cards.cloud, { playerId: null, change: 0 });
      if (cards.witch.secondEffect === "cloud") {
        cards.witch.secondEffect = null;
        Object.assign(cards.secondCloud, { active: false, playerId: null, change: 0 });
      }
    }

    if (!cards.bomb.active && cards.witch.secondEffect === "bomb") {
      cards.witch.secondEffect = null;
      cards.secondBomb.active = false;
    }

    if (!cards.cloud.active && !cards.bomb.active) {
      cards.witch.active = false;
    }

    if (!cards.witch.active) {
      cards.witch.secondEffect = null;
      Object.assign(cards.secondCloud, { active: false, playerId: null, change: 0 });
      cards.secondBomb.active = false;
    }

    if (cards.witch.secondEffect === "cloud" && !cards.secondCloud.active) {
      cards.witch.secondEffect = null;
    }

    if (cards.witch.secondEffect === "bomb" && !cards.secondBomb.active) {
      cards.witch.secondEffect = null;
    }

    if (cards.witch.secondEffect !== "cloud") {
      Object.assign(cards.secondCloud, { active: false, playerId: null, change: 0 });
    }

    if (cards.witch.secondEffect !== "bomb") {
      cards.secondBomb.active = false;
    }
  }

  return Object.freeze({
    hydrateState,
    normalizeSpecialDependencies
  });
});
