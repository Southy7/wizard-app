(function attachResultView(root) {
  "use strict";

  const Formatters = root.WizardFormatters;

  function renderRanking(container, gameState, totals) {
    const ranking = getRankedPlayers(gameState, totals);

    container.replaceChildren();
    // Use competition ranking: tied players share a place and the following place is skipped.
    let displayedPosition = 0;
    let previousPoints = null;
    const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };

    ranking.forEach((entry, index) => {
      if (entry.points !== previousPoints) displayedPosition = index + 1;
      previousPoints = entry.points;
      if (displayedPosition > 3) return;

      const row = document.createElement("div");
      row.className = "ranking-row";
      row.dataset.rank = String(displayedPosition);
      row.dataset.playerColor = String(
        gameState.players.findIndex((player) => player.id === entry.player.id) + 1
      );

      const position = document.createElement("span");
      position.className = "ranking-position";
      position.textContent = medals[displayedPosition] ?? String(displayedPosition);
      position.setAttribute("aria-label", `Place ${displayedPosition}`);

      const name = document.createElement("span");
      name.className = "ranking-name";
      name.textContent = Formatters.getPlayerDisplayName(gameState, entry.player.id);

      const points = document.createElement("span");
      points.className = "ranking-points";
      points.textContent = `${Formatters.formatNumber(entry.points)} Points`;

      row.append(position, name, points);
      container.append(row);
    });
  }

  function renderScoreHistory(container, completedRounds, totals, gameState) {
    container.replaceChildren();
    const rankedPlayers = getRankedPlayers(gameState, totals);

    const table = document.createElement("table");
    table.className = "history-table";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const roundHead = document.createElement("th");
    roundHead.scope = "col";
    roundHead.textContent = "Round";
    headRow.append(roundHead);

    rankedPlayers.forEach(({ player, originalIndex }) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.dataset.playerColor = String(originalIndex + 1);
      th.textContent = Formatters.getPlayerDisplayName(gameState, player.id, originalIndex);
      headRow.append(th);
    });
    head.append(headRow);

    const body = document.createElement("tbody");
    completedRounds.forEach((round) => {
      const row = document.createElement("tr");
      const roundCell = document.createElement("th");
      roundCell.scope = "row";
      roundCell.textContent = String(round.number);
      row.append(roundCell);

      rankedPlayers.forEach(({ player, originalIndex }) => {
        const points = Number(round.playerResults?.[player.id]?.roundPoints) || 0;
        const cell = document.createElement("td");
        cell.dataset.playerColor = String(originalIndex + 1);
        cell.textContent = Formatters.formatSigned(points);
        cell.className = points >= 0 ? "positive" : "negative";
        row.append(cell);
      });
      body.append(row);
    });

    const foot = document.createElement("tfoot");
    const totalRow = document.createElement("tr");
    const totalLabel = document.createElement("th");
    totalLabel.scope = "row";
    totalLabel.textContent = "Total";
    totalRow.append(totalLabel);
    const leadingTotal = rankedPlayers[0]?.points ?? 0;
    rankedPlayers.forEach(({ originalIndex, points }) => {
      const cell = document.createElement("td");
      cell.dataset.playerColor = String(originalIndex + 1);
      cell.textContent = Formatters.formatNumber(points);
      if (points === leadingTotal) cell.classList.add("leader-total");
      totalRow.append(cell);
    });
    foot.append(totalRow);

    table.append(head, body, foot);
    container.append(table);
  }

  function getRankedPlayers(gameState, totals) {
    // Seat order is a deterministic layout tie-breaker; it does not change tied players' rank.
    return gameState.players
      .map((player, originalIndex) => ({
        player,
        originalIndex,
        points: Number(totals[player.id]) || 0
      }))
      .sort((a, b) => (b.points - a.points) || (a.originalIndex - b.originalIndex));
  }

  root.WizardResultView = Object.freeze({
    renderRanking,
    renderScoreHistory
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
