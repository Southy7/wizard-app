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

// Setup, seating, and dealer rotation
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
assert.deepEqual(
  moved.map((entry) => entry.id),
  ["anna", "chris", "ben", "david"]
);
assert.deepEqual(
  moved.map((entry) => entry.seatPosition),
  [0, 1, 2, 3]
);

const duplicateIds = Logic.getDuplicateNameIds([player("1", "Anna"), player("2", " anna "), player("3", "Ben")]);
assert.equal(duplicateIds.has("1"), true);
assert.equal(duplicateIds.has("2"), true);
assert.equal(duplicateIds.has("3"), false);

const validState = { players, firstDealerId: "anna", totalRounds: 15, totalCards: 70 };
assert.deepEqual(Logic.validateSetup(validState), []);
assert.equal(Logic.createInitialGameState().setupDealerRandomized, false);
assert.equal(Logic.createInitialGameState().roundMode, "full");
assert.match(Logic.createInitialGameState().gameId, /^game-/);
for (let playerCount = 3; playerCount <= 6; playerCount += 1) {
  const initialState = Logic.createInitialGameState(playerCount);
  assert.equal(initialState.players.length, playerCount);
  assert.equal(initialState.totalRounds, Logic.getStandardRounds(playerCount));
  assert.deepEqual(Logic.validateImportedGameState(initialState), []);
}

const invalidState = {
  players: [player("1", ""), player("2", "Ben")],
  firstDealerId: "missing",
  totalRounds: 99,
  totalCards: 70
};
assert.ok(Logic.validateSetup(invalidState).length >= 3);

// Bidding and dependent special-card effects
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

const invalidWitchRound = Logic.createRound(players, "anna", 2);
invalidWitchRound.specialCards.witch.active = true;
assert.ok(Logic.getSpecialCardErrors(invalidWitchRound, players).some((error) => error.includes("Witch requires")));

round.specialCards.cloud = {
  active: true,
  playerId: "anna",
  change: 1
};
round = Logic.recalculateCurrentBids(round, players);
assert.equal(round.playerResults.anna.originalBid, 2);
assert.equal(round.playerResults.anna.currentBid, 3);
assert.equal(Logic.getSpecialCardErrors(round, players).length, 0);

round.specialCards.witch = { active: true, secondEffect: "cloud" };
round.specialCards.secondCloud = {
  active: true,
  playerId: "anna",
  change: -1
};
round = Logic.recalculateCurrentBids(round, players);
assert.equal(round.playerResults.anna.currentBid, 2);
assert.equal(Logic.getSpecialCardErrors(round, players).length, 0);

round.specialCards.bomb.active = true;
round = Logic.recalculateCurrentBids(round, players);
assert.equal(round.playerResults.anna.currentBid, 2);
assert.equal(Logic.getActiveBombCount(round), 1);
assert.equal(Logic.getExpectedTrickCount(round), 4);
assert.equal(Logic.getSpecialCardErrors(round, players).length, 0);

round.specialCards.witch.secondEffect = "bomb";
round.specialCards.secondCloud = {
  active: false,
  playerId: null,
  change: 0
};
round.specialCards.secondBomb.active = true;
round = Logic.recalculateCurrentBids(round, players);
assert.equal(Logic.getActiveBombCount(round), 2);
assert.equal(Logic.getExpectedTrickCount(round), 3);
assert.equal(Logic.getSpecialCardErrors(round, players).length, 0);

let negativeRound = Logic.createRound(players, "anna", 2);
negativeRound.specialCards.cloud = {
  active: true,
  playerId: "ben",
  change: -1
};
negativeRound = Logic.recalculateCurrentBids(negativeRound, players);
assert.equal(negativeRound.playerResults.ben.currentBid, -1);
assert.ok(Logic.getSpecialCardErrors(negativeRound, players).some((error) => error.includes("negative bid")));

let incompleteWitchRound = Logic.createRound(players, "anna", 3);
incompleteWitchRound.specialCards.witch = { active: true, secondEffect: "cloud" };
assert.ok(Logic.getSpecialCardErrors(incompleteWitchRound, players).some((error) => error.includes("incomplete")));

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

