(function attachHistoryController(root) {
  "use strict";

  function createHistoryController(options) {
    const {
      Storage,
      Logic,
      StateManager,
      ResultView,
      elements,
      showScreen,
      showToast,
      refreshHomeScreen,
      updateStorageWarning
    } = options;
    let selectedArchivedGame = null;
    let capacityWarning = "";

    function bindEvents() {
      elements["btn-history-list-back"].addEventListener("click", showList);
      elements["btn-history-export-all"].addEventListener("click", exportAll);
      elements["btn-history-import"].addEventListener("click", () => elements["import-file-input"].click());
      elements["btn-history-clear"].addEventListener("click", clearAll);
      elements["btn-history-export-game"].addEventListener("click", exportSelected);
      elements["btn-history-delete-game"].addEventListener("click", deleteSelected);
    }

    function open() {
      const games = Storage.loadGameHistory();
      updateControls(games);
      if (games.length === 0) {
        showToast("There are no completed games yet.");
        refreshHomeScreen();
        return;
      }

      renderGameList(games);
      showList();
      showScreen("history");
    }

    function renderGameList(games) {
      const container = elements["history-game-list"];
      container.replaceChildren();

      if (games.length === 0) {
        const empty = document.createElement("p");
        empty.className = "history-empty";
        empty.textContent = "No archived games available.";
        container.append(empty);
        return;
      }

      games.forEach((archivedGame) => {
        const gameState = StateManager.cloneState(archivedGame);
        const completedRounds = gameState.rounds.filter((round) => round.completed);
        if (completedRounds.length === 0) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "history-game-card";

        const main = document.createElement("span");
        main.className = "history-game-card-main";
        const title = document.createElement("strong");
        title.textContent = formatArchivedGameDate(archivedGame);
        const players = document.createElement("span");
        players.textContent = gameState.players
          .map((player, index) => player.name.trim() || `Player ${index + 1}`)
          .join(", ");
        main.append(title, players);

        const totals = Logic.calculateTotalPoints(completedRounds, gameState.players);
        const leadingTotal = Math.max(...Object.values(totals));
        const winnerNames = gameState.players
          .map((player, index) => ({
            name: player.name.trim() || `Player ${index + 1}`,
            points: totals[player.id]
          }))
          .filter((player) => player.points === leadingTotal)
          .map((player) => player.name);

        const summary = document.createElement("span");
        summary.className = "history-game-card-summary";
        const winner = document.createElement("strong");
        winner.className = "history-game-card-winner";
        winner.textContent = `${winnerNames.join(" & ")} · ${leadingTotal} Points`;

        const rounds = document.createElement("span");
        rounds.className = "history-game-card-rounds";
        rounds.textContent = `${completedRounds.length} ${completedRounds.length === 1 ? "Round" : "Rounds"}`;
        summary.append(winner, rounds);

        button.append(main, summary);
        button.setAttribute("aria-label", `Open ${title.textContent}, winner ${winner.textContent}`);
        button.addEventListener("click", () => showArchivedGame(gameState));
        container.append(button);
      });
    }

    function showList() {
      selectedArchivedGame = null;
      elements["history-list-view"].hidden = false;
      elements["history-detail-view"].hidden = true;
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    function showArchivedGame(gameState) {
      selectedArchivedGame = gameState;
      const completedRounds = gameState.rounds
        .filter((round) => round.completed)
        .sort((a, b) => a.number - b.number);
      const totals = Logic.calculateTotalPoints(completedRounds, gameState.players);

      ResultView.renderRanking(elements["history-detail-ranking"], gameState, totals);
      ResultView.renderScoreHistory(
        elements["history-score-content"],
        completedRounds,
        totals,
        gameState
      );
      elements["history-list-view"].hidden = true;
      elements["history-detail-view"].hidden = false;
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    function updateControls(games = Storage.loadGameHistory()) {
      const status = Storage.getHistoryStorageStatus(games);
      const hasGames = status.count > 0;

      elements["btn-history-export-all"].disabled = !hasGames;
      elements["btn-history-clear"].disabled = !hasGames;
      elements["history-storage-status"].textContent =
        `${status.count} ${status.count === 1 ? "game" : "games"} · ${formatStorageSize(status.bytes)}`;
      capacityWarning = status.softLimitReached
        ? `History contains ${status.count} games and uses about ${formatStorageSize(status.bytes)}. Export or delete older games before local storage is full.`
        : "";
    }

    function getCapacityWarning() {
      return capacityWarning;
    }

    function exportAll() {
      const games = Storage.loadGameHistory();
      if (games.length === 0) {
        showToast("There are no games to export.");
        return;
      }

      downloadJson({
        exportFormat: "wizard-scoreboard-history",
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        games
      }, `wizard-history-${formatFileTimestamp(new Date())}.json`);
      showToast("The complete history was exported.");
    }

    function exportSelected() {
      if (!selectedArchivedGame) return;

      downloadJson({
        exportFormat: "wizard-scoreboard-game",
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        gameState: selectedArchivedGame
      }, `wizard-game-${formatFileTimestamp(new Date())}.json`);
      showToast("The game was exported.");
    }

    function deleteSelected() {
      if (!selectedArchivedGame) return;

      const label = formatArchivedGameDate(selectedArchivedGame);
      if (!window.confirm(`Do you really want to delete the game "${label}" from history?`)) return;

      if (!Storage.deleteCompletedGame(selectedArchivedGame.gameId)) {
        showStorageError("The game could not be deleted.");
        return;
      }

      selectedArchivedGame = null;
      refreshAfterMutation();
      showToast("The game was deleted from history.");
    }

    function clearAll() {
      const games = Storage.loadGameHistory();
      if (games.length === 0) return;

      const confirmed = window.confirm(
        `Do you really want to delete all ${games.length} games? Export the archive first if you may want to restore it later.`
      );
      if (!confirmed) return;

      if (!Storage.clearGameHistory()) {
        showStorageError("History could not be cleared.");
        return;
      }

      selectedArchivedGame = null;
      refreshAfterMutation();
      showToast("All history was cleared.");
    }

    function refreshAfterMutation() {
      const games = Storage.loadGameHistory();
      renderGameList(games);
      updateControls(games);
      showList();
      refreshHomeScreen();
      showScreen("history");
    }

    function showStorageError(fallback) {
      const message = Storage.getStorageErrors?.().historyError || fallback;
      updateControls();
      updateStorageWarning(message);
      showToast(message);
    }

    function importArchive(parsed) {
      if (parsed.exportVersion !== 1 || !Array.isArray(parsed.games)) {
        throw new Error("The file is not a valid Wizard history archive.");
      }

      const games = [];
      const gameIds = new Set();
      for (const candidate of parsed.games) {
        const validationErrors = Logic.validateImportedGameState(candidate);
        if (validationErrors.length > 0) throw new Error(validationErrors[0]);
        if (gameIds.has(candidate.gameId)) {
          throw new Error("The history archive contains the same game more than once.");
        }
        gameIds.add(candidate.gameId);
        games.push(StateManager.cloneState(candidate));
      }

      const result = Storage.mergeGameHistory(games);
      if (!result.success) {
        throw new Error(
          Storage.getStorageErrors?.().historyError
            || "The history archive could not be imported."
        );
      }

      refreshHomeScreen();
      if (Storage.hasGameHistory()) open();
      showToast(
        `History imported: ${result.added} new, ${result.updated} updated, ${result.skipped} already present.`
      );
    }

    function formatArchivedGameDate(gameState) {
      const completedDates = gameState.rounds
        .filter((round) => round?.completed && typeof round.completedAt === "string")
        .map((round) => round.completedAt)
        .sort();
      const rawDate = completedDates.at(-1) ?? gameState.archivedAt ?? gameState.updatedAt;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return "Completed game";

      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    }

    function formatStorageSize(bytes) {
      if (bytes < 1_000) return `${bytes} B`;
      if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
      return `${(bytes / 1_000_000).toFixed(1)} MB`;
    }

    function downloadJson(payload, filename) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function formatFileTimestamp(date) {
      const pad = (value) => String(value).padStart(2, "0");
      return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
      ].join("-") + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
    }

    return Object.freeze({
      bindEvents,
      open,
      updateControls,
      getCapacityWarning,
      importArchive
    });
  }

  root.WizardHistoryController = Object.freeze({ createHistoryController });
})(typeof globalThis !== "undefined" ? globalThis : window);
