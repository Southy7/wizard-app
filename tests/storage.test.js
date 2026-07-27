"use strict";

const assert = require("node:assert/strict");

const values = new Map();
global.localStorage = {
  setItem(key, value) { values.set(String(key), String(value)); },
  getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
  removeItem(key) { values.delete(String(key)); },
  clear() { values.clear(); }
};

require("../js/storage.js");
const Storage = global.WizardStorage;

assert.equal(Storage.isStorageAvailable(), true);
assert.equal(Storage.loadGame(), null);
assert.equal(Storage.hasStoredData(), false);
assert.deepEqual(Storage.loadGameHistory(), []);
assert.equal(Storage.hasGameHistory(), false);

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
assert.equal(loaded.schemaVersion, 3);
assert.equal(loaded.players[0].name, "Anna");
assert.equal(typeof loaded.updatedAt, "string");
assert.equal(Storage.getLastError(), "");

const completedGame = {
  ...state,
  gameId: "game-1",
  status: "completed",
  rounds: [{ number: 1, completed: true }]
};
assert.equal(Storage.saveCompletedGame(completedGame), true);
assert.equal(Storage.hasGameHistory(), true);
assert.equal(Storage.loadGameHistory().length, 1);
assert.equal(Storage.loadGameHistory()[0].gameId, "game-1");
assert.equal(typeof Storage.loadGameHistory()[0].archivedAt, "string");

const updatedCompletedGame = {
  ...completedGame,
  players: [{ id: "a", name: "Anna aktualisiert", seatPosition: 0 }]
};
assert.equal(Storage.saveCompletedGame(updatedCompletedGame), true);
assert.equal(Storage.loadGameHistory().length, 1);
assert.equal(Storage.loadGameHistory()[0].players[0].name, "Anna aktualisiert");
assert.equal(Storage.saveCompletedGame(state), false);

localStorage.setItem(Storage.STORAGE_KEY, "{invalid-json");
const originalConsoleError = console.error;
console.error = () => {};
assert.equal(Storage.loadGame(), null);
console.error = originalConsoleError;
assert.match(Storage.getLastError(), /beschädigt|nicht lesbar/i);

assert.equal(Storage.deleteGame(), true);
assert.equal(Storage.hasStoredData(), false);
assert.equal(localStorage.getItem(Storage.STORAGE_KEY), null);
assert.equal(Storage.getLastError(), "");

console.log("Alle Tests der Speicherung wurden erfolgreich ausgeführt.");