// Trick validation and scoring
assert.equal(Logic.calculatePoints(0, 0), 20);
assert.equal(Logic.calculatePoints(1, 1), 30);
assert.equal(Logic.calculatePoints(3, 3), 50);
assert.equal(Logic.calculatePoints(2, 1), -10);
assert.equal(Logic.calculatePoints(2, 4), -20);
assert.equal(Logic.calculatePoints(0, 3), -30);

round = Logic.calculateRoundPoints(round, players);
assert.equal(round.playerResults.anna.roundPoints, -20);
assert.equal(round.playerResults.ben.roundPoints, 30);
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
assert.equal(totals.anna, 0);
assert.equal(totals.ben, 50);
assert.equal(totals.chris, 10);
assert.equal(totals.david, 10);

completedSecond.completed = false;
const totalsWithoutSecond = Logic.calculateTotalPoints([round, completedSecond], players);
assert.equal(totalsWithoutSecond.anna, -20);
assert.equal(totalsWithoutSecond.ben, 30);

// Strict import validation and explicitly allowed transient persisted states
const validImport = require("../examples/history-game-1.json").gameState;
assert.deepEqual(Logic.validateImportedGameState(validImport), []);
assert.deepEqual(Logic.createCanonicalGameState(validImport), validImport);
assert.deepEqual(Logic.validateImportedGameState(Logic.createInitialGameState()), []);
assert.deepEqual(Logic.validatePersistableGameState(Logic.createInitialGameState()), []);

const importWithUnknownFields = JSON.parse(JSON.stringify(validImport));
const importedPlayerId = importWithUnknownFields.players[0].id;
importWithUnknownFields.archivedAt = "2026-07-20T12:00:00.000Z";
importWithUnknownFields.unknownState = { retained: false };
importWithUnknownFields.players[0].unknownPlayer = true;
importWithUnknownFields.rounds[0].unknownRound = true;
importWithUnknownFields.rounds[0].playerResults[importedPlayerId].unknownResult = true;
importWithUnknownFields.rounds[0].specialCards.unknownCollection = true;
importWithUnknownFields.rounds[0].specialCards.cloud.unknownCard = true;
assert.deepEqual(Logic.validateImportedGameState(importWithUnknownFields), []);

const canonicalImport = Logic.createCanonicalGameState(importWithUnknownFields, {
  includeArchiveMetadata: true
});
assert.deepEqual(Logic.validateImportedGameState(canonicalImport), []);
assert.equal(canonicalImport.archivedAt, importWithUnknownFields.archivedAt);
assert.equal("unknownState" in canonicalImport, false);
assert.equal("unknownPlayer" in canonicalImport.players[0], false);
assert.equal("unknownRound" in canonicalImport.rounds[0], false);
assert.equal("unknownResult" in canonicalImport.rounds[0].playerResults[importedPlayerId], false);
assert.equal("unknownCollection" in canonicalImport.rounds[0].specialCards, false);
assert.equal("unknownCard" in canonicalImport.rounds[0].specialCards.cloud, false);

const importWithInvalidArchiveDate = JSON.parse(JSON.stringify(validImport));
importWithInvalidArchiveDate.archivedAt = "not-a-date";
assert.equal("archivedAt" in Logic.createCanonicalGameState(importWithInvalidArchiveDate), false);
assert.equal("archivedAt" in Logic.createCanonicalGameState(importWithUnknownFields), false);

const bidTotalInvariantState = Logic.createInitialGameState(3);
bidTotalInvariantState.players.forEach((entry, index) => {
  entry.name = ["Anna", "Ben", "Chris"][index];
});
bidTotalInvariantState.status = "running";
bidTotalInvariantState.setupDealerRandomized = true;
bidTotalInvariantState.roundMode = "individual";
bidTotalInvariantState.totalRounds = 1;
bidTotalInvariantState.currentRound = 1;
const bidTotalInvariantRound = Logic.createRound(
  bidTotalInvariantState.players,
  bidTotalInvariantState.firstDealerId,
  1
);
const firstBidResult = bidTotalInvariantRound.playerResults[bidTotalInvariantState.players[0].id];
firstBidResult.originalBid = 1;
firstBidResult.currentBid = 1;
bidTotalInvariantState.rounds = [bidTotalInvariantRound];

