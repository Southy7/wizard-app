(function attachGameView(root) {
  "use strict";

  function createGameView({
    Logic,
    elements,
    createSeatRoleBadge,
    getState,
    getCurrentRound,
    getPlayerColorIndex,
    getPlayerDisplayNameById,
    formatNumber,
    ROUND_PHASE,
    createScorePlayerRow,
    createScoreBidCell,
    createScoreTotalCell
  }) {
    function renderRoundOverview(phase) {
      const overviewPanel = elements["game-round-overview"];
      const container = elements["game-total-points"];
      container.replaceChildren();
      overviewPanel.hidden = phase !== ROUND_PHASE.BIDS;
      if (overviewPanel.hidden) return;

      container.append(createTotalPointsGrid());
    }

    function createTotalPointsGrid() {
      const state = getState();
      const totals = Logic.calculateTotalPoints(state.rounds, state.players);
      const round = getCurrentRound();
      const order = Logic.getPlayersFromStartingPlayer(state.players, round?.startingPlayerId);
      const overview = document.createElement("div");
      overview.className = "points-strip";
      overview.style.setProperty("--player-count", String(state.players.length));
      overview.setAttribute("aria-label", "Current total scores");

      order.forEach((player) => {
        const card = document.createElement("div");
        card.className = "points-card";
        card.dataset.playerColor = String(getPlayerColorIndex(player.id));

        const name = document.createElement("span");
        name.textContent = getPlayerDisplayNameById(player.id);
        name.title = name.textContent;

        const points = document.createElement("strong");
        points.textContent = formatNumber(totals[player.id]);
        points.setAttribute("aria-label", `${totals[player.id]} total points`);

        card.append(name, points);
        overview.append(card);
      });

      return overview;
    }

    function createBidOverview(round) {
      const state = getState();
      const table = document.createElement("div");
      table.className = "score-table bid-overview";
      const totals = Logic.calculateTotalPoints(state.rounds, state.players);
      const leadingTotal = Math.max(...Object.values(totals));
      // Suppress leader styling before round one is scored because all players start tied.
      const showLeaders = round.number > 1;

      const header = document.createElement("div");
      header.className = "score-row header";
      header.innerHTML = '<span>Player</span><span class="number">Bid</span><span class="number">Points</span>';
      table.append(header);

      const order = Logic.getPlayersFromStartingPlayer(state.players, round.startingPlayerId);
      order.forEach((player) => {
        const result = round.playerResults[player.id];
        const isLeader = showLeaders && totals[player.id] === leadingTotal;
        const row = createScorePlayerRow({
          name: getPlayerDisplayNameById(player.id),
          colorIndex: getPlayerColorIndex(player.id),
          isLeader,
          badge: player.id === round.startingPlayerId ? createSeatRoleBadge("Starting Player", "starter") : null
        });
        const bid = createScoreBidCell({
          currentBid: result.currentBid,
          originalBid: result.originalBid
        });
        const total = createScoreTotalCell({
          points: totals[player.id],
          formattedPoints: formatNumber(totals[player.id]),
          isLeader
        });

        row.append(bid, total);
        table.append(row);
      });

      return table;
    }

    return Object.freeze({
      renderRoundOverview,
      createBidOverview
    });
  }

  root.WizardGameView = Object.freeze({ createGameView });
})(typeof globalThis !== "undefined" ? globalThis : window);
