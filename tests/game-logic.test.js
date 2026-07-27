"use strict";

const assert = require("node:assert/strict");
const Logic = require("../js/game-logic.js");

function player(id, name = id) {
  return { id, name, seatPosition: 0 };
}

function makePlayers() {
  return Logic.normalizeSeatPositions([
    player("anna", "Anna"),
    player("ben", "Ben"),
    player("chris", "Chris"),
    player("david", "David")
  ]);
}

function setOriginalBids(round, values) {
  Object.entries(values).forEach(([playerId, bid]) => {
    round.playerResults[playerId].originalBid = bid;
  });
  return round;
}

const players = makePlayers();

// Einrichtung und Rotation
assert.equal(Logic.getStandardRounds(3), 20);
assert.equal(Logic.getStandardRounds(4), 15);
assert.equal(Logic.getStandardRounds(5), 12);
assert.equal(Logic.getStandardRounds(6), 10);
assert.equal(Logic.getMaximumRounds(3, 70), 23);
assert.equal(Logic.getMaximumRounds(4, 70), 17);
assert.equal(Logic.getMaximumRounds(5, 70), 14);
assert.equal(Logic.getMaximumRounds(6, 70), 11);
assert.equal(Logic.clampRoundCount(0, 4, 70), 1);
assert.equal(Logic.clampRoundCount(99, 4, 70), 17);
assert.equal(Logic.clampRoundCount("12", 4, 70), 12);
assert.equal(Logic.getDealerForRound(players, "anna", 1).id, "anna");
assert.equal(Logic.getStartingPlayerForRound(players, "anna", 1).id, "ben");
assert.equal(Logic.getDealerForRound(players, "anna", 4).id, "david");
assert.equal(Logic.getStartingPlayerForRound(players, "anna", 4).id, "anna");
assert.deepEqual(
  Logic.getPlayersFromStartingPlayer(players, "chris").map((entry) => entry.id),
  ["chris", "david", "anna", "ben"]
);

const moved = Logic.movePlayer(players, "chris", "up");
assert.deepEqual(moved.map((entry) => entry.id), ["anna", "chris", "ben", "david"]);
assert.deepEqual(moved.map((entry) => entry.seatPosition), [0, 1, 2, 3]);

const duplicateIds = Logic.getDuplicateNameIds([
  player("1", "Anna"),
  player("2", " anna "),
  player("3", "Ben")
]);
assert.equal(duplicateIds.has("1"), true);
assert.equal(duplicateIds.has("2"), true);
assert.equal(duplicateIds.has("3"), false);

const validState = { players, firstDealerId: "anna", totalRounds: 15, totalCards: 70 };
assert.deepEqual(Logic.validateSetup(validState), []);
assert.equal(Logic.createInitialGameState().setupDealerRandomized, false);

const invalidState = {
  players: [player("1", ""), player("2", "Ben")],
  firstDealerId: "missing",
  totalRounds: 99,
  totalCards: 70
};
assert.ok(Logic.validateSetup(invalidState).length >= 3);

// Runde und Ansagesumme
let round = Logic.createRound(players, "anna", 5);
assert.equal(round.number, 5);
assert.equal(round.dealerId, "anna");
assert.equal(round.startingPlayerId, "ben");
assert.equal(round.phase, "bids");

setOriginalBids(round, { anna: 2, ben: 1, chris: 0, david: 1 });
assert.equal(Logic.getBidSum(round), 4);
assert.equal(Logic.getBidDifference(round), -1);
assert.equal(Logic.isBidSumValid(round), true);
round.playerResults.david.originalBid = 2;
assert.equal(Logic.getBidSum(round), 5);
assert.equal(Logic.isBidSumValid(round), false);
round.playerResults.david.originalBid = 1;

// Hexe benötigt eine bereits gespielte Wolke oder Bombe
const invalidWitchRound = Logic.createRound(players, "anna", 2);
invalidWitchRound.specialCards.witch.active = true;
assert.ok(Logic.getSpecialCardErrors(invalidWitchRound, players).some((error) => error.includes("Hexe benötigt")));

// Erste Wolke
round.specialCards.cloud = {
  active: true,
  playerId: "anna",
  change: 1,
  suppressedByBomb: false
};
round = Logic.recalculateCurrentBids(round, players);
assert.equal(round.playerResults.anna.originalBid, 2);
assert.equal(round.playerResults.anna.currentBid, 3);
assert.equal(Logic.getSpecialCardErrors(round, players).length, 0);

// Zweite Wolke durch Hexe
round.specialCards.witch = { active: true, secondEffect: "cloud" };
round.specialCards.secondCloud = {
  active: true,
  playerId: "anna",
  change: -1,
  suppressedByBomb: false
};
round = Logic.recalculateCurrentBids(round, players);
assert.equal(round.playerResults.anna.currentBid, 2);
assert.equal(Logic.getSpecialCardErrors(round, players).length, 0);