assert.ok(!Logic.validatePersistableGameState(bidTotalInvariantState).some((error) => error.includes("bid total")));

for (const phase of ["play", "tricks", "result"]) {
  const candidate = JSON.parse(JSON.stringify(bidTotalInvariantState));
  candidate.rounds[0].phase = phase;
  assert.ok(Logic.validatePersistableGameState(candidate).some((error) => error.includes("bid total")));
  assert.ok(Logic.validateImportedGameState(candidate).some((error) => error.includes("bid total")));
}

const persistableWitchState = Logic.createInitialGameState(3);
persistableWitchState.players.forEach((entry, index) => {
  entry.name = ["Anna", "Ben", "Chris"][index];
});
persistableWitchState.status = "running";
persistableWitchState.setupDealerRandomized = true;
persistableWitchState.roundMode = "individual";
persistableWitchState.totalRounds = 1;
const persistableWitchRound = Logic.createRound(persistableWitchState.players, persistableWitchState.firstDealerId, 1);
persistableWitchRound.phase = "play";
persistableWitchRound.specialCards.bomb.active = true;
persistableWitchRound.specialCards.witch = { active: true, secondEffect: null };
persistableWitchState.rounds = [persistableWitchRound];
assert.ok(Logic.validateImportedGameState(persistableWitchState).some((error) => error.includes("Witch")));
assert.deepEqual(Logic.validatePersistableGameState(persistableWitchState), []);

const cloudValidationState = Logic.createInitialGameState(3);
cloudValidationState.players.forEach((entry, index) => {
  entry.name = ["Anna", "Ben", "Chris"][index];
});
cloudValidationState.status = "running";
cloudValidationState.setupDealerRandomized = true;
cloudValidationState.roundMode = "individual";
cloudValidationState.totalRounds = 1;
cloudValidationState.currentRound = 1;
let cloudValidationRound = Logic.createRound(cloudValidationState.players, cloudValidationState.firstDealerId, 1);
cloudValidationRound.phase = "play";
cloudValidationRound.playerResults[cloudValidationState.players[0].id].originalBid = 1;
cloudValidationRound.playerResults[cloudValidationState.players[1].id].originalBid = 1;
cloudValidationRound.specialCards.cloud = {
  active: true,
  playerId: cloudValidationState.players[0].id,
  change: 1
};
cloudValidationRound = Logic.recalculateCurrentBids(cloudValidationRound, cloudValidationState.players);
cloudValidationState.rounds = [cloudValidationRound];
assert.equal(cloudValidationRound.playerResults[cloudValidationState.players[0].id].currentBid, 2);
assert.deepEqual(Logic.validateImportedGameState(cloudValidationState), []);

cloudValidationRound.specialCards.witch = { active: true, secondEffect: "cloud" };
cloudValidationRound.specialCards.secondCloud = {
  active: true,
  playerId: cloudValidationState.players[0].id,
  change: 1
};
cloudValidationRound = Logic.recalculateCurrentBids(cloudValidationRound, cloudValidationState.players);
cloudValidationState.rounds = [cloudValidationRound];
assert.equal(cloudValidationRound.playerResults[cloudValidationState.players[0].id].currentBid, 3);
assert.deepEqual(Logic.validateImportedGameState(cloudValidationState), []);

function invalidImport(mutator) {
  const candidate = JSON.parse(JSON.stringify(validImport));
  mutator(candidate);
  return Logic.validateImportedGameState(candidate);
}

function assertInvalidImport(mutator) {
  assert.ok(invalidImport(mutator).length > 0);
}

for (const [field, expectedMessage] of [
  ["gameId", "game ID"],
  ["updatedAt", "last-updated date"],
  ["totalCards", "70 cards"],
  ["setupDealerRandomized", "dealer-selection status"],
  ["roundOneHintConfirmed", "first-round confirmation status"]
]) {
  assert.ok(
    invalidImport((candidate) => {
      delete candidate[field];
    }).some((error) => error.includes(expectedMessage))
  );
}

