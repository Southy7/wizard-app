(function attachRoundResultView(root) {
  "use strict";

  function createRoundResultView({
    Logic,
    ResultView,
    elements,
    createPanel,
    createButton,
    numberCell,
    getState,
    getPlayerColorIndex,
    getPlayerDisplayNameById,
    formatNumber,
    formatSigned,
    createScorePlayerRow,
    createScoreBidCell,
    createScoreTotalCell,
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
      header.innerHTML =
        '<span>Player</span><span class="number bid-column">Bid</span><span class="number tricks-column">Tricks</span><span class="number round-column">Round</span><span class="number total-column">Total</span>';
      table.append(header);

      const order = Logic.getPlayersFromStartingPlayer(state.players, round.startingPlayerId);
      order.forEach((player) => {
        const result = round.playerResults[player.id];
        const isLeader = totals[player.id] === leadingTotal;
        const row = createScorePlayerRow({
          name: getPlayerDisplayNameById(player.id),
          colorIndex: getPlayerColorIndex(player.id),
          isLeader,
          playerCellTag: "span"
        });
        const bid = createScoreBidCell({
          currentBid: result.currentBid,
          originalBid: result.originalBid,
          extraClass: "bid-value"
        });
        const tricks = numberCell(result.tricks, "tricks-value");
        const points = numberCell(
          formatSigned(result.roundPoints),
          `round-points ${result.roundPoints >= 0 ? "positive" : "negative"}`
        );
        const total = createScoreTotalCell({
          points: totals[player.id],
          formattedPoints: formatNumber(totals[player.id]),
          isLeader
        });
        row.append(bid, tricks, points, total);
        table.append(row);
      });
      tableWrap.append(table);

      const actions = document.createElement("div");
      actions.className = "round-actions result-actions";
      actions.append(createButton("Edit Round", "button-secondary", onEditRound));

      const isLastRound = round.number >= state.totalRounds;
      actions.append(
        createButton(
          isLastRound ? "Finish Game" : "Next Round",
          "button-primary",
          isLastRound ? onFinishGame : onNextRound
        )
      );

      panel.append(tableWrap);
      if (round.number >= 2) {
        const progressSection = document.createElement("section");
        progressSection.className = "round-result-progress";
        progressSection.setAttribute("aria-labelledby", "round-result-score-progress-title");

        const progressTitle = document.createElement("h4");
        progressTitle.id = "round-result-score-progress-title";
        progressTitle.textContent = "Score Progress";

        const progressChart = document.createElement("div");
        progressChart.id = "round-result-score-progress";
        progressChart.className = "score-progress-chart";
        const completedRounds = state.rounds
          .filter((completedRound) => completedRound.completed && completedRound.number <= round.number)
          .sort((left, right) => left.number - right.number);
        ResultView.renderScoreProgress(progressChart, completedRounds, state);

        progressSection.append(progressTitle, progressChart);
        panel.append(progressSection);
      }
      panel.append(actions);
      elements["game-content"].replaceChildren(panel);
    }

    return Object.freeze({ render });
  }

  root.WizardRoundResultView = Object.freeze({ createRoundResultView });
})(typeof globalThis !== "undefined" ? globalThis : window);
