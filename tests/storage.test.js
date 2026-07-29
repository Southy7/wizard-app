"use strict";

const assert = require("node:assert/strict");

const values = new Map();
let failHistoryWrites = false;
let failGameWrites = false;
let historyReadInterference = null;

function withoutExpectedConsoleError(callback) {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    return callback();
  } finally {
    console.error = originalConsoleError;
  }
}

global.localStorage = {
  setItem(key, value) {
    if (failGameWrites && String(key) === "wizard-scoreboard:game-state:v1") {
      const error = new Error("Storage blocked");
      error.name = "SecurityError";
      throw error;
    }
    if (failHistoryWrites && String(key) === "wizard-scoreboard:game-history:v1") {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    values.set(String(key), String(value));
  },
  getItem(key) {
    const normalizedKey = String(key);
    if (normalizedKey === "wizard-scoreboard:game-history:v1" && historyReadInterference) {
      historyReadInterference.remainingReads -= 1;
      if (historyReadInterference.remainingReads === 0) {
        const interfere = historyReadInterference.interfere;
        historyReadInterference = null;
        interfere(values.get(normalizedKey) ?? null);
      }
    }
    return values.has(normalizedKey) ? values.get(normalizedKey) : null;
  },
  removeItem(key) { values.delete(String(key)); },
  clear() { values.clear(); }
};

global.WizardGameLogic = require("../js/game-logic.js");
const Logic = global.WizardGameLogic;
require("../js/storage.js");
const Storage = global.WizardStorage;

assert.equal(Storage.isStorageAvailable(), true);
assert.equal(Storage.loadGame(), null);
assert.equal(Storage.hasStoredData(), false);
assert.deepEqual(Storage.loadGameHistory(), []);
assert.equal(Storage.hasGameHistory(), false);
assert.equal(Storage.hasStoredHistoryData(), false);
assert.deepEqual(Storage.getStorageErrors(), {
  storageError: "",
  gameError: "",
  historyError: ""
});

const state = Logic.createInitialGameState(3);
state.players[0].name = "Anna";
const implicitInitialState = JSON.parse(JSON.stringify(state));
implicitInitialState.updatedAt = null;
assert.equal(Storage.saveGame(implicitInitialState), false);
assert.equal(Storage.wasLastGameSaveConflict(), true);
assert.equal(Storage.hasStoredData(), false);
assert.equal(Storage.saveGame(state, { expectedUpdatedAt: null }), true);
assert.equal(Storage.wasLastGameSaveConflict(), false);
assert.equal(Storage.hasStoredData(), true);
const loaded = Storage.loadGame();
assert.equal(loaded.version, "1.0");
assert.equal(loaded.schemaVersion, 4);
assert.equal(loaded.players[0].name, "Anna");
assert.equal(typeof loaded.updatedAt, "string");
assert.equal(Storage.getLastError(), "");

const unsupportedSchema = JSON.parse(JSON.stringify(loaded));
unsupportedSchema.schemaVersion = 3;
assert.equal(Storage.saveGame(unsupportedSchema), false);
assert.notEqual(Storage.getStorageErrors().gameError, "");
assert.equal(Storage.loadGame().schemaVersion, 4);

const tabAState = JSON.parse(JSON.stringify(loaded));
const tabBState = JSON.parse(JSON.stringify(loaded));
tabAState.players[0].name = "Anna from Tab A";
assert.equal(Storage.saveGame(tabAState), true);
const tabAUpdatedAt = tabAState.updatedAt;
tabBState.players[0].name = "Anna from Tab B";
assert.equal(Storage.saveGame(tabBState), false);
assert.equal(Storage.wasLastGameSaveConflict(), true);
assert.match(Storage.getStorageErrors().gameError, /another tab/i);
assert.equal(Storage.loadGame().players[0].name, "Anna from Tab A");
assert.equal(Storage.loadGame().updatedAt, tabAUpdatedAt);

// Compare-and-set protection for deletion, replacement, and corruption races
const staleAfterDeletion = JSON.parse(JSON.stringify(Storage.loadGame()));
assert.equal(Storage.deleteGame(), true);
assert.equal(Storage.saveGame(staleAfterDeletion), false);
assert.equal(Storage.wasLastGameSaveConflict(), true);
assert.equal(localStorage.getItem(Storage.STORAGE_KEY), null);

const replacementState = Logic.createInitialGameState(3);
replacementState.players[0].name = "New Game";
assert.equal(Storage.saveGame(replacementState, { expectedUpdatedAt: null }), true);
const replacementId = replacementState.gameId;
const replacementWithCollidingTimestamp = JSON.parse(localStorage.getItem(Storage.STORAGE_KEY));
replacementWithCollidingTimestamp.updatedAt = staleAfterDeletion.updatedAt;
localStorage.setItem(Storage.STORAGE_KEY, JSON.stringify(replacementWithCollidingTimestamp));
assert.equal(Storage.saveGame(staleAfterDeletion), false);
assert.equal(Storage.loadGame().gameId, replacementId);

const staleBeforeDamage = JSON.parse(JSON.stringify(Storage.loadGame()));
localStorage.setItem(Storage.STORAGE_KEY, "{invalid-json");
assert.equal(Storage.saveGame(staleBeforeDamage), false);
assert.equal(localStorage.getItem(Storage.STORAGE_KEY), "{invalid-json");

assert.equal(Storage.deleteGame(), true);
const recoveryState = Logic.createInitialGameState(3);
recoveryState.players[0].name = "Recovered";
assert.equal(Storage.saveGame(recoveryState, { expectedUpdatedAt: null }), true);
assert.equal(Storage.wasLastGameSaveConflict(), false);
const latestGame = Storage.loadGame();

failGameWrites = true;
assert.equal(
  withoutExpectedConsoleError(
    () => Storage.saveGame(JSON.parse(JSON.stringify(latestGame)))
  ),
  false
);
assert.equal(Storage.wasLastGameSaveConflict(), false);
failGameWrites = false;

const completedGame = require("../examples/history-game-1.json").gameState;

const validActiveGameValue = localStorage.getItem(Storage.STORAGE_KEY);
for (const mutate of [
  (game) => { delete game.gameId; },
  (game) => { delete game.updatedAt; },
  (game) => { game.players[1].id = game.players[0].id; },
  (game) => { delete game.players[0].seatPosition; },
  (game) => { game.rounds.push(JSON.parse(JSON.stringify(game.rounds[0]))); },
  (game) => { delete game.rounds[0].dealerId; },
  (game) => { delete game.rounds[0].startingPlayerId; },
  (game) => { game.rounds[0].playerResults["example-1-lena"].originalBid = 999; },
  (game) => { delete game.rounds[0].playerResults["example-1-lena"].roundPoints; },
  (game) => { game.rounds[0].phase = "invalid"; },
  (game) => { delete game.rounds[0].specialCards; },
  (game) => { game.rounds[0].specialCards = { witch: { active: true, secondEffect: null } }; },
  (game) => { game.rounds[0].playerResults["example-1-lena"].roundPoints += 1; },
  (game) => { game.rounds.pop(); }
]) {
  const invalidStoredGame = JSON.parse(JSON.stringify(completedGame));
  mutate(invalidStoredGame);
  const invalidStoredValue = JSON.stringify(invalidStoredGame);
  localStorage.setItem(Storage.STORAGE_KEY, invalidStoredValue);
  assert.equal(withoutExpectedConsoleError(() => Storage.loadGame()), null);
  assert.match(Storage.getStorageErrors().gameError, /corrupted|unreadable/i);
  assert.equal(localStorage.getItem(Storage.STORAGE_KEY), invalidStoredValue);
}

// Round states that are valid only during local interaction must remain resumable.
const transientWitchGame = Logic.createInitialGameState(3);
transientWitchGame.players.forEach((player, index) => { player.name = `Player ${index + 1}`; });
transientWitchGame.status = "running";
transientWitchGame.setupDealerRandomized = true;
transientWitchGame.roundMode = "individual";
transientWitchGame.totalRounds = 1;
transientWitchGame.currentRound = 1;
const transientRound = Logic.createRound(
  transientWitchGame.players,
  transientWitchGame.firstDealerId,
  1
);
transientRound.phase = "play";
transientRound.specialCards.bomb.active = true;
transientRound.specialCards.witch.active = true;
transientWitchGame.rounds = [transientRound];
localStorage.setItem(Storage.STORAGE_KEY, JSON.stringify(transientWitchGame));
assert.notEqual(Storage.loadGame(), null);
assert.ok(Logic.validateImportedGameState(transientWitchGame).some((error) => error.includes("Witch")));
assert.deepEqual(Logic.validatePersistableGameState(transientWitchGame), []);

assert.equal(Storage.deleteGame(), true);
const cloudStoredGame = Logic.createInitialGameState(3);
cloudStoredGame.players.forEach((player, index) => {
  player.name = ["Anna", "Ben", "Chris"][index];
});
cloudStoredGame.status = "running";
cloudStoredGame.setupDealerRandomized = true;
cloudStoredGame.roundMode = "individual";
cloudStoredGame.totalRounds = 1;
cloudStoredGame.currentRound = 1;
let cloudStoredRound = Logic.createRound(
  cloudStoredGame.players,
  cloudStoredGame.firstDealerId,
  1
);
cloudStoredRound.phase = "play";
cloudStoredRound.playerResults[cloudStoredGame.players[0].id].originalBid = 1;
cloudStoredRound.playerResults[cloudStoredGame.players[1].id].originalBid = 1;
cloudStoredRound.specialCards.cloud = {
  active: true,
  playerId: cloudStoredGame.players[0].id,
  change: 1
};
cloudStoredRound = Logic.recalculateCurrentBids(cloudStoredRound, cloudStoredGame.players);
cloudStoredGame.rounds = [cloudStoredRound];
assert.equal(cloudStoredRound.playerResults[cloudStoredGame.players[0].id].currentBid, 2);
assert.equal(Storage.saveGame(cloudStoredGame, { expectedUpdatedAt: null }), true);

const loadedCloudGame = Storage.loadGame();
assert.notEqual(loadedCloudGame, null);
assert.equal(
  loadedCloudGame.rounds[0].playerResults[cloudStoredGame.players[0].id].currentBid,
  2
);
loadedCloudGame.rounds[0].specialCards.bomb.active = true;
assert.equal(Storage.saveGame(loadedCloudGame), true);
const reloadedCloudGame = Storage.loadGame();
assert.notEqual(reloadedCloudGame, null);
assert.equal(reloadedCloudGame.rounds[0].specialCards.bomb.active, true);
assert.equal(
  reloadedCloudGame.rounds[0].playerResults[cloudStoredGame.players[0].id].currentBid,
  2
);
const invalidOutgoingGame = JSON.parse(JSON.stringify(reloadedCloudGame));
invalidOutgoingGame.rounds[0].playerResults[cloudStoredGame.players[0].id].roundPoints = 0;
const storedCloudValue = localStorage.getItem(Storage.STORAGE_KEY);
assert.equal(Storage.saveGame(invalidOutgoingGame), false);
assert.equal(Storage.wasLastGameSaveConflict(), false);
assert.match(
  Storage.getStorageErrors().gameError,
  /current game state is inconsistent.*open round must not contain points yet/i
);
assert.equal(localStorage.getItem(Storage.STORAGE_KEY), storedCloudValue);

localStorage.setItem(Storage.STORAGE_KEY, validActiveGameValue);
assert.notEqual(Storage.loadGame(), null);

assert.equal(Storage.saveCompletedGame(completedGame), true);
assert.equal(Storage.hasGameHistory(), true);
assert.equal(Storage.loadGameHistory().length, 1);
assert.equal(Storage.loadGameHistory()[0].gameId, completedGame.gameId);
assert.equal(typeof Storage.loadGameHistory()[0].archivedAt, "string");

const updatedCompletedGame = {
  ...completedGame,
  players: completedGame.players.map((player, index) => (
    index === 0 ? { ...player, name: "Lena updated" } : player
  ))
};
assert.equal(Storage.saveCompletedGame(updatedCompletedGame), true);
assert.equal(Storage.loadGameHistory().length, 1);
assert.equal(Storage.loadGameHistory()[0].players[0].name, "Lena updated");
assert.equal(Storage.saveCompletedGame(state), false);

const secondCompletedGame = require("../examples/history-game-2.json").gameState;
const historyBeforeConcurrentSave = localStorage.getItem(Storage.HISTORY_KEY);
const concurrentlyArchivedGame = JSON.parse(JSON.stringify(secondCompletedGame));
concurrentlyArchivedGame.gameId = "concurrently-archived-game";
historyReadInterference = {
  remainingReads: 2,
  interfere(raw) {
    const stored = JSON.parse(raw);
    values.set(Storage.HISTORY_KEY, JSON.stringify({
      format: "wizard-scoreboard-history-storage",
      version: 1,
      revision: "external-tab-revision",
      updatedAt: new Date().toISOString(),
      games: [...stored.games, concurrentlyArchivedGame]
    }));
  }
};
assert.equal(Storage.saveCompletedGame(secondCompletedGame), true);
assert.deepEqual(
  new Set(Storage.loadGameHistory().map((game) => game.gameId)),
  new Set([
    completedGame.gameId,
    concurrentlyArchivedGame.gameId,
    secondCompletedGame.gameId
  ])
);
const rebasedHistoryPayload = JSON.parse(localStorage.getItem(Storage.HISTORY_KEY));
assert.equal(rebasedHistoryPayload.format, "wizard-scoreboard-history-storage");
assert.notEqual(rebasedHistoryPayload.revision, "external-tab-revision");
localStorage.setItem(Storage.HISTORY_KEY, historyBeforeConcurrentSave);

assert.deepEqual(Storage.mergeGameHistory([secondCompletedGame]), {
  success: true,
  added: 1,
  updated: 0,
  skipped: 0
});
assert.equal(Storage.loadGameHistory().length, 2);
assert.deepEqual(Storage.mergeGameHistory([secondCompletedGame]), {
  success: true,
  added: 0,
  updated: 0,
  skipped: 1
});
const futureSecondGame = JSON.parse(JSON.stringify(secondCompletedGame));
futureSecondGame.updatedAt = "2099-01-01T00:00:00.000Z";
assert.deepEqual(Storage.mergeGameHistory([futureSecondGame]), {
  success: false,
  added: 0,
  updated: 0,
  skipped: 0
});
const newerSecondGame = JSON.parse(JSON.stringify(secondCompletedGame));
newerSecondGame.updatedAt = "2026-07-21T20:31:00.000Z";
newerSecondGame.players[0].name = "Neuere Fassung";
assert.deepEqual(Storage.mergeGameHistory([newerSecondGame]), {
  success: true,
  added: 0,
  updated: 1,
  skipped: 0
});
assert.equal(
  Storage.loadGameHistory().find((game) => game.gameId === secondCompletedGame.gameId).players[0].name,
  "Neuere Fassung"
);
assert.equal(Storage.mergeGameHistory([secondCompletedGame, secondCompletedGame]).success, false);
assert.equal(Storage.deleteCompletedGame(secondCompletedGame.gameId), true);
assert.equal(Storage.deleteCompletedGame("missing-game"), false);
assert.equal(Storage.loadGameHistory().length, 1);

const historyStatus = Storage.getHistoryStorageStatus();
assert.equal(historyStatus.count, 1);
assert.equal(historyStatus.softLimitReached, false);
const oversizedHistory = Array.from({ length: 100 }, (_, index) => ({
  ...completedGame,
  gameId: `soft-limit-${index}`
}));
assert.equal(Storage.getHistoryStorageStatus(oversizedHistory).softLimitReached, true);

const currentHistoryValueBeforeStrictValidation = localStorage.getItem(Storage.HISTORY_KEY);

const legacyHistoryValue = JSON.stringify([completedGame]);
localStorage.setItem(Storage.HISTORY_KEY, legacyHistoryValue);
assert.deepEqual(withoutExpectedConsoleError(() => Storage.loadGameHistory()), []);
assert.match(Storage.getStorageErrors().historyError, /archive|unreadable/i);
assert.equal(localStorage.getItem(Storage.HISTORY_KEY), legacyHistoryValue);

const incompleteArchivedGame = JSON.parse(JSON.stringify(completedGame));
for (const round of incompleteArchivedGame.rounds) {
  delete round.dealerId;
  delete round.startingPlayerId;
  round.specialCards = {
    witch: { active: false, secondEffect: null }
  };
}
assert.ok(Logic.validateImportedGameState(incompleteArchivedGame).length > 0);
const incompleteHistoryEnvelope = JSON.parse(currentHistoryValueBeforeStrictValidation);
incompleteHistoryEnvelope.games = [incompleteArchivedGame];
const incompleteHistoryValue = JSON.stringify(incompleteHistoryEnvelope);
localStorage.setItem(Storage.HISTORY_KEY, incompleteHistoryValue);
assert.deepEqual(withoutExpectedConsoleError(() => Storage.loadGameHistory()), []);
assert.match(Storage.getStorageErrors().historyError, /archive|unreadable/i);
assert.equal(localStorage.getItem(Storage.HISTORY_KEY), incompleteHistoryValue);

localStorage.setItem(Storage.HISTORY_KEY, currentHistoryValueBeforeStrictValidation);
assert.equal(Storage.loadGameHistory().length, 1);

failHistoryWrites = true;
assert.equal(
  withoutExpectedConsoleError(() => Storage.saveCompletedGame(secondCompletedGame)),
  false
);
assert.match(Storage.getStorageErrors().historyError, /storage is full/i);
failHistoryWrites = false;
assert.equal(Storage.loadGameHistory().length, 1);

for (const mutate of [
  (game) => game.rounds.pop(),
  (game) => { game.rounds[1].number = 1; },
  (game) => { game.rounds[0].completed = false; },
  (game) => { game.currentRound = 1; },
  (game) => { game.rounds[0].playerResults["example-1-lena"].tricks = 0; },
  (game) => { game.rounds[0].specialCards = { witch: { active: true, secondEffect: null } }; }
]) {
  const inconsistentGame = JSON.parse(JSON.stringify(completedGame));
  mutate(inconsistentGame);
  assert.equal(Storage.saveCompletedGame(inconsistentGame), false);
}

const validHistoryValue = localStorage.getItem(Storage.HISTORY_KEY);
const inconsistentArchive = JSON.parse(JSON.stringify(completedGame));
inconsistentArchive.rounds.pop();
const inconsistentHistoryEnvelope = JSON.parse(validHistoryValue);
inconsistentHistoryEnvelope.games = [inconsistentArchive];
localStorage.setItem(Storage.HISTORY_KEY, JSON.stringify(inconsistentHistoryEnvelope));
assert.deepEqual(withoutExpectedConsoleError(() => Storage.loadGameHistory()), []);
assert.match(Storage.getStorageErrors().historyError, /inconsistent|unreadable/i);
localStorage.setItem(Storage.HISTORY_KEY, validHistoryValue);
assert.equal(Storage.loadGameHistory().length, 1);

localStorage.setItem(Storage.STORAGE_KEY, "{invalid-json");
assert.equal(withoutExpectedConsoleError(() => Storage.loadGame()), null);
assert.match(Storage.getLastError(), /corrupted|unreadable/i);
const damagedGameError = Storage.getStorageErrors().gameError;

// Successful operations in one storage domain must not clear errors from another.
assert.equal(Storage.loadGameHistory().length, 1);
assert.equal(Storage.getStorageErrors().gameError, damagedGameError);
assert.equal(Storage.getStorageErrors().historyError, "");

localStorage.setItem(Storage.HISTORY_KEY, "{invalid-json");
assert.deepEqual(withoutExpectedConsoleError(() => Storage.loadGameHistory()), []);
const damagedHistoryValue = localStorage.getItem(Storage.HISTORY_KEY);
const damagedHistoryError = Storage.getStorageErrors().historyError;
assert.match(damagedHistoryError, /game archive|unreadable/i);
assert.equal(Storage.hasStoredHistoryData(), true);
assert.equal(Storage.getRawGameHistoryData(), damagedHistoryValue);
assert.equal(Storage.deleteGame(), true);
assert.equal(Storage.saveGame(latestGame, { expectedUpdatedAt: null }), true);
assert.equal(Storage.loadGame().version, "1.0");
assert.equal(Storage.getStorageErrors().historyError, damagedHistoryError);

// A damaged archive is preserved until the user chooses the dedicated recovery path.
assert.equal(
  withoutExpectedConsoleError(() => Storage.saveCompletedGame(completedGame)),
  false
);
assert.equal(localStorage.getItem(Storage.HISTORY_KEY), damagedHistoryValue);

assert.equal(Storage.deleteGame(), true);
assert.equal(Storage.hasStoredData(), false);
assert.equal(localStorage.getItem(Storage.STORAGE_KEY), null);
assert.equal(Storage.getStorageErrors().gameError, "");
assert.equal(Storage.getStorageErrors().historyError, damagedHistoryError);

assert.equal(Storage.resetDamagedGameHistory(damagedHistoryValue), true);
assert.deepEqual(Storage.loadGameHistory(), []);
assert.equal(Storage.hasStoredHistoryData(), false);

console.log("All storage tests passed.");