assert.ok(
  invalidImport((candidate) => {
    candidate.gameId = "invalid game id";
  }).some((error) => error.includes("game ID"))
);

assert.ok(
  invalidImport((candidate) => {
    candidate.updatedAt = "2099-01-01T00:00:00.000Z";
  }).some((error) => error.includes("far in the future"))
);

const clockSkewImport = JSON.parse(JSON.stringify(validImport));
clockSkewImport.updatedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
assert.deepEqual(Logic.validateImportedGameState(clockSkewImport), []);

assert.ok(
  invalidImport((candidate) => {
    candidate.updatedAt = "2026-07-20";
  }).some((error) => error.includes("valid last-updated date"))
);

assert.ok(
  invalidImport((candidate) => {
    candidate.roundOneHintConfirmed = "yes";
  }).some((error) => error.includes("first-round confirmation status"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.players[0].seatPosition;
  }).some((error) => error.includes("seating order"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.rounds[0].dealerId;
  }).some((error) => error.includes("dealer in round 1"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.rounds[0].startingPlayerId;
  }).some((error) => error.includes("starting player in round 1"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.rounds[0].completedAt;
  }).some((error) => error.includes("completion date field"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.rounds[0].specialCards;
  }).some((error) => error.includes("special-card data for round 1 is missing"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.rounds[0].specialCards.secondBomb;
  }).some((error) => error.includes("special-card data for round 1 is incomplete"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.rounds[0].specialCards.cloud.change;
  }).some((error) => error.includes("cloud special card in round 1 is invalid"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.rounds[0].specialCards.witch.secondEffect;
  }).some((error) => error.includes("Witch in round 1 is invalid"))
);

assert.ok(
  invalidImport((candidate) => {
    delete candidate.rounds[0].playerResults["example-1-lena"].roundPoints;
  }).some((error) => error.includes("player data for round 1 is incomplete"))
);

const missingRequiredPersistableField = Logic.createInitialGameState();
delete missingRequiredPersistableField.gameId;
assert.ok(
  Logic.validatePersistableGameState(missingRequiredPersistableField).some((error) => error.includes("game ID"))
);

const futurePersistableState = Logic.createInitialGameState();
futurePersistableState.updatedAt = "2099-01-01T00:00:00.000Z";
assert.ok(
  Logic.validatePersistableGameState(futurePersistableState).some((error) => error.includes("far in the future"))
);

assertInvalidImport((candidate) => {
  candidate.players[1].id = candidate.players[0].id;
});

assertInvalidImport((candidate) => {
  candidate.schemaVersion = 3;
});

assertInvalidImport((candidate) => {
  candidate.players[0].id = "__proto__";
});

assertInvalidImport((candidate) => {
  candidate.rounds.push(JSON.parse(JSON.stringify(candidate.rounds[0])));
});

assertInvalidImport((candidate) => {
  candidate.rounds[0].playerResults["example-1-lena"].originalBid = 999;
  candidate.rounds[0].playerResults["example-1-lena"].currentBid = 999;
  candidate.rounds[0].playerResults["example-1-lena"].tricks = 999;
});

assertInvalidImport((candidate) => {
  candidate.firstDealerId = "missing";
});

assertInvalidImport((candidate) => {
  candidate.rounds[0].phase = "invalid";
});

assertInvalidImport((candidate) => {
  candidate.rounds[0].specialCards = {
    witch: { active: true, secondEffect: null }
  };
});

assertInvalidImport((candidate) => {
  candidate.rounds[0].playerResults["example-1-lena"].tricks = 0;
});

assertInvalidImport((candidate) => {
  candidate.rounds.splice(0, 1);
});

assert.ok(
  invalidImport((candidate) => {
    candidate.currentRound = 1;
  }).some((error) => error.includes("every round as completed"))
);

assert.ok(
  invalidImport((candidate) => {
    candidate.rounds[0].completed = false;
    candidate.rounds[0].phase = "tricks";
    candidate.rounds[0].completedAt = null;
    Object.values(candidate.rounds[0].playerResults).forEach((result) => {
      result.roundPoints = null;
    });
  }).some((error) => error.includes("every round as completed"))
);

console.log("All game-logic tests passed.");
