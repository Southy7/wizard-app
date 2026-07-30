(function attachGameStatistics(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardGameStatistics = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createGameStatistics() {
  "use strict";

  function calculate(completedRounds, players) {
    const rounds = [...completedRounds].sort((a, b) => a.number - b.number);
    const workingStats = players.map((player, originalIndex) => ({
      player,
      originalIndex,
      totalPoints: 0,
      hitCount: 0,
      bestStreak: 0,
      currentStreak: 0,
      zeroBidCount: 0,
      successfulZeroBidCount: 0,
      roundsLed: 0,
      bestRound: null,
      worstRound: null,
      standings: []
    }));
    const specialCards = { bombs: 0, clouds: 0 };

    rounds.forEach((round) => {
      specialCards.bombs += Number(Boolean(round.specialCards?.bomb?.active));
      specialCards.bombs += Number(Boolean(round.specialCards?.secondBomb?.active));
      specialCards.clouds += Number(Boolean(round.specialCards?.cloud?.active));
      specialCards.clouds += Number(Boolean(round.specialCards?.secondCloud?.active));

      workingStats.forEach((stats) => {
        const result = round.playerResults?.[stats.player.id] ?? {};
        const currentBid = Number(result.currentBid) || 0;
        const tricks = Number(result.tricks) || 0;
        const points = Number(result.roundPoints) || 0;
        const hit = currentBid === tricks;

        stats.totalPoints += points;
        if (hit) {
          stats.hitCount += 1;
          stats.currentStreak += 1;
          stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
        } else {
          stats.currentStreak = 0;
        }
        if (currentBid === 0) {
          stats.zeroBidCount += 1;
          if (hit) stats.successfulZeroBidCount += 1;
        }
        if (!stats.bestRound || points > stats.bestRound.points) {
          stats.bestRound = { points, roundNumber: round.number };
        }
        if (!stats.worstRound || points < stats.worstRound.points) {
          stats.worstRound = { points, roundNumber: round.number };
        }
      });

      const ranks = calculateRanks(workingStats);
      const leadingTotal = Math.max(...workingStats.map(({ totalPoints }) => totalPoints));
      workingStats.forEach((stats) => {
        const rank = ranks.get(stats.player.id);
        stats.standings.push({ rank, totalPoints: stats.totalPoints });
        if (stats.totalPoints === leadingTotal) stats.roundsLed += 1;
      });
    });

    const roundCount = rounds.length;
    const finalRanks = calculateRanks(workingStats);
    const finalizedPlayers = workingStats.map((stats) => {
      const accuracy = roundCount === 0 ? 0 : (stats.hitCount / roundCount) * 100;
      const averagePoints = roundCount === 0 ? 0 : stats.totalPoints / roundCount;
      const zeroBidAccuracy = stats.zeroBidCount === 0 ? 0 : (stats.successfulZeroBidCount / stats.zeroBidCount) * 100;
      const finalRank = finalRanks.get(stats.player.id);
      const worstRank = Math.max(finalRank, ...stats.standings.map(({ rank }) => rank));
      const comebackPlaces = Math.max(0, worstRank - finalRank);
      const comebackPointsGained = Math.max(
        0,
        ...stats.standings
          .filter(({ rank }) => rank === worstRank)
          .map(({ totalPoints }) => stats.totalPoints - totalPoints)
      );
      return {
        player: stats.player,
        originalIndex: stats.originalIndex,
        totalPoints: stats.totalPoints,
        hitCount: stats.hitCount,
        bestStreak: stats.bestStreak,
        zeroBidCount: stats.zeroBidCount,
        successfulZeroBidCount: stats.successfulZeroBidCount,
        roundsLed: stats.roundsLed,
        bestRound: stats.bestRound,
        worstRound: stats.worstRound,
        accuracy,
        averagePoints,
        zeroBidAccuracy,
        finalRank,
        worstRank,
        comebackPlaces,
        comebackPointsGained
      };
    });

    return {
      roundCount,
      players: finalizedPlayers,
      highlights: {
        bestAccuracy: selectBest(finalizedPlayers, (left, right) => right.accuracy - left.accuracy),
        bestRound: selectBest(
          finalizedPlayers,
          (left, right) =>
            right.bestRound.points - left.bestRound.points || left.bestRound.roundNumber - right.bestRound.roundNumber
        ),
        biggestComeback: selectBest(
          finalizedPlayers,
          (left, right) =>
            right.comebackPlaces - left.comebackPlaces || right.comebackPointsGained - left.comebackPointsGained
        ),
        mostRoundsLed: selectBest(finalizedPlayers, (left, right) => right.roundsLed - left.roundsLed),
        longestStreak: selectBest(finalizedPlayers, (left, right) => right.bestStreak - left.bestStreak),
        mostSuccessfulZeroBids: selectBest(
          finalizedPlayers,
          (left, right) => right.successfulZeroBidCount - left.successfulZeroBidCount
        )
      },
      specialCards
    };
  }

  function calculateRanks(playerStats) {
    const sorted = [...playerStats].sort(
      (left, right) => right.totalPoints - left.totalPoints || left.originalIndex - right.originalIndex
    );
    const ranks = new Map();
    let rank = 0;
    let previousPoints = null;
    sorted.forEach((stats, index) => {
      if (stats.totalPoints !== previousPoints) rank = index + 1;
      previousPoints = stats.totalPoints;
      ranks.set(stats.player.id, rank);
    });
    return ranks;
  }

  function selectBest(playerStats, compare) {
    return [...playerStats].sort((left, right) => compare(left, right) || left.originalIndex - right.originalIndex)[0];
  }

  return Object.freeze({ calculate });
});
