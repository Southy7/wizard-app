(function attachResultView(root) {
  "use strict";

  function renderRanking(container, gameState, totals) {
    const ranking = [...gameState.players]
      .map((player) => ({ player, points: totals[player.id] }))
      .sort((a, b) => b.points - a.points);

    container.replaceChildren();
    let displayedPosition = 0;
    let previousPoints = null;
    const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };

    ranking.forEach((entry, index) => {
      if (entry.points !== previousPoints) displayedPosition = index + 1;
      previousPoints = entry.points;

      const row = document.createElement("div");
      row.className = "ranking-row";

      const position = document.createElement("span");
      position.className = "ranking-position";
      position.textContent = medals[displayedPosition] ?? String(displayedPosition);
      position.setAttribute("aria-label", `Place ${displayedPosition}`);

      const name = document.createElement("span");
      name.className = "ranking-name";
      name.textContent = getPlayerDisplayName(gameState, entry.player.id);

      const points = document.createElement("span");
      points.className = "ranking-points";
      points.textContent = `${entry.points} Points`;

      row.append(position, name, points);
      container.append(row);
    });
  }

  function renderScoreHistory(container, completedRounds, totals, gameState) {
    container.replaceChildren();

    const table = document.createElement("table");
    table.className = "history-table";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const roundHead = document.createElement("th");
    roundHead.scope = "col";
    roundHead.textContent = "Round";
    headRow.append(roundHead);

    gameState.players.forEach((player, index) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = getPlayerDisplayName(gameState, player.id, index);
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

      gameState.players.forEach((player) => {
        const points = Number(round.playerResults?.[player.id]?.roundPoints) || 0;
        const cell = document.createElement("td");
        cell.textContent = formatSigned(points);
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
    gameState.players.forEach((player) => {
      const cell = document.createElement("td");
      cell.textContent = String(totals[player.id]);
      totalRow.append(cell);
    });
    foot.append(totalRow);

    table.append(head, body, foot);
    container.append(table);
  }

  function getPlayerDisplayName(gameState, playerId, fallbackIndex = 0) {
    const index = gameState.players.findIndex((player) => player.id === playerId);
    const player = gameState.players[index];
    return player?.name?.trim() || `Player ${(index >= 0 ? index : fallbackIndex) + 1}`;
  }

  function formatSigned(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : String(number);
  }

  root.WizardResultView = Object.freeze({
    renderRanking,
    renderScoreHistory
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