// Bombe unterdrückt eine Wolke
round.specialCards.bomb.active = true;
round.specialCards.cloud.suppressedByBomb = true;
round = Logic.recalculateCurrentBids(round, players);
assert.equal(round.playerResults.anna.currentBid, 1);
assert.equal(Logic.getActiveBombCount(round), 1);
assert.equal(Logic.getExpectedTrickCount(round), 4);
assert.equal(Logic.getSpecialCardErrors(round, players).length, 0);

// Eine Bombe darf nicht zwei Wolken in zwei verschiedenen Stichen unterdrücken
round.specialCards.secondCloud.suppressedByBomb = true;
assert.ok(Logic.getSpecialCardErrors(round, players).some((error) => error.includes("Mehr Wolken")));
round.specialCards.secondCloud.suppressedByBomb = false;

// Zweite Bombe durch Hexe statt zweiter Wolke
round.specialCards.witch.secondEffect = "bomb";
round.specialCards.secondCloud = {
  active: false,
  playerId: null,
  change: 0,
  suppressedByBomb: false
};
round.specialCards.secondBomb.active = true;
round = Logic.recalculateCurrentBids(round, players);
assert.equal(Logic.getActiveBombCount(round), 2);
assert.equal(Logic.getExpectedTrickCount(round), 3);
assert.equal(Logic.getSpecialCardErrors(round, players).length, 0);

// Negative Ansage durch Wolke wird erkannt
let negativeRound = Logic.createRound(players, "anna", 2);
negativeRound.specialCards.cloud = {
  active: true,
  playerId: "ben",
  change: -1,
  suppressedByBomb: false
};
negativeRound = Logic.recalculateCurrentBids(negativeRound, players);
assert.equal(negativeRound.playerResults.ben.currentBid, -1);
assert.ok(Logic.getSpecialCardErrors(negativeRound, players).some((error) => error.includes("negative Ansage")));


// Unvollständige Hexenauswahl wird erkannt
let incompleteWitchRound = Logic.createRound(players, "anna", 3);
incompleteWitchRound.specialCards.witch = { active: true, secondEffect: "cloud" };
assert.ok(Logic.getSpecialCardErrors(incompleteWitchRound, players).some((error) => error.includes("nicht vollständig")));

// Stichprüfung
round.playerResults.anna.tricks = 1;
round.playerResults.ben.tricks = 1;
round.playerResults.chris.tricks = 1;
round.playerResults.david.tricks = 0;
let trickValidation = Logic.validateTrickSum(round);
assert.equal(trickValidation.expected, 3);
assert.equal(trickValidation.actual, 3);
assert.equal(trickValidation.valid, true);

round.playerResults.david.tricks = 1;
trickValidation = Logic.validateTrickSum(round);
assert.equal(trickValidation.valid, false);
assert.equal(trickValidation.difference, 1);
round.playerResults.david.tricks = 0;

// Punkteformel
assert.equal(Logic.calculatePoints(0, 0), 20);
assert.equal(Logic.calculatePoints(1, 1), 30);
assert.equal(Logic.calculatePoints(3, 3), 50);
assert.equal(Logic.calculatePoints(2, 1), -10);
assert.equal(Logic.calculatePoints(2, 4), -20);
assert.equal(Logic.calculatePoints(0, 3), -30);

round = Logic.calculateRoundPoints(round, players);
assert.equal(round.playerResults.anna.roundPoints, -10); // aktuelle Ansage 2, ein Stich
assert.equal(round.playerResults.ben.roundPoints, 30);   // Ansage 1, ein Stich
assert.equal(round.playerResults.chris.roundPoints, -10);
assert.equal(round.playerResults.david.roundPoints, -10);

round.completed = true;
const secondRound = Logic.createRound(players, "anna", 6);
setOriginalBids(secondRound, { anna: 0, ben: 0, chris: 0, david: 0 });
secondRound.playerResults.anna.tricks = 0;
secondRound.playerResults.ben.tricks = 0;
secondRound.playerResults.chris.tricks = 0;
secondRound.playerResults.david.tricks = 0;
let completedSecond = Logic.calculateRoundPoints(secondRound, players);
completedSecond.completed = true;

const totals = Logic.calculateTotalPoints([round, completedSecond], players);
assert.equal(totals.anna, 10);
assert.equal(totals.ben, 50);
assert.equal(totals.chris, 10);
assert.equal(totals.david, 10);

// Nicht abgeschlossene Runden dürfen den Gesamtstand nicht beeinflussen
completedSecond.completed = false;
const totalsWithoutSecond = Logic.calculateTotalPoints([round, completedSecond], players);
assert.equal(totalsWithoutSecond.anna, -10);
assert.equal(totalsWithoutSecond.ben, 30);

console.log("Alle Tests der Spiellogik wurden erfolgreich ausgeführt.");
