"use strict";

const assert = require("node:assert/strict");

global.WizardGameLogic = require("../js/game-logic.js");
const StateManager = require("../js/state-manager.js");

const completedGame = require("../examples/history-game-1.json").gameState;
const hydratedCompletedGame = StateManager.hydrateState(completedGame);

assert.equal(hydratedCompletedGame.schemaVersion, 4);
assert.equal(hydratedCompletedGame.status, "completed");
assert.equal(hydratedCompletedGame.rounds.length, completedGame.totalRounds);
assert.equal(hydratedCompletedGame.rounds[0].dealerId, completedGame.firstDealerId);
assert.equal(hydratedCompletedGame.rounds[0].phase, "result");

const legacyRunningGame = global.WizardGameLogic.createInitialGameState(3);
legacyRunningGame.schemaVersion = 2;
delete legacyRunningGame.updatedAt;
legacyRunningGame.status = "running";
legacyRunningGame.setupDealerRandomized = true;
legacyRunningGame.roundMode = "individual";
legacyRunningGame.totalRounds = 2;
legacyRunningGame.currentRound = 2;
legacyRunningGame.rounds = [];

const hydratedRunningGame = StateManager.hydrateState(legacyRunningGame);
assert.equal(hydratedRunningGame.schemaVersion, 4);
assert.equal(hydratedRunningGame.updatedAt, null);
assert.equal(hydratedRunningGame.currentRound, 2);
assert.equal(hydratedRunningGame.rounds.length, 1);
assert.equal(hydratedRunningGame.rounds[0].number, 2);
assert.equal(hydratedRunningGame.rounds[0].phase, "bids");

const specialRound = global.WizardGameLogic.createRound(
  hydratedRunningGame.players,
  hydratedRunningGame.firstDealerId,
  1
);
specialRound.specialCards.witch.active = true;
specialRound.specialCards.witch.secondEffect = "cloud";
StateManager.normalizeSpecialDependencies(specialRound);
assert.equal(specialRound.specialCards.witch.active, false);
assert.equal(specialRound.specialCards.witch.secondEffect, null);
assert.equal(specialRound.specialCards.secondCloud.active, false);

const cloudAndBombState = global.WizardGameLogic.createInitialGameState(3);
cloudAndBombState.status = "running";
cloudAndBombState.setupDealerRandomized = true;
cloudAndBombState.roundMode = "individual";
cloudAndBombState.totalRounds = 2;
cloudAndBombState.currentRound = 1;
const cloudAndBombRound = global.WizardGameLogic.createRound(
  cloudAndBombState.players,
  cloudAndBombState.firstDealerId,
  1
);
const affectedPlayer = cloudAndBombState.players[0];
cloudAndBombRound.phase = "play";
cloudAndBombRound.specialCards.cloud = {
  active: true,
  playerId: affectedPlayer.id,
  change: 1
};
cloudAndBombRound.specialCards.bomb.active = true;
cloudAndBombState.rounds = [cloudAndBombRound];

const hydratedCloudAndBomb = StateManager.hydrateState(cloudAndBombState);
assert.equal(hydratedCloudAndBomb.rounds[0].specialCards.cloud.active, true);
assert.equal(hydratedCloudAndBomb.rounds[0].specialCards.bomb.active, true);
assert.equal(hydratedCloudAndBomb.rounds[0].playerResults[affectedPlayer.id].currentBid, 1);

console.log("Alle Tests der Zustandsverwaltung wurden erfolgreich ausgeführt.");
