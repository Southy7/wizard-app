"use strict";

const assert = require("node:assert/strict");

const values = new Map();
let failHistoryWrites = false;
global.localStorage = {
  setItem(key, value) {
    if (failHistoryWrites && String(key) === "wizard-punkte-app:game-history:v1") {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    values.set(String(key), String(value));
  },
  getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
  removeItem(key) { values.delete(String(key)); },
  clear() { values.clear(); }
};

global.WizardGameLogic = require("../js/game-logic.js");
require("../js/storage.js");
const Storage = global.WizardStorage;

assert.equal(Storage.isStorageAvailable(), true);
assert.equal(Storage.loadGame(), null);
assert.equal(Storage.hasStoredData(), false);
assert.deepEqual(Storage.loadGameHistory(), []);
assert.equal(Storage.hasGameHistory(), false);
assert.deepEqual(Storage.getStorageErrors(), {
  storageError: "",
  gameError: "",
  historyError: ""
});

const state = {
  version: "1.0",
  schemaVersion: 3,
  status: "setup",
  players: [{ id: "a", name: "Anna", seatPosition: 0 }]
};
assert.equal(Storage.saveGame(state), true);
assert.equal(Storage.hasStoredData(), true);
const loaded = Storage.loadGame();
assert.equal(loaded.version, "1.0");
assert.equal(loaded.schemaVersion, 4);
assert.equal(loaded.players[0].name, "Anna");
assert.equal(typeof loaded.updatedAt, "string");
assert.equal(Storage.getLastError(), "");

const tabAState = JSON.parse(JSON.stringify(loaded));
const tabBState = JSON.parse(JSON.stringify(loaded));
tabAState.players[0].name = "Anna aus Tab A";
assert.equal(Storage.saveGame(tabAState), true);
const tabAUpdatedAt = tabAState.updatedAt;
tabBState.players[0].name = "Anna aus Tab B";
assert.equal(Storage.saveGame(tabBState), false);
assert.match(Storage.getStorageErrors().gameError, /anderen Tab/i);
const latestGame = Storage.loadGame();
assert.equal(latestGame.players[0].name, "Anna aus Tab A");
assert.equal(latestGame.updatedAt, tabAUpdatedAt);

const completedGame = require("../examples/history-game-1.json").gameState;
assert.equal(Storage.saveCompletedGame(completedGame), true);
assert.equal(Storage.hasGameHistory(), true);
assert.equal(Storage.loadGameHistory().length, 1);
assert.equal(Storage.loadGameHistory()[0].gameId, completedGame.gameId);
assert.equal(typeof Storage.loadGameHistory()[0].archivedAt, "string");

const updatedCompletedGame = {
  ...completedGame,
  players: completedGame.players.map((player, index) => (
    index === 0 ? { ...player, name: "Lena aktualisiert" } : player
  ))
};
assert.equal(Storage.saveCompletedGame(updatedCompletedGame), true);
assert.equal(Storage.loadGameHistory().length, 1);
assert.equal(Storage.loadGameHistory()[0].players[0].name, "Lena aktualisiert");
assert.equal(Storage.saveCompletedGame(state), false);

const secondCompletedGame = require("../examples/history-game-2.json").gameState;
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
const newerSecondGame = JSON.parse(JSON.stringify(secondCompletedGame));
newerSecondGame.updatedAt = "2099-01-01T00:00:00.000Z";
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

failHistoryWrites = true;
const quotaConsoleError = console.error;
console.error = () => {};
assert.equal(Storage.saveCompletedGame(secondCompletedGame), false);
assert.match(Storage.getStorageErrors().historyError, /Speicher ist voll/i);
console.error = quotaConsoleError;
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
localStorage.setItem(Storage.HISTORY_KEY, JSON.stringify([inconsistentArchive]));
const archiveConsoleError = console.error;
console.error = () => {};
assert.deepEqual(Storage.loadGameHistory(), []);
assert.match(Storage.getStorageErrors().historyError, /inkonsistent|nicht lesbar/i);
console.error = archiveConsoleError;
localStorage.setItem(Storage.HISTORY_KEY, validHistoryValue);
assert.equal(Storage.loadGameHistory().length, 1);

localStorage.setItem(Storage.STORAGE_KEY, "{invalid-json");
const originalConsoleError = console.error;
console.error = () => {};
assert.equal(Storage.loadGame(), null);
assert.match(Storage.getLastError(), /beschädigt|nicht lesbar/i);
const damagedGameError = Storage.getStorageErrors().gameError;

// Eine erfolgreiche History-Abfrage darf den Fehler des aktiven Spielstands nicht löschen.
assert.equal(Storage.loadGameHistory().length, 1);
assert.equal(Storage.getStorageErrors().gameError, damagedGameError);
assert.equal(Storage.getStorageErrors().historyError, "");

// Umgekehrt darf ein erfolgreicher Spielzugriff keinen History-Fehler löschen.
localStorage.setItem(Storage.HISTORY_KEY, "{invalid-json");
assert.deepEqual(Storage.loadGameHistory(), []);
const damagedHistoryValue = localStorage.getItem(Storage.HISTORY_KEY);
const damagedHistoryError = Storage.getStorageErrors().historyError;
assert.match(damagedHistoryError, /Partienarchiv|nicht lesbar/i);
assert.equal(Storage.saveGame(latestGame), true);
assert.equal(Storage.loadGame().version, "1.0");
assert.equal(Storage.getStorageErrors().historyError, damagedHistoryError);

// Ein beschädigtes Archiv wird beim Speichern nicht stillschweigend überschrieben.
assert.equal(Storage.saveCompletedGame(completedGame), false);
assert.equal(localStorage.getItem(Storage.HISTORY_KEY), damagedHistoryValue);
console.error = originalConsoleError;

assert.equal(Storage.deleteGame(), true);
assert.equal(Storage.hasStoredData(), false);
assert.equal(localStorage.getItem(Storage.STORAGE_KEY), null);
assert.equal(Storage.getStorageErrors().gameError, "");
assert.equal(Storage.getStorageErrors().historyError, damagedHistoryError);

assert.equal(Storage.clearGameHistory(), true);
assert.deepEqual(Storage.loadGameHistory(), []);
Storage.clearLastError();
assert.equal(Storage.getLastError(), "");

console.log("Alle Tests der Speicherung wurden erfolgreich ausgeführt.");
