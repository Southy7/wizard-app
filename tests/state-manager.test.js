"use strict";

const assert = require("node:assert/strict");

global.WizardGameLogic = require("../js/game-logic.js");
const StateManager = require("../js/state-manager.js");

const currentState = global.WizardGameLogic.createInitialGameState(3);
const clonedState = StateManager.cloneState(currentState);
assert.deepEqual(clonedState, currentState);
assert.notEqual(clonedState, currentState);
assert.notEqual(clonedState.players, currentState.players);

const round = global.WizardGameLogic.createRound(
  currentState.players,
  currentState.firstDealerId,
  1
);
round.specialCards.cloud = {
  active: false,
  playerId: currentState.players[0].id,
  change: 1
};
round.specialCards.witch = { active: true, secondEffect: "cloud" };
round.specialCards.secondCloud = {
  active: true,
  playerId: currentState.players[1].id,
  change: 1
};
StateManager.normalizeSpecialDependencies(round);
assert.deepEqual(round.specialCards.cloud, {
  active: false,
  playerId: null,
  change: 0
});
assert.equal(round.specialCards.witch.active, false);
assert.equal(round.specialCards.witch.secondEffect, null);
assert.equal(round.specialCards.secondCloud.active, false);

console.log("Alle Tests der Zustandsverwaltung wurden erfolgreich ausgeführt.");
