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

  // Importdaten werden vor der Hydrierung strikt geprüft, damit keine mehrdeutigen IDs oder Runden entstehen.
  function validateImportedGameState(candidate, options = {}) {
    const errors = [];
    const allowedStatuses = new Set(["setup", "running", "completed"]);
    const allowedPhases = new Set(["bids", "play", "tricks", "result"]);

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return ["Die Datei enthält keinen gültigen Spielstand."];
    }

    if (candidate.version !== "1.0") {
      errors.push("Die Datei ist kein gültiger Wizard-Spielstand der Version 1.0.");
    }

    if (candidate.schemaVersion !== undefined
      && (!Number.isInteger(candidate.schemaVersion)
        || candidate.schemaVersion < 1
        || candidate.schemaVersion > 4)) {
      errors.push("Die Schema-Version des Spielstands wird nicht unterstützt.");
    }

    const players = Array.isArray(candidate.players) ? candidate.players : [];
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      errors.push(`Der Spielstand muss ${MIN_PLAYERS} bis ${MAX_PLAYERS} Spieler enthalten.`);
      return errors;
    }

    const playerIds = [];
    players.forEach((player, index) => {
      const id = player?.id;
      if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id)) {
        errors.push(`Spieler ${index + 1} besitzt keine gültige ID.`);
      } else {
        playerIds.push(id);
      }

      if (typeof player?.name !== "string"
        || player.name.length > 30
        || (candidate.status !== "setup" && !player.name.trim())) {
        errors.push(`Spieler ${index + 1} besitzt keinen gültigen Namen.`);
      }

      if (player?.seatPosition !== undefined && player.seatPosition !== index) {
        errors.push("Die Sitzreihenfolge der Spieler ist nicht eindeutig.");
      }
    });

    if (playerIds.length !== players.length) return errors;

    const playerIdSet = new Set(playerIds);
    if (playerIdSet.size !== playerIds.length) {
      errors.push("Spieler-IDs müssen eindeutig sein.");
      return errors;
    }

    if (!allowedStatuses.has(candidate.status)) {
      errors.push("Der Spielstatus ist ungültig.");
    }

    if (!playerIdSet.has(candidate.firstDealerId)) {
      errors.push("Der Kartengeber ist ungültig.");
    }

    if (!["full", "individual"].includes(candidate.roundMode)) {
      errors.push("Der Rundentyp ist ungültig.");
    }

    const maximumRounds = getMaximumRounds(players.length, TOTAL_CARDS);
    if (!Number.isInteger(candidate.totalRounds)
      || candidate.totalRounds < 1
      || candidate.totalRounds > maximumRounds) {
      errors.push(`Die Rundenzahl muss zwischen 1 und ${maximumRounds} liegen.`);
    } else if (candidate.roundMode === "full" && candidate.totalRounds !== getStandardRounds(players.length)) {
      errors.push("Die Rundenzahl passt nicht zum ausgewählten Full Game.");
    }

    if (!Number.isInteger(candidate.currentRound)
      || !Number.isInteger(candidate.totalRounds)
      || candidate.currentRound < 1
      || candidate.currentRound > candidate.totalRounds) {
      errors.push("Die aktuelle Runde ist ungültig.");
    }

    if (candidate.totalCards !== undefined && candidate.totalCards !== TOTAL_CARDS) {
      errors.push(`Der Spielstand muss auf ${TOTAL_CARDS} Karten basieren.`);
    }

    if (candidate.status !== "setup" && candidate.setupDealerRandomized !== true) {
      errors.push("Für eine gestartete Partie muss der Kartengeber festgelegt sein.");
    }

    const rounds = Array.isArray(candidate.rounds) ? candidate.rounds : null;
    if (!rounds) {
      errors.push("Die Runden des Spielstands fehlen.");
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
        errors.push("Mindestens eine Rundennummer ist ungültig.");
        continue;
      }

      if (seenRoundNumbers.has(roundNumber)) {
        errors.push(`Runde ${roundNumber} ist mehrfach vorhanden.`);
        continue;
      }
      seenRoundNumbers.add(roundNumber);

      if (!allowedPhases.has(rawRound.phase)) {
        errors.push(`Runde ${roundNumber} besitzt eine ungültige Phase.`);
      }

      if (typeof rawRound.completed !== "boolean") {
        errors.push(`Runde ${roundNumber} besitzt keinen eindeutigen Abschlussstatus.`);
      }

      const expectedDealer = getDealerForRound(players, candidate.firstDealerId, roundNumber);
      const expectedStarter = getStartingPlayerForRound(players, candidate.firstDealerId, roundNumber);
      if (rawRound.dealerId != null && rawRound.dealerId !== expectedDealer?.id) {
        errors.push(`Der Kartengeber in Runde ${roundNumber} ist ungültig.`);
      }
      if (rawRound.startingPlayerId != null && rawRound.startingPlayerId !== expectedStarter?.id) {
        errors.push(`Der Startspieler in Runde ${roundNumber} ist ungültig.`);
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

      getSpecialCardErrors(normalizedRound, players, options)
        .forEach((error) => errors.push(`Runde ${roundNumber}: ${error}`));

      const recalculated = recalculateCurrentBids(normalizedRound, players);
      for (const player of players) {
        if (playerResults[player.id].currentBid !== recalculated.playerResults[player.id].currentBid) {
          errors.push(`Die aktuelle Ansage von ${player.name} in Runde ${roundNumber} ist inkonsistent.`);
        }
      }

      if (rawRound.completed) {
        if (rawRound.phase !== "result") {
          errors.push(`Die abgeschlossene Runde ${roundNumber} muss sich in der Ergebnisphase befinden.`);
        }
        if (typeof rawRound.completedAt !== "string" || Number.isNaN(Date.parse(rawRound.completedAt))) {
          errors.push(`Runde ${roundNumber} besitzt kein gültiges Abschlussdatum.`);
        }
        if (!validateTrickSum(normalizedRound).valid) {
          errors.push(`Die Stichsumme in Runde ${roundNumber} ist ungültig.`);
        }

        for (const player of players) {
          const result = playerResults[player.id];
          if (result.roundPoints !== calculatePoints(result.currentBid, result.tricks)) {
            errors.push(`Die Punkte von ${player.name} in Runde ${roundNumber} sind ungültig.`);
          }
        }
      } else {
        if (rawRound.phase === "result") {
          errors.push(`Die offene Runde ${roundNumber} darf nicht in der Ergebnisphase sein.`);
        }
        if (rawRound.completedAt != null) {
          errors.push(`Die offene Runde ${roundNumber} darf kein Abschlussdatum besitzen.`);
        }
      }

      validatedRounds.push(normalizedRound);
    }

    validateImportedRoundSequence(candidate, validatedRounds, errors);
    return [...new Set(errors)];
  }

  // Lokale Spielstände dürfen die bewusst zwischengespeicherte Hexen-Auswahl
  // enthalten. Alle strukturellen und übrigen fachlichen Regeln bleiben strikt.
  function validateStoredGameState(candidate) {
    return validateImportedGameState(candidate, { allowIncompleteWitchSelection: true });
  }

  function validateImportedPlayerResults(rawResults, players, roundNumber, completed, errors) {
    if (!rawResults || typeof rawResults !== "object" || Array.isArray(rawResults)) {
      errors.push(`Die Spielerdaten in Runde ${roundNumber} fehlen.`);
      return null;
    }

    const expectedIds = new Set(players.map((player) => player.id));
    const resultIds = Object.keys(rawResults);
    if (resultIds.length !== expectedIds.size || resultIds.some((id) => !expectedIds.has(id))) {
      errors.push(`Die Spielerdaten in Runde ${roundNumber} sind nicht eindeutig.`);
      return null;
    }

    const results = {};
    for (const player of players) {
      const rawResult = rawResults[player.id];
      if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) {
        errors.push(`Die Spielerdaten von ${player.name} in Runde ${roundNumber} fehlen.`);
        return null;
      }

      for (const field of ["originalBid", "currentBid", "tricks"]) {
        if (!Number.isInteger(rawResult[field]) || rawResult[field] < 0 || rawResult[field] > roundNumber) {
          errors.push(`Ansagen und Stiche in Runde ${roundNumber} müssen zwischen 0 und ${roundNumber} liegen.`);
          return null;
        }
      }

      if (completed) {
        if (!Number.isInteger(rawResult.roundPoints)) {
          errors.push(`Die Punkte von ${player.name} in Runde ${roundNumber} fehlen.`);
          return null;
        }
      } else if (rawResult.roundPoints != null) {
        errors.push("Eine offene Runde darf noch keine Punkte enthalten.");
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
    if (rawCards !== undefined && (!rawCards || typeof rawCards !== "object" || Array.isArray(rawCards))) {
      errors.push(`Die Sonderkarten in Runde ${roundNumber} sind ungültig.`);
      return null;
    }

    const cards = rawCards ?? {};
    const normalized = createRound(players, players[0].id, roundNumber).specialCards;

    for (const key of ["cloud", "secondCloud"]) {
      const rawCloud = cards[key];
      if (rawCloud === undefined) continue;
      if (!rawCloud || typeof rawCloud !== "object" || Array.isArray(rawCloud)
        || typeof rawCloud.active !== "boolean") {
        errors.push(`Die Sonderkarte ${key} in Runde ${roundNumber} ist ungültig.`);
        return null;
      }

      normalized[key] = {
        active: rawCloud.active,
        playerId: rawCloud.playerId ?? null,
        change: rawCloud.change ?? 0
      };

      if ((rawCloud.active && (!players.some((player) => player.id === normalized[key].playerId)
          || ![-1, 1].includes(normalized[key].change)))
        || (!rawCloud.active && (normalized[key].playerId !== null
          || normalized[key].change !== 0))) {
        errors.push(`Die Sonderkarte ${key} in Runde ${roundNumber} ist inkonsistent.`);
      }
    }

    for (const key of ["bomb", "secondBomb"]) {
      const rawBomb = cards[key];
      if (rawBomb === undefined) continue;
      if (!rawBomb || typeof rawBomb !== "object" || Array.isArray(rawBomb)
        || typeof rawBomb.active !== "boolean") {
        errors.push(`Die Sonderkarte ${key} in Runde ${roundNumber} ist ungültig.`);
        return null;
      }
      normalized[key].active = rawBomb.active;
    }

    if (cards.witch !== undefined) {
      if (!cards.witch || typeof cards.witch !== "object" || Array.isArray(cards.witch)
        || typeof cards.witch.active !== "boolean"
        || ![null, "cloud", "bomb"].includes(cards.witch.secondEffect ?? null)) {
        errors.push(`Die Hexe in Runde ${roundNumber} ist ungültig.`);
        return null;
      }
      normalized.witch = {
        active: cards.witch.active,
        secondEffect: cards.witch.secondEffect ?? null
      };
    }

    return normalized;
  }

  function validateImportedRoundSequence(candidate, rounds, errors) {
    const sorted = [...rounds].sort((a, b) => a.number - b.number);

    if (candidate.status === "setup") {
      if (sorted.length > 0 || candidate.currentRound !== 1) {
        errors.push("Eine noch nicht gestartete Partie darf keine Runden enthalten.");
      }
      return;
    }

    const expectedCount = candidate.status === "completed"
      ? candidate.totalRounds
      : candidate.currentRound;

    if (sorted.length !== expectedCount
      || sorted.some((round, index) => round.number !== index + 1)) {
      errors.push("Die Runden müssen vollständig, eindeutig und ohne Lücken vorliegen.");
      return;
    }

    if (candidate.status === "completed") {
      if (candidate.currentRound !== candidate.totalRounds || sorted.some((round) => !round.completed)) {
        errors.push("Eine beendete Partie muss vollständig abgeschlossene Runden enthalten.");
      }
      return;
    }

    if (sorted.some((round) => round.number < candidate.currentRound && !round.completed)) {
      errors.push("Vorherige Runden müssen abgeschlossen sein.");
    }
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
        errors.push("Die erste Wolke ist nicht vollständig erfasst.");
      }
    }

    if (cards.witch?.secondEffect === "cloud" && !cards.secondCloud?.active) {
      errors.push("Die Auswahl '2. Wolke' ist nicht vollständig erfasst.");
    }

    if (cards.witch?.active && !cards.cloud?.active && !cards.bomb?.active) {
      errors.push("Die Hexe benötigt zuerst eine Wolke oder Bombe.");
    }

    if (cards.witch?.active
      && !cards.witch?.secondEffect
      && !(options.allowIncompleteWitchSelection && round?.phase === "play")) {
      errors.push("Wähle für die Hexe eine zweite Wolke oder Bombe aus.");
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
    validateImportedGameState,
    validateStoredGameState,
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
