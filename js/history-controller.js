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
        showToast("Es sind noch keine abgeschlossenen Partien vorhanden.");
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
        empty.textContent = "Keine archivierten Partien vorhanden.";
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
          .map((player, index) => player.name.trim() || `Spieler ${index + 1}`)
          .join(", ");
        main.append(title, players);

        const rounds = document.createElement("span");
        rounds.className = "history-game-card-rounds";
        rounds.textContent = `${completedRounds.length} ${completedRounds.length === 1 ? "Runde" : "Runden"}`;

        button.append(main, rounds);
        button.setAttribute("aria-label", `${title.textContent} öffnen`);
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
        `${status.count} ${status.count === 1 ? "Partie" : "Partien"} · ${formatStorageSize(status.bytes)}`;
      capacityWarning = status.softLimitReached
        ? `Die History enthält ${status.count} Partien und belegt etwa ${formatStorageSize(status.bytes)}. Exportiere oder lösche ältere Partien, bevor der lokale Speicher voll ist.`
        : "";
    }

    function getCapacityWarning() {
      return capacityWarning;
    }

    function exportAll() {
      const games = Storage.loadGameHistory();
      if (games.length === 0) {
        showToast("Es sind keine Partien zum Exportieren vorhanden.");
        return;
      }

      downloadJson({
        exportFormat: "wizard-punkte-history",
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        games
      }, `wizard-history-${formatFileTimestamp(new Date())}.json`);
      showToast("Die gesamte History wurde exportiert.");
    }

    function exportSelected() {
      if (!selectedArchivedGame) return;

      downloadJson({
        exportFormat: "wizard-punkte-app",
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        gameState: selectedArchivedGame
      }, `wizard-partie-${formatFileTimestamp(new Date())}.json`);
      showToast("Die Partie wurde exportiert.");
    }

    function deleteSelected() {
      if (!selectedArchivedGame) return;

      const label = formatArchivedGameDate(selectedArchivedGame);
      if (!window.confirm(`Möchtest du die Partie „${label}“ wirklich aus der History löschen?`)) return;

      if (!Storage.deleteCompletedGame(selectedArchivedGame.gameId)) {
        showStorageError("Die Partie konnte nicht gelöscht werden.");
        return;
      }

      selectedArchivedGame = null;
      refreshAfterMutation();
      showToast("Die Partie wurde aus der History gelöscht.");
    }

    function clearAll() {
      const games = Storage.loadGameHistory();
      if (games.length === 0) return;

      const confirmed = window.confirm(
        `Möchtest du wirklich alle ${games.length} Partien löschen? Exportiere das Archiv vorher, wenn du es später wiederherstellen möchtest.`
      );
      if (!confirmed) return;

      if (!Storage.clearGameHistory()) {
        showStorageError("Die History konnte nicht gelöscht werden.");
        return;
      }

      selectedArchivedGame = null;
      refreshAfterMutation();
      showToast("Die gesamte History wurde gelöscht.");
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
        throw new Error("Die Datei ist kein gültiges Wizard-History-Archiv.");
      }

      const games = [];
      const gameIds = new Set();
      for (const candidate of parsed.games) {
        const validationErrors = Logic.validateImportedGameState(candidate);
        if (validationErrors.length > 0) throw new Error(validationErrors[0]);
        if (gameIds.has(candidate.gameId)) {
          throw new Error("Das History-Archiv enthält eine Partie mehrfach.");
        }
        gameIds.add(candidate.gameId);
        games.push(StateManager.cloneState(candidate));
      }

      const result = Storage.mergeGameHistory(games);
      if (!result.success) {
        throw new Error(
          Storage.getStorageErrors?.().historyError
            || "Das History-Archiv konnte nicht importiert werden."
        );
      }

      refreshHomeScreen();
      if (Storage.hasGameHistory()) open();
      showToast(
        `History importiert: ${result.added} neu, ${result.updated} aktualisiert, ${result.skipped} bereits vorhanden.`
      );
    }

    function formatArchivedGameDate(gameState) {
      const completedDates = gameState.rounds
        .filter((round) => round?.completed && typeof round.completedAt === "string")
        .map((round) => round.completedAt)
        .sort();
      const rawDate = completedDates.at(-1) ?? gameState.archivedAt ?? gameState.updatedAt;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return "Abgeschlossene Partie";

      return new Intl.DateTimeFormat("de-DE", {
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
