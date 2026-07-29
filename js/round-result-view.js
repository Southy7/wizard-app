(function attachRoundResultView(root) {
  "use strict";

  function createRoundResultView({
    Logic,
    elements,
    createPanel,
    createButton,
    numberCell,
    getState,
    getPlayerColorIndex,
    getPlayerDisplayNameById,
    formatSigned,
    onEditRound,
    onNextRound,
    onFinishGame
  }) {
    function render(round) {
      const state = getState();
      const panel = createPanel("Round Result");
      panel.classList.add("round-result-panel");
      panel.setAttribute("aria-label", `Result Round ${round.number}`);
      const totals = Logic.calculateTotalPoints(state.rounds, state.players);
      const leadingTotal = Math.max(...Object.values(totals));
      const tableWrap = document.createElement("div");
      tableWrap.className = "score-table-scroll";
      const table = document.createElement("div");
      table.className = "score-table five-columns";

      const header = document.createElement("div");
      header.className = "score-row header";
      header.innerHTML = '<span>Player</span><span class="number bid-column">Bid</span><span class="number tricks-column">Tricks</span><span class="number round-column">Round</span><span class="number total-column">Total</span>';
      table.append(header);

      const order = Logic.getPlayersFromStartingPlayer(state.players, round.startingPlayerId);
      order.forEach((player) => {
        const result = round.playerResults[player.id];
        const row = document.createElement("div");
        row.className = "score-row";
        row.dataset.playerColor = String(getPlayerColorIndex(player.id));

        const name = document.createElement("span");
        name.className = "score-player";
        const nameStrong = document.createElement("strong");
        nameStrong.textContent = getPlayerDisplayNameById(player.id);
        name.append(nameStrong);
        const isLeader = totals[player.id] === leadingTotal;
        if (isLeader) {
          const crown = document.createElement("span");
          crown.className = "leader-crown";
          crown.textContent = "👑";
          crown.setAttribute("aria-label", "Current leader");
          name.append(crown);
        }

        const bid = numberCell(result.currentBid, `bid-value${result.currentBid !== result.originalBid ? " changed-bid" : ""}`);
        const tricks = numberCell(result.tricks, "tricks-value");
        const points = numberCell(formatSigned(result.roundPoints), `round-points ${result.roundPoints >= 0 ? "positive" : "negative"}`);
        const total = numberCell(totals[player.id], `total-points${isLeader ? " leader-points" : ""}`);
        row.append(name, bid, tricks, points, total);
        table.append(row);
      });
      tableWrap.append(table);

      const actions = document.createElement("div");
      actions.className = "round-actions result-actions";
      actions.append(createButton("Edit Round", "button-secondary", onEditRound));

      const isLastRound = round.number >= state.totalRounds;
      actions.append(createButton(
        isLastRound ? "Finish Game" : "Next Round",
        "button-primary",
        isLastRound ? onFinishGame : onNextRound
      ));

      panel.append(tableWrap, actions);
      elements["game-content"].replaceChildren(panel);
    }

    return Object.freeze({ render });
  }

  root.WizardRoundResultView = Object.freeze({ createRoundResultView });
})(typeof globalThis !== "undefined" ? globalThis : window);
