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
    formatNumber
  }) {
    function renderRoundOverview(phase) {
      const overviewPanel = elements["game-round-overview"];
      const container = elements["game-total-points"];
      container.replaceChildren();
      overviewPanel.hidden = phase !== "bids";
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
        const row = document.createElement("div");
        row.className = "score-row";
        row.dataset.playerColor = String(getPlayerColorIndex(player.id));

        const nameCell = document.createElement("div");
        nameCell.className = "score-player-with-badge";

        const name = document.createElement("span");
        name.className = "score-player-name";
        name.textContent = getPlayerDisplayNameById(player.id);
        nameCell.append(name);

        const isLeader = showLeaders && totals[player.id] === leadingTotal;
        if (isLeader) {
          const crown = document.createElement("span");
          crown.className = "leader-crown";
          crown.textContent = "👑";
          crown.setAttribute("aria-label", "Current leader");
          nameCell.append(crown);
        }

        if (player.id === round.startingPlayerId) {
          nameCell.append(createSeatRoleBadge("Starting Player", "starter"));
        }

        const bid = document.createElement("span");
        bid.className = `number${result.currentBid !== result.originalBid ? " changed-bid" : ""}`;
        bid.textContent = String(result.currentBid);
        if (result.currentBid !== result.originalBid) {
          bid.title = `Originally ${result.originalBid}`;
        }

        const total = document.createElement("span");
        total.className = `number total-points${isLeader ? " leader-points" : ""}`;
        total.textContent = formatNumber(totals[player.id]);
        total.setAttribute("aria-label", `${totals[player.id]} total points`);

        row.append(nameCell, bid, total);
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
