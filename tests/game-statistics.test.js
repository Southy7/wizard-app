"use strict";

const assert = require("node:assert/strict");
const Statistics = require("../js/game-statistics.js");

const players = [
  { id: "anna", name: "Anna" },
  { id: "ben", name: "Ben" },
  { id: "clara", name: "Clara" }
];

function round(number, results, specialCards = {}) {
  return {
    number,
    completed: true,
    playerResults: Object.fromEntries(
      Object.entries(results).map(([playerId, [currentBid, tricks, roundPoints]]) => [
        playerId,
        { currentBid, tricks, roundPoints }
      ])
    ),
    specialCards: {
      cloud: { active: false },
      bomb: { active: false },
      secondCloud: { active: false },
      secondBomb: { active: false },
      ...specialCards
    }
  };
}

const result = Statistics.calculate(
  [
    round(
      1,
      {
        anna: [1, 1, 30],
        ben: [1, 0, -10],
        clara: [0, 0, 20]
      },
      { bomb: { active: true }, cloud: { active: true } }
    ),
    round(
      2,
      {
        anna: [0, 1, -10],
        ben: [0, 0, 20],
        clara: [1, 1, 30]
      },
      { secondBomb: { active: true } }
    ),
    round(
      3,
      {
        anna: [0, 0, 20],
        ben: [1, 1, 30],
        clara: [1, 0, -10]
      },
      { secondCloud: { active: true } }
    ),
    round(4, {
      anna: [2, 2, 40],
      ben: [0, 0, 20],
      clara: [0, 1, -10]
    })
  ],
  players
);

assert.equal(result.roundCount, 4);
assert.deepEqual(result.specialCards, { bombs: 2, clouds: 2 });

const [anna, ben, clara] = result.players;
assert.deepEqual(
  {
    totalPoints: anna.totalPoints,
    hitCount: anna.hitCount,
    accuracy: anna.accuracy,
    bestRound: anna.bestRound,
    worstRound: anna.worstRound,
    averagePoints: anna.averagePoints,
    bestStreak: anna.bestStreak,
    zeroBidCount: anna.zeroBidCount,
    successfulZeroBidCount: anna.successfulZeroBidCount,
    zeroBidAccuracy: anna.zeroBidAccuracy,
    roundsLed: anna.roundsLed,
    finalRank: anna.finalRank,
    worstRank: anna.worstRank,
    comebackPlaces: anna.comebackPlaces
  },
  {
    totalPoints: 80,
    hitCount: 3,
    accuracy: 75,
    bestRound: { points: 40, roundNumber: 4 },
    worstRound: { points: -10, roundNumber: 2 },
    averagePoints: 20,
    bestStreak: 2,
    zeroBidCount: 2,
    successfulZeroBidCount: 1,
    zeroBidAccuracy: 50,
    roundsLed: 3,
    finalRank: 1,
    worstRank: 2,
    comebackPlaces: 1
  }
);

assert.equal(ben.comebackPlaces, 1);
assert.equal(ben.comebackPointsGained, 70);
assert.equal(ben.bestStreak, 3);
assert.equal(ben.zeroBidAccuracy, 100);
assert.equal(clara.worstRound.roundNumber, 3, "Earliest round must win equal-score ties.");
assert.equal(clara.averagePoints, 7.5);
assert.equal(clara.roundsLed, 2);

assert.equal(result.highlights.bestAccuracy.player.id, "anna", "Seat order must break equal accuracy ties.");
assert.equal(result.highlights.bestRound.player.id, "anna");
assert.equal(result.highlights.biggestComeback.player.id, "ben", "Points gained must break comeback ties.");
assert.equal(result.highlights.mostRoundsLed.player.id, "anna");
assert.equal(result.highlights.longestStreak.player.id, "ben");
assert.equal(result.highlights.mostSuccessfulZeroBids.player.id, "ben");

console.log("All game-statistics tests passed.");
