(function bootstrapWizardApp() {
  "use strict";

  const Logic = window.WizardGameLogic;
  const StateManager = window.WizardStateManager;
  const Storage = window.WizardStorage;
  const hydrateState = StateManager?.hydrateState;
  const normalizeSpecialDependencies = StateManager?.normalizeSpecialDependencies;

  if (!Logic || !StateManager || !Storage) {
    console.error("Die Anwendungsabhängigkeiten konnten nicht geladen werden.");
    return;
  }

  const elements = {};
  let state = null;
  let toastTimeout = null;
  let cloudDialogContext = null;
  let externalGameWarning = "";
  let externalHistoryWarning = "";
  let historyCapacityWarning = "";
  let selectedArchivedGame = null;

  document.addEventListener("DOMContentLoaded", init);

  // Initialisierung und zentrale DOM-Verknüpfungen
  function init() {
    cacheElements();
    bindEvents();
    window.addEventListener("storage", handleExternalStorageChange);
    refreshHomeScreen();
    updateStorageWarning();
    showScreen("home");
    registerServiceWorker();
    requestPersistentStorage();
  }

  function cacheElements() {
    const ids = [
      "screen-home", "screen-setup", "screen-setup-summary",
      "screen-game", "screen-history", "screen-finished",
      "btn-new-game", "btn-continue-game", "btn-history", "btn-import-game",
      "import-file-input", "storage-warning",
      "btn-setup-home", "setup-form", "player-list", "player-count-badge",
      "btn-add-player", "round-mode-toggle", "btn-round-mode-full",
      "btn-round-mode-individual", "full-game-rounds", "custom-round-controls",
      "btn-rounds-minus", "rounds-input", "btn-rounds-plus",
      "rounds-message",
      "summary-player-count", "summary-round-count",
      "summary-seat-order", "btn-summary-back",
      "btn-summary-start", "form-errors",
      "btn-game-home", "game-phase-label", "game-title",
      "game-round-overview", "game-total-points", "game-content", "btn-history-home",
      "history-list-view", "history-game-list", "history-detail-view", "btn-history-list-back",
      "history-detail-ranking", "history-score-content",
      "btn-history-export-all", "btn-history-import", "history-storage-status",
      "btn-history-clear", "btn-history-export-game", "btn-history-delete-game",
      "btn-finished-home",
      "final-ranking", "final-score-history", "btn-review-last-round",
      "btn-finished-new-game", "round-one-dialog", "btn-confirm-round-one-hint",
      "cloud-dialog", "cloud-dialog-kicker",
      "cloud-player-options", "cloud-change-options", "btn-cloud-minus",
      "btn-cloud-plus", "btn-close-cloud-dialog", "edit-round-dialog",
      "btn-close-edit-dialog", "btn-edit-bids", "btn-edit-specials",
      "btn-edit-tricks", "toast"
    ];

    for (const id of ids) {
      elements[id] = document.getElementById(id);
    }
  }

  function bindEvents() {
    elements["btn-new-game"].addEventListener("click", () => startNewGame(false));
    elements["btn-continue-game"].addEventListener("click", continueGame);
    elements["btn-history"].addEventListener("click", openHistory);
    elements["btn-import-game"].addEventListener("click", () => elements["import-file-input"].click());
    elements["import-file-input"].addEventListener("change", importGameFromFile);
    elements["btn-setup-home"].addEventListener("click", goHome);
    elements["btn-game-home"].addEventListener("click", goHome);
    elements["btn-history-home"].addEventListener("click", goHome);
    elements["btn-history-list-back"].addEventListener("click", showHistoryList);
    elements["btn-history-export-all"].addEventListener("click", exportGameHistory);
    elements["btn-history-import"].addEventListener("click", () => elements["import-file-input"].click());
    elements["btn-history-clear"].addEventListener("click", clearGameHistory);
    elements["btn-history-export-game"].addEventListener("click", exportSelectedArchivedGame);
    elements["btn-history-delete-game"].addEventListener("click", deleteSelectedArchivedGame);
    elements["btn-finished-home"].addEventListener("click", goHome);
    elements["btn-finished-new-game"].addEventListener("click", () => startNewGame(false));
    elements["btn-review-last-round"].addEventListener("click", reviewLastRound);
    elements["btn-add-player"].addEventListener("click", addPlayer);
    elements["btn-round-mode-full"].addEventListener("click", () => setRoundMode("full"));
    elements["btn-round-mode-individual"].addEventListener("click", () => setRoundMode("individual"));
    elements["btn-rounds-minus"].addEventListener("click", () => changeRounds(-1));
    elements["btn-rounds-plus"].addEventListener("click", () => changeRounds(1));
    elements["rounds-input"].addEventListener("change", commitRoundInput);
    elements["rounds-input"].addEventListener("blur", commitRoundInput);
    elements["setup-form"].addEventListener("submit", submitSetup);
    elements["btn-summary-back"].addEventListener("click", returnToSetup);
    elements["btn-summary-start"].addEventListener("click", startGameFromSummary);

    elements["btn-confirm-round-one-hint"].addEventListener("click", confirmRoundOneHint);
    elements["round-one-dialog"].addEventListener("cancel", (event) => event.preventDefault());

    elements["btn-close-cloud-dialog"].addEventListener("click", closeCloudDialog);
    elements["btn-cloud-minus"].addEventListener("click", () => commitCloudChange(-1));
    elements["btn-cloud-plus"].addEventListener("click", () => commitCloudChange(1));

    elements["btn-close-edit-dialog"].addEventListener("click", () => closeDialog(elements["edit-round-dialog"]));
    elements["btn-edit-bids"].addEventListener("click", () => beginRoundEdit("bids"));
    elements["btn-edit-specials"].addEventListener("click", () => beginRoundEdit("play"));
    elements["btn-edit-tricks"].addEventListener("click", () => beginRoundEdit("tricks"));
  }

  function startNewGame(forceReplace) {
    const savedGame = Storage.loadGame();
    if (!forceReplace && savedGame) {
      const shouldReplace = window.confirm(
        "Es ist bereits ein Spiel gespeichert. Beim Starten eines neuen Spiels wird der bisherige Spielstand ersetzt. Fortfahren?"
      );
      if (!shouldReplace) return;
    }

    if (savedGame?.status === "completed") {
      archiveCompletedGame(hydrateState(savedGame));
    }

    state = Logic.createInitialGameState();
    persistState({ expectedUpdatedAt: savedGame?.updatedAt ?? null });
    renderSetup();
    showScreen("setup");
  }

  function continueGame() {
    const savedState = Storage.loadGame();

    if (!savedState) {
      showToast("Es wurde kein gültiger Spielstand gefunden.");
      refreshHomeScreen();
      return;
    }

    state = hydrateState(savedState);
    persistState();

    if (state.status === "completed") {
      renderFinished();
      showScreen("finished");
      return;
    }

    if (state.status === "running") {
      renderGame();
      showScreen("game");
      maybeShowRoundOneHint();
      return;
    }

    renderSetup();
    showScreen("setup");
  }

  // Navigation zwischen den sechs Ansichten aus index.html
  function goHome() {
    persistState();
    refreshHomeScreen();
    showScreen("home");
  }

  function showScreen(name) {
    const screens = {
      home: elements["screen-home"],
      setup: elements["screen-setup"],
      "setup-summary": elements["screen-setup-summary"],
      game: elements["screen-game"],
      history: elements["screen-history"],
      finished: elements["screen-finished"]
    };

    Object.entries(screens).forEach(([screenName, screenElement]) => {
      screenElement.hidden = screenName !== name;
    });

    window.scrollTo({ top: 0, behavior: "auto" });
  }

  // Startseite und lokaler Spielstand
  function refreshHomeScreen() {
    let savedState = Storage.loadGame();
    const continueButton = elements["btn-continue-game"];
    const historyButton = elements["btn-history"];

    // Migriert einen bereits vorhandenen abgeschlossenen Einzelspielstand in das neue Archiv.
    if (savedState?.status === "completed") {
      const completedState = hydrateState(savedState);
      const needsMigration = !savedState.gameId || Number(savedState.schemaVersion) !== 4;
      if (needsMigration) {
        Storage.saveGame(completedState);
        archiveCompletedGame(completedState);
      }
      savedState = completedState;
    }

    const games = Storage.loadGameHistory();
    continueButton.disabled = !savedState;
    historyButton.disabled = games.length === 0;
    updateHistoryControls(games);
    updateStorageWarning();
  }

  function updateStorageWarning(message = "") {
    const warning = elements["storage-warning"];
    if (!warning) return;

    const storageAvailable = Storage.isStorageAvailable();
    const storageError = Storage.getLastError?.();
    const externalWarning = [
      externalGameWarning,
      externalHistoryWarning,
      historyCapacityWarning
    ].filter(Boolean).join(" ");
    const text = message || externalWarning || storageError || (!storageAvailable
      ? "Der Browser stellt keinen dauerhaften lokalen Speicher bereit. Änderungen können beim Schließen verloren gehen."
      : "");

    warning.textContent = text;
    warning.hidden = !text;
  }

  function handleExternalStorageChange(event) {
    if (event.storageArea !== localStorage
      || ![Storage.STORAGE_KEY, Storage.HISTORY_KEY].includes(event.key)) {
      return;
    }

    if (event.key === Storage.STORAGE_KEY) {
      externalGameWarning = "Der Spielstand wurde in einem anderen Tab geändert. Lade diese Seite neu, bevor du weiterspielst.";
    } else {
      externalHistoryWarning = "Die History wurde in einem anderen Tab geändert. Lade diese Seite neu, um den aktuellen Stand zu sehen.";
    }
    updateStorageWarning();
    showToast(event.key === Storage.STORAGE_KEY ? externalGameWarning : externalHistoryWarning);
  }

  function openHistory() {
    const games = Storage.loadGameHistory();
    updateHistoryControls(games);
    externalHistoryWarning = "";
    updateStorageWarning();
    if (games.length === 0) {
      showToast("Es sind noch keine abgeschlossenen Partien vorhanden.");
      refreshHomeScreen();
      return;
    }

    renderHistoryGameList(games);
    showHistoryList();
    showScreen("history");
  }

  function renderHistoryGameList(games) {
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
      const gameState = hydrateState(archivedGame);
      if (Number(archivedGame.schemaVersion) !== 4) {
        Storage.saveCompletedGame(gameState);
      }
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
        .map((player, index) => getPlayerDisplayName(player, index))
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

  function showHistoryList() {
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

    renderRanking(elements["history-detail-ranking"], gameState, totals);
    renderScoreHistory(elements["history-score-content"], completedRounds, totals, gameState);
    elements["history-list-view"].hidden = true;
    elements["history-detail-view"].hidden = false;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function updateHistoryControls(games = Storage.loadGameHistory()) {
    const status = Storage.getHistoryStorageStatus(games);
    const hasGames = status.count > 0;

    elements["btn-history-export-all"].disabled = !hasGames;
    elements["btn-history-clear"].disabled = !hasGames;
    elements["history-storage-status"].textContent = `${status.count} ${status.count === 1 ? "Partie" : "Partien"} · ${formatStorageSize(status.bytes)}`;
    historyCapacityWarning = status.softLimitReached
      ? `Die History enthält ${status.count} Partien und belegt etwa ${formatStorageSize(status.bytes)}. Exportiere oder lösche ältere Partien, bevor der lokale Speicher voll ist.`
      : "";
  }

  function formatStorageSize(bytes) {
    if (bytes < 1_000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  function exportGameHistory() {
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

  function exportSelectedArchivedGame() {
    if (!selectedArchivedGame) return;

    downloadJson({
      exportFormat: "wizard-punkte-app",
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      gameState: selectedArchivedGame
    }, `wizard-partie-${formatFileTimestamp(new Date())}.json`);
    showToast("Die Partie wurde exportiert.");
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

  function deleteSelectedArchivedGame() {
    if (!selectedArchivedGame) return;

    const label = formatArchivedGameDate(selectedArchivedGame);
    if (!window.confirm(`Möchtest du die Partie „${label}“ wirklich aus der History löschen?`)) return;

    if (!Storage.deleteCompletedGame(selectedArchivedGame.gameId)) {
      showHistoryStorageError("Die Partie konnte nicht gelöscht werden.");
      return;
    }

    selectedArchivedGame = null;
    refreshHistoryAfterMutation();
    showToast("Die Partie wurde aus der History gelöscht.");
  }

  function clearGameHistory() {
    const games = Storage.loadGameHistory();
    if (games.length === 0) return;

    const confirmed = window.confirm(
      `Möchtest du wirklich alle ${games.length} Partien löschen? Exportiere das Archiv vorher, wenn du es später wiederherstellen möchtest.`
    );
    if (!confirmed) return;

    if (!Storage.clearGameHistory()) {
      showHistoryStorageError("Die History konnte nicht gelöscht werden.");
      return;
    }

    selectedArchivedGame = null;
    refreshHistoryAfterMutation();
    showToast("Die gesamte History wurde gelöscht.");
  }

  function refreshHistoryAfterMutation() {
    const games = Storage.loadGameHistory();
    renderHistoryGameList(games);
    updateHistoryControls(games);
    showHistoryList();
    refreshHomeScreen();
    showScreen("history");
  }

  function showHistoryStorageError(fallback) {
    const message = Storage.getStorageErrors?.().historyError || fallback;
    updateHistoryControls();
    updateStorageWarning(message);
    showToast(message);
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

  async function importGameFromFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (file.size > 10_000_000) {
      showToast("Die Importdatei ist ungewöhnlich groß und wurde abgelehnt.");
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.exportFormat === "wizard-punkte-history") {
        importGameHistoryArchive(parsed);
        return;
      }

      if (file.size > 2_000_000) {
        throw new Error("Der einzelne Spielstand ist ungewöhnlich groß und wurde abgelehnt.");
      }

      const candidate = parsed?.exportFormat === "wizard-punkte-app" ? parsed.gameState : parsed;
      const validationErrors = Logic.validateImportedGameState(candidate);
      if (validationErrors.length > 0) throw new Error(validationErrors[0]);

      const savedBeforeImport = Storage.loadGame();
      const shouldReplace = !savedBeforeImport || window.confirm(
        "Der vorhandene Spielstand wird durch den importierten Spielstand ersetzt. Fortfahren?"
      );
      if (!shouldReplace) return;

      const importedState = hydrateState(candidate);
      if (!Storage.saveGame(importedState, {
        expectedUpdatedAt: savedBeforeImport?.updatedAt ?? null
      })) {
        throw new Error("Der importierte Spielstand konnte nicht lokal gespeichert werden.");
      }
      if (importedState.status === "completed") {
        archiveCompletedGame(importedState);
      }

      state = importedState;
      refreshHomeScreen();
      showToast("Spielstand wurde erfolgreich importiert.");
    } catch (error) {
      console.error("Import fehlgeschlagen:", error);
      showToast(error instanceof Error ? error.message : "Die Importdatei konnte nicht gelesen werden.");
    }
  }

  function importGameHistoryArchive(parsed) {
    if (parsed.exportVersion !== 1 || !Array.isArray(parsed.games)) {
      throw new Error("Die Datei ist kein gültiges Wizard-History-Archiv.");
    }

    const hydratedGames = [];
    const gameIds = new Set();
    for (const candidate of parsed.games) {
      const validationErrors = Logic.validateImportedGameState(candidate);
      if (validationErrors.length > 0) throw new Error(validationErrors[0]);
      if (gameIds.has(candidate.gameId)) {
        throw new Error("Das History-Archiv enthält eine Partie mehrfach.");
      }
      gameIds.add(candidate.gameId);
      hydratedGames.push(hydrateState(candidate));
    }

    const result = Storage.mergeGameHistory(hydratedGames);
    if (!result.success) {
      throw new Error(
        Storage.getStorageErrors?.().historyError
          || "Das History-Archiv konnte nicht importiert werden."
      );
    }

    refreshHomeScreen();
    if (Storage.hasGameHistory()) openHistory();
    showToast(
      `History importiert: ${result.added} neu, ${result.updated} aktualisiert, ${result.skipped} bereits vorhanden.`
    );
  }

  // Spieleinrichtung: Spieler, Sitzordnung und Rundenzahl
  function renderSetup() {
    ensureState();
    renderPlayerList();
    renderRoundControls();
    renderSummary();
    clearFormErrors();
  }

  function renderPlayerList() {
    const playerList = elements["player-list"];
    const duplicateIds = Logic.getDuplicateNameIds(state.players);
    playerList.innerHTML = "";

    state.players.forEach((player, index) => {
      const row = document.createElement("div");
      row.className = "player-row";
      row.dataset.playerId = player.id;

      const inputWrap = document.createElement("div");
      inputWrap.className = "player-input-wrap";

      const input = document.createElement("input");
      input.id = `player-name-${player.id}`;
      input.className = "text-input";
      input.type = "text";
      input.maxLength = 30;
      input.autocomplete = "off";
      input.placeholder = `Spieler ${index + 1}`;
      input.setAttribute("aria-label", `Spieler ${index + 1}`);
      input.value = player.name;
      input.setAttribute("aria-invalid", String(!player.name.trim()));
      input.addEventListener("input", (event) => updatePlayerName(player.id, event.target.value));

      const duplicateHint = document.createElement("span");
      duplicateHint.className = "duplicate-hint";
      duplicateHint.textContent = duplicateIds.has(player.id) ? "Name wird mehrfach verwendet." : "";

      inputWrap.append(input, duplicateHint);

      const actions = document.createElement("div");
      actions.className = "player-actions";

      const moveUp = createIconButton("↑", `Spieler ${index + 1} nach oben verschieben`, index === 0);
      moveUp.addEventListener("click", () => reorderPlayer(player.id, "up"));

      const moveDown = createIconButton("↓", `Spieler ${index + 1} nach unten verschieben`, index === state.players.length - 1);
      moveDown.addEventListener("click", () => reorderPlayer(player.id, "down"));

      const remove = createIconButton("×", `Spieler ${index + 1} entfernen`, state.players.length <= Logic.MIN_PLAYERS, true);
      remove.addEventListener("click", () => removePlayer(player.id));

      actions.append(moveUp, moveDown, remove);
      row.append(inputWrap, actions);
      playerList.append(row);
    });

    elements["player-count-badge"].textContent = `${state.players.length} / ${Logic.MAX_PLAYERS}`;
    elements["btn-add-player"].disabled = state.players.length >= Logic.MAX_PLAYERS;
  }

  function createIconButton(text, label, disabled = false, danger = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `icon-button${danger ? " danger" : ""}`;
    button.textContent = text;
    button.disabled = disabled;
    button.setAttribute("aria-label", label);
    return button;
  }

  function updatePlayerName(playerId, name) {
    const player = state.players.find((entry) => entry.id === playerId);
    if (!player) return;

    player.name = name;
    persistState();
    renderSummary();
    updateDuplicateHints();
  }

  function updateDuplicateHints() {
    const duplicateIds = Logic.getDuplicateNameIds(state.players);

    document.querySelectorAll(".player-row").forEach((row) => {
      const playerId = row.dataset.playerId;
      const player = state.players.find((entry) => entry.id === playerId);
      const input = row.querySelector(".text-input");
      const hint = row.querySelector(".duplicate-hint");

      if (input && player) input.setAttribute("aria-invalid", String(!player.name.trim()));
      if (hint) hint.textContent = duplicateIds.has(playerId) ? "Name wird mehrfach verwendet." : "";
    });
  }

  function addPlayer() {
    if (state.players.length >= Logic.MAX_PLAYERS) return;

    state.players.push(Logic.createPlayer(state.players.length));
    state.setupDealerRandomized = false;
    syncRoundsAfterPlayerChange();
    persistState();
    renderSetup();
    focusLastPlayerInput();
  }

  function removePlayer(playerId) {
    if (state.players.length <= Logic.MIN_PLAYERS) return;

    const removedWasDealer = state.firstDealerId === playerId;
    state.players = Logic.normalizeSeatPositions(state.players.filter((player) => player.id !== playerId));
    state.setupDealerRandomized = false;

    if (removedWasDealer || !state.players.some((player) => player.id === state.firstDealerId)) {
      state.firstDealerId = state.players[0].id;
    }

    syncRoundsAfterPlayerChange();
    persistState();
    renderSetup();
  }

  function reorderPlayer(playerId, direction) {
    state.players = Logic.movePlayer(state.players, playerId, direction);
    persistState();
    renderSetup();
  }

  function focusLastPlayerInput() {
    requestAnimationFrame(() => {
      const lastPlayer = state.players[state.players.length - 1];
      document.getElementById(`player-name-${lastPlayer.id}`)?.focus();
    });
  }

  function renderRoundControls(message = "") {
    const playerCount = state.players.length;
    const standard = Logic.getStandardRounds(playerCount);
    const maximum = Logic.getMaximumRounds(playerCount, state.totalCards);
    const isIndividual = state.roundMode === "individual";

    state.roundMode = isIndividual ? "individual" : "full";
    state.totalRounds = isIndividual
      ? Logic.clampRoundCount(state.totalRounds, playerCount, state.totalCards)
      : standard;

    elements["round-mode-toggle"].dataset.mode = state.roundMode;
    elements["btn-round-mode-full"].setAttribute("aria-checked", String(!isIndividual));
    elements["btn-round-mode-individual"].setAttribute("aria-checked", String(isIndividual));
    elements["full-game-rounds"].textContent = String(standard);
    elements["custom-round-controls"].hidden = !isIndividual;
    elements["rounds-input"].value = String(state.totalRounds);
    elements["rounds-input"].max = String(maximum);
    elements["btn-rounds-minus"].disabled = state.totalRounds <= 1;
    elements["btn-rounds-plus"].disabled = state.totalRounds >= maximum;
    elements["rounds-message"].textContent = message;
  }

  function setRoundMode(mode) {
    if (!["full", "individual"].includes(mode) || state.roundMode === mode) return;

    state.roundMode = mode;
    if (mode === "full") resetRoundsToStandard();
    persistState();
    renderRoundControls();
    renderSummary();

    if (mode === "individual") {
      requestAnimationFrame(() => elements["rounds-input"].focus());
    }
  }

  function changeRounds(delta) {
    state.totalRounds = Logic.clampRoundCount(state.totalRounds + delta, state.players.length, state.totalCards);
    persistState();
    renderRoundControls();
    renderSummary();
  }

  function commitRoundInput() {
    const maximum = Logic.getMaximumRounds(state.players.length, state.totalCards);
    const entered = Number.parseInt(elements["rounds-input"].value, 10);
    const corrected = Logic.clampRoundCount(entered, state.players.length, state.totalCards);
    const wasCorrected = entered !== corrected;

    state.totalRounds = corrected;
    persistState();
    renderRoundControls(wasCorrected ? `Zulässig sind 1 bis ${maximum} Runden. Der Wert wurde angepasst.` : "");
    renderSummary();
  }

  function resetRoundsToStandard() {
    state.totalRounds = Logic.getStandardRounds(state.players.length);
  }

  function syncRoundsAfterPlayerChange() {
    if (state.roundMode === "individual") {
      state.totalRounds = Logic.clampRoundCount(state.totalRounds, state.players.length, state.totalCards);
      return;
    }

    resetRoundsToStandard();
  }

  function renderSummary() {
    const starter = Logic.getStartingPlayerForRound(state.players, state.firstDealerId, 1);

    elements["summary-player-count"].textContent = String(state.players.length);
    elements["summary-round-count"].textContent = String(state.totalRounds);
    renderSummarySeatOrder(starter?.id ?? null);
  }

  function renderSummarySeatOrder(starterId) {
    const seatOrder = elements["summary-seat-order"];
    seatOrder.innerHTML = "";

    state.players.forEach((player, index) => {
      const item = document.createElement("li");
      item.className = "seat-order-item";

      const position = document.createElement("span");
      position.className = "seat-position";
      position.textContent = String(index + 1);
      position.setAttribute("aria-label", `Sitzplatz ${index + 1}`);

      const name = document.createElement("span");
      name.className = "seat-player-name";
      name.textContent = getPlayerDisplayNameById(player.id);

      const roles = document.createElement("span");
      roles.className = "seat-role-badges";

      if (player.id === state.firstDealerId) {
        roles.append(createSeatRoleBadge("Kartengeber", "dealer"));
      }
      if (player.id === starterId) {
        roles.append(createSeatRoleBadge("Startspieler", "starter"));
      }

      item.append(position, name, roles);
      seatOrder.append(item);
    });
  }

  function createSeatRoleBadge(label, role) {
    const badge = document.createElement("span");
    badge.className = `seat-role-badge ${role}`;
    badge.textContent = label;
    return badge;
  }

  function submitSetup(event) {
    event.preventDefault();
    commitRoundInput();

    const errors = Logic.validateSetup(state);
    if (errors.length > 0) {
      showFormErrors(errors);
      focusFirstInvalidField();
      return;
    }

    clearFormErrors();
    selectRandomDealer();
    renderSummary();
    persistState();
    showScreen("setup-summary");
  }

  function returnToSetup() {
    renderSetup();
    showScreen("setup");
  }

  function selectRandomDealer() {
    if (state.setupDealerRandomized || state.players.length === 0) return;

    const randomIndex = Math.floor(Math.random() * state.players.length);
    state.firstDealerId = state.players[randomIndex].id;
    state.setupDealerRandomized = true;
  }

  function startGameFromSummary() {
    const errors = Logic.validateSetup(state);
    if (errors.length > 0) {
      renderSetup();
      showFormErrors(errors);
      showScreen("setup");
      focusFirstInvalidField();
      return;
    }

    state.status = "running";
    state.currentRound = 1;
    state.roundOneHintConfirmed = false;
    state.rounds = [Logic.createRound(state.players, state.firstDealerId, 1)];
    persistState();
    renderGame();
    showScreen("game");
    maybeShowRoundOneHint();
  }

  function showFormErrors(errors) {
    const container = elements["form-errors"];
    container.innerHTML = "";
    const list = document.createElement("ul");

    errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = error;
      list.append(item);
    });

    container.append(list);
    container.hidden = false;
  }

  function clearFormErrors() {
    elements["form-errors"].hidden = true;
    elements["form-errors"].innerHTML = "";
  }

  function focusFirstInvalidField() {
    const invalidNameInput = [...document.querySelectorAll(".text-input")]
      .find((input) => !input.value.trim());

    if (invalidNameInput) {
      invalidNameInput.focus();
      return;
    }

    elements["rounds-input"].focus();
  }

  // Laufendes Spiel: wählt passend zum Rundenstatus die aktuelle Phasenansicht.
  function renderGame() {
    ensureState();
    let round = ensureCurrentRound();
    round = Logic.recalculateCurrentBids(round, state.players);
    replaceRound(round);

    elements["game-title"].textContent = `Runde ${round.number} von ${state.totalRounds}`;

    const labels = {
      bids: "Ansagen",
      play: "Sonderkarten",
      tricks: "Stiche",
      result: "Rundenergebnis"
    };
    elements["game-phase-label"].textContent = labels[round.phase] ?? "Laufendes Spiel";
    renderRoundOverview(round.phase);

    if (round.phase === "bids") renderBids(round);
    else if (round.phase === "play") renderPlay(round);
    else if (round.phase === "tricks") renderTricks(round);
    else renderRoundResult(round);
  }

  // Phase 1: Ansagen aller Spieler erfassen
  function renderBids(round) {
    const panel = createPanel();
    panel.classList.add("bid-panel");
    panel.setAttribute("aria-label", "Ansagen eintragen");
    const list = document.createElement("div");
    list.className = "entry-list";

    const order = Logic.getPlayersFromStartingPlayer(state.players, round.startingPlayerId);
    order.forEach((player) => {
      const result = round.playerResults[player.id];
      list.append(createValueEntry({
        name: getPlayerDisplayNameById(player.id),
        badges: [
          ...(player.id === round.dealerId ? [{ label: "Kartengeber", role: "dealer" }] : []),
          ...(player.id === round.startingPlayerId ? [{ label: "Startspieler", role: "starter" }] : [])
        ],
        value: result.originalBid,
        min: 0,
        max: round.number,
        onChange: (next) => updateBid(round.number, player.id, next)
      }));
    });

    const sum = Logic.getBidSum(round);
    const validSum = Logic.isBidSumValid(round);
    const specialErrors = Logic.getSpecialCardErrors(round, state.players);

    const summary = document.createElement("div");
    summary.className = "phase-summary";
    summary.append(createStatusCard(
      validSum ? "neutral" : "error",
      `Summe der Ansagen: ${sum}`,
      ""
    ));

    if (specialErrors.length > 0) {
      summary.append(createStatusCard("error", "Sonderkarten prüfen", specialErrors.join(" ")));
    }

    const confirm = createButton("Ansagen bestätigen", "button-primary full-width bid-confirm-button", () => confirmBids(round.number));
    confirm.disabled = !validSum || specialErrors.length > 0;

    panel.append(list, summary, confirm);
    elements["game-content"].replaceChildren(panel);
  }

  function updateBid(roundNumber, playerId, nextValue) {
    let round = getRound(roundNumber);
    if (!round) return;

    const result = round.playerResults[playerId];
    result.originalBid = Math.min(Math.max(nextValue, 0), round.number);
    result.roundPoints = null;
    round.completed = false;
    round.completedAt = null;
    round = Logic.recalculateCurrentBids(round, state.players);
    replaceRound(round);
    persistState();
    renderGame();
  }

  function confirmBids(roundNumber) {
    let round = getRound(roundNumber);
    if (!round || !Logic.isBidSumValid(round)) return;

    round = Logic.recalculateCurrentBids(round, state.players);
    const errors = Logic.getSpecialCardErrors(round, state.players);
    if (errors.length > 0) {
      showToast(errors[0]);
      return;
    }

    round.phase = "play";
    replaceRound(round);
    persistState();
    renderGame();
  }

  // Phase 2: ausgespielte Sonderkarten und ihre Abhängigkeiten erfassen
  function renderPlay(round) {
    const bidsPanel = createPanel();
    bidsPanel.classList.add("bid-overview-panel");
    bidsPanel.setAttribute("aria-label", "Ansagenübersicht");
    bidsPanel.append(createBidOverview(round));

    const specialPanel = createPanel();
    specialPanel.classList.add("special-panel");
    specialPanel.setAttribute("aria-label", "Sonderkarten auswählen");
    const cards = round.specialCards;
    const grid = document.createElement("div");
    grid.className = "special-card-grid";

    const cloudButton = createSpecialButton("☁ Wolke", cards.cloud.active);
    cloudButton.addEventListener("click", cards.cloud.active ? undoCloud : () => openCloudDialog("cloud"));

    const bombButton = createSpecialButton("💣 Bombe", cards.bomb.active);
    bombButton.addEventListener("click", cards.bomb.active ? undoBomb : activateBomb);

    const canActivateWitch = cards.cloud.active || cards.bomb.active;
    const witchButton = createSpecialButton("🧙 Hexe", cards.witch.active);
    witchButton.disabled = !cards.witch.active && !canActivateWitch;
    witchButton.addEventListener("click", cards.witch.active ? undoWitch : activateWitch);

    grid.append(cloudButton, bombButton, witchButton);
    specialPanel.append(grid);

    if (cards.witch.active) {
      specialPanel.append(createSecondEffectSection(round));
    }

    const errors = Logic.getSpecialCardErrors(round, state.players);

    const actions = document.createElement("div");
    actions.className = "round-actions special-actions";
    actions.append(
      createButton("Ansagen bearbeiten", "button-secondary", () => setRoundPhase("bids")),
      createButton("Stiche eintragen", "button-primary", () => setRoundPhase("tricks"), errors.length > 0)
    );
    specialPanel.append(actions);

    elements["game-content"].replaceChildren(bidsPanel, specialPanel);
  }

  function createBidOverview(round) {
    const table = document.createElement("div");
    table.className = "score-table bid-overview";
    const totals = Logic.calculateTotalPoints(state.rounds, state.players);

    const header = document.createElement("div");
    header.className = "score-row header";
    header.innerHTML = "<span>Spieler</span><span class=\"number\">Ansage</span><span class=\"number\">Gesamt</span>";
    table.append(header);

    state.players.forEach((player) => {
      const result = round.playerResults[player.id];
      const row = document.createElement("div");
      row.className = "score-row";

      const nameCell = document.createElement("div");
      nameCell.className = "score-player-with-badge";

      const name = document.createElement("span");
      name.className = "score-player-name";
      name.textContent = getPlayerDisplayNameById(player.id);
      nameCell.append(name);

      if (player.id === round.startingPlayerId) {
        nameCell.append(createSeatRoleBadge("Startspieler", "starter"));
      }

      const bid = document.createElement("span");
      bid.className = `number${result.currentBid !== result.originalBid ? " changed-bid" : ""}`;
      bid.textContent = String(result.currentBid);
      if (result.currentBid !== result.originalBid) {
        bid.title = `Ursprünglich ${result.originalBid}`;
      }

      const total = document.createElement("span");
      total.className = "number total-points";
      total.textContent = String(totals[player.id]);
      total.setAttribute("aria-label", `${totals[player.id]} Gesamtpunkte`);

      row.append(nameCell, bid, total);
      table.append(row);
    });

    return table;
  }

  function createSecondEffectSection(round) {
    const cards = round.specialCards;
    const wrap = document.createElement("div");
    wrap.className = "second-effect-wrap";

    const label = document.createElement("p");
    label.className = "second-effect-label";
    label.textContent = "Durch die Hexe erneut ausgespielt:";

    const grid = document.createElement("div");
    grid.className = "second-effect-grid";

    const secondCloudActive = cards.witch.secondEffect === "cloud" && cards.secondCloud.active;
    const secondBombActive = cards.witch.secondEffect === "bomb" && cards.secondBomb.active;

    if (cards.cloud.active) {
      const secondCloud = createSpecialButton(
        "☁ 2. Wolke",
        secondCloudActive
      );
      secondCloud.disabled = Boolean(cards.witch.secondEffect) && !secondCloudActive;
      secondCloud.addEventListener("click", secondCloudActive ? undoSecondEffect : () => openCloudDialog("secondCloud"));
      grid.append(secondCloud);
    }

    if (cards.bomb.active) {
      const secondBomb = createSpecialButton(
        "💣 2. Bombe",
        secondBombActive
      );
      secondBomb.disabled = Boolean(cards.witch.secondEffect) && !secondBombActive;
      secondBomb.addEventListener("click", secondBombActive ? undoSecondEffect : activateSecondBomb);
      grid.append(secondBomb);
    }

    wrap.append(label, grid);
    return wrap;
  }

  function activateBomb() {
    const round = getCurrentRound();
    round.specialCards.bomb.active = true;
    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    renderGame();
  }

  function undoBomb() {
    const round = getCurrentRound();
    round.specialCards.bomb.active = false;

    if (round.specialCards.witch.secondEffect === "bomb") {
      round.specialCards.witch.secondEffect = null;
      round.specialCards.secondBomb.active = false;
    }

    normalizeSpecialDependencies(round);
    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    renderGame();
  }

  function activateWitch() {
    const round = getCurrentRound();
    if (!round.specialCards.cloud.active && !round.specialCards.bomb.active) {
      showToast("Die Hexe benötigt zuerst eine Wolke oder Bombe.");
      return;
    }
    round.specialCards.witch.active = true;
    replaceRound(round);
    persistState();
    renderGame();
  }

  function undoWitch() {
    const round = getCurrentRound();
    round.specialCards.witch.active = false;
    round.specialCards.witch.secondEffect = null;
    Object.assign(round.specialCards.secondCloud, { active: false, playerId: null, change: 0 });
    round.specialCards.secondBomb.active = false;
    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    renderGame();
  }

  function activateSecondBomb() {
    const round = getCurrentRound();
    if (!round.specialCards.witch.active || !round.specialCards.bomb.active || round.specialCards.witch.secondEffect) return;

    round.specialCards.witch.secondEffect = "bomb";
    round.specialCards.secondBomb.active = true;
    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    renderGame();
  }

  function undoSecondEffect() {
    const round = getCurrentRound();
    round.specialCards.witch.secondEffect = null;
    Object.assign(round.specialCards.secondCloud, { active: false, playerId: null, change: 0 });
    round.specialCards.secondBomb.active = false;
    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    renderGame();
  }

  function undoCloud() {
    const round = getCurrentRound();
    Object.assign(round.specialCards.cloud, { active: false, playerId: null, change: 0 });

    if (round.specialCards.witch.secondEffect === "cloud") {
      round.specialCards.witch.secondEffect = null;
      Object.assign(round.specialCards.secondCloud, { active: false, playerId: null, change: 0 });
    }

    normalizeSpecialDependencies(round);
    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    renderGame();
  }

  function openCloudDialog(key) {
    const round = getCurrentRound();
    if (!round) return;

    if (key === "secondCloud" && (!round.specialCards.witch.active || !round.specialCards.cloud.active)) {
      showToast("Die zweite Wolke benötigt Hexe und erste Wolke.");
      return;
    }

    cloudDialogContext = { key, playerId: null };
    elements["cloud-dialog-kicker"].textContent = key === "cloud" ? "Wolke" : "2. Wolke durch Hexe";
    elements["cloud-change-options"].hidden = true;
    renderCloudPlayerOptions(round);
    openDialog(elements["cloud-dialog"]);
  }

  function renderCloudPlayerOptions(round) {
    const container = elements["cloud-player-options"];
    container.innerHTML = "";
    const order = Logic.getPlayersFromStartingPlayer(state.players, round.startingPlayerId);

    order.forEach((player) => {
      const button = createButton(getPlayerDisplayNameById(player.id), "button-secondary choice-button", () => selectCloudPlayer(player.id));
      if (cloudDialogContext?.playerId === player.id) button.classList.add("selected");
      container.append(button);
    });
  }

  function selectCloudPlayer(playerId) {
    const round = getCurrentRound();
    if (!round || !cloudDialogContext) return;

    cloudDialogContext.playerId = playerId;
    renderCloudPlayerOptions(round);
    elements["cloud-change-options"].hidden = false;

    const before = getBidBeforeCloud(round, cloudDialogContext.key, playerId);
    elements["btn-cloud-minus"].disabled = before <= 0;
  }

  function getBidBeforeCloud(round, key, playerId) {
    let bid = Number(round.playerResults[playerId]?.originalBid) || 0;

    if (key === "secondCloud") {
      const first = round.specialCards.cloud;
      if (first.active && first.playerId === playerId) {
        bid += first.change;
      }
    }

    return bid;
  }

  function commitCloudChange(change) {
    if (!cloudDialogContext?.playerId) return;

    const round = getCurrentRound();
    const key = cloudDialogContext.key;
    const cloud = round.specialCards[key];
    const previousRound = deepClone(round);

    Object.assign(cloud, {
      active: true,
      playerId: cloudDialogContext.playerId,
      change
    });

    if (key === "secondCloud") {
      round.specialCards.witch.secondEffect = "cloud";
      round.specialCards.secondBomb.active = false;
    }

    const errors = Logic.getSpecialCardErrors(round, state.players);
    if (errors.length > 0) {
      replaceRound(previousRound);
      showToast(errors[0]);
      return;
    }

    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    closeCloudDialog();
    renderGame();
  }

  function closeCloudDialog() {
    cloudDialogContext = null;
    closeDialog(elements["cloud-dialog"]);
  }

  function setRoundPhase(phase) {
    const round = getCurrentRound();
    if (!round) return;

    if (phase === "tricks") {
      const errors = Logic.getSpecialCardErrors(round, state.players);
      if (errors.length > 0) {
        showToast(errors[0]);
        return;
      }
    }

    round.phase = phase;
    round.completed = false;
    round.completedAt = null;
    clearRoundPoints(round);
    state.status = "running";
    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    renderGame();
  }

  // Phase 3: erzielte Stiche erfassen und auf die korrekte Summe prüfen
  function renderTricks(round) {
    const panel = createPanel();
    panel.classList.add("tricks-panel");
    panel.setAttribute("aria-label", "Stiche eintragen");
    const list = document.createElement("div");
    list.className = "entry-list";
    const maximumTricks = Logic.getExpectedTrickCount(round);

    state.players.forEach((player) => {
      const result = round.playerResults[player.id];

      list.append(createValueEntry({
        name: getPlayerDisplayNameById(player.id),
        value: result.tricks,
        min: 0,
        max: round.number,
        onChange: (next) => updateTricks(round.number, player.id, next),
        quickAction: {
          label: "Richtig",
          onClick: () => updateTricks(round.number, player.id, result.currentBid),
          disabled: result.tricks === result.currentBid || result.currentBid > maximumTricks,
          title: result.currentBid > maximumTricks
            ? "Diese Ansage ist mit den verfügbaren Stichen nicht erreichbar."
            : "Stichzahl auf die aktuelle Ansage setzen"
        }
      }));
    });

    const validation = Logic.validateTrickSum(round);
    let message;
    if (validation.valid) {
      message = createStatusCard("success", "Alle Stiche sind vollständig verteilt.", "");
    } else if (validation.difference < 0) {
      const missing = Math.abs(validation.difference);
      message = createStatusCard("error", `${missing} Stich${missing === 1 ? " fehlt" : "e fehlen"}.`, "");
    } else {
      const excess = validation.difference;
      message = createStatusCard("error", `${excess} Stich${excess === 1 ? " ist" : "e sind"} zu viel.`, "");
    }
    message.classList.add("trick-status");

    const actions = document.createElement("div");
    actions.className = "round-actions";
    actions.append(
      createButton("Zurück zu Sonderkarten", "button-secondary", () => setRoundPhase("play")),
      createButton("Runde abschließen", "button-primary", completeRound, !validation.valid)
    );

    panel.append(list, message, actions);
    elements["game-content"].replaceChildren(panel);
  }

  function updateTricks(roundNumber, playerId, nextValue) {
    const round = getRound(roundNumber);
    if (!round) return;

    round.playerResults[playerId].tricks = Math.min(Math.max(nextValue, 0), round.number);
    round.playerResults[playerId].roundPoints = null;
    round.completed = false;
    round.completedAt = null;
    replaceRound(round);
    persistState();
    renderGame();
  }

  function completeRound() {
    let round = getCurrentRound();
    if (!round) return;

    const specialErrors = Logic.getSpecialCardErrors(round, state.players);
    const tricks = Logic.validateTrickSum(round);

    if (specialErrors.length > 0) {
      showToast(specialErrors[0]);
      return;
    }

    if (!tricks.valid) {
      showToast("Die Stichsumme stimmt noch nicht.");
      return;
    }

    round = Logic.calculateRoundPoints(round, state.players);
    round.completed = true;
    round.completedAt = new Date().toISOString();
    round.phase = "result";
    replaceRound(round);
    persistState();
    renderGame();
  }

  // Phase 4: Rundenergebnis anzeigen, korrigieren oder zur nächsten Runde wechseln
  function renderRoundResult(round) {
    const panel = createPanel();
    panel.classList.add("round-result-panel");
    panel.setAttribute("aria-label", `Ergebnis Runde ${round.number}`);
    const totals = Logic.calculateTotalPoints(state.rounds, state.players);
    const tableWrap = document.createElement("div");
    tableWrap.className = "score-table-scroll";
    const table = document.createElement("div");
    table.className = "score-table five-columns";

    const header = document.createElement("div");
    header.className = "score-row header";
    header.innerHTML = '<span>Spieler</span><span class="number">Ansage</span><span class="number">Stiche</span><span class="number">Runde</span><span class="number">Gesamt</span>';
    table.append(header);

    state.players.forEach((player) => {
      const result = round.playerResults[player.id];
      const row = document.createElement("div");
      row.className = "score-row";

      const name = document.createElement("span");
      name.className = "score-player";
      const nameStrong = document.createElement("strong");
      nameStrong.textContent = getPlayerDisplayNameById(player.id);
      name.append(nameStrong);

      const bid = numberCell(result.currentBid, result.currentBid !== result.originalBid ? "changed-bid" : "");
      const tricks = numberCell(result.tricks);
      const points = numberCell(formatSigned(result.roundPoints), result.roundPoints >= 0 ? "positive" : "negative");
      const total = numberCell(totals[player.id], "total-points");
      bid.dataset.label = "Ansage";
      tricks.dataset.label = "Stiche";
      points.dataset.label = "Runde";
      total.dataset.label = "Gesamt";

      row.append(name, bid, tricks, points, total);
      table.append(row);
    });
    tableWrap.append(table);

    const actions = document.createElement("div");
    actions.className = "round-actions result-actions";
    actions.append(createButton("Runde bearbeiten", "button-secondary", openEditRoundDialog));

    const isLastRound = round.number >= state.totalRounds;
    actions.append(createButton(
      isLastRound ? "Spiel beenden" : "Nächste Runde",
      "button-primary",
      isLastRound ? finishGame : goToNextRound
    ));

    panel.append(tableWrap, actions);
    elements["game-content"].replaceChildren(panel);
  }

  function openEditRoundDialog() {
    openDialog(elements["edit-round-dialog"]);
  }

  function beginRoundEdit(phase) {
    closeDialog(elements["edit-round-dialog"]);
    const round = getCurrentRound();
    if (!round) return;

    round.completed = false;
    round.completedAt = null;
    round.phase = phase;
    clearRoundPoints(round);
    state.status = "running";
    replaceRound(Logic.recalculateCurrentBids(round, state.players));
    persistState();
    renderGame();
  }

  function clearRoundPoints(round) {
    Object.values(round.playerResults).forEach((result) => {
      result.roundPoints = null;
    });
  }

  function goToNextRound() {
    const current = getCurrentRound();
    if (!current?.completed) return;

    const nextNumber = current.number + 1;
    if (nextNumber > state.totalRounds) {
      finishGame();
      return;
    }

    state.currentRound = nextNumber;
    if (!getRound(nextNumber)) {
      state.rounds.push(Logic.createRound(state.players, state.firstDealerId, nextNumber));
      state.rounds.sort((a, b) => a.number - b.number);
    }

    state.status = "running";
    persistState();
    renderGame();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function finishGame() {
    const round = getCurrentRound();
    if (!round?.completed || round.number < state.totalRounds) return;

    state.status = "completed";
    persistState();
    archiveCompletedGame(state);
    renderFinished();
    showScreen("finished");
  }

  // Abschlussansicht mit Rangliste und vollständigem Punkteverlauf
  function renderFinished() {
    ensureState();
    const completedRounds = state.rounds.filter((round) => round.completed).sort((a, b) => a.number - b.number);
    const totals = Logic.calculateTotalPoints(completedRounds, state.players);

    renderRanking(elements["final-ranking"], state, totals);
    renderScoreHistory(elements["final-score-history"], completedRounds, totals, state);
  }

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
      position.setAttribute("aria-label", `Platz ${displayedPosition}`);

      const name = document.createElement("span");
      name.className = "ranking-name";
      name.textContent = getPlayerDisplayNameFromState(gameState, entry.player.id);

      const points = document.createElement("span");
      points.className = "ranking-points";
      points.textContent = `${entry.points} Punkte`;

      row.append(position, name, points);
      container.append(row);
    });
  }

  function renderScoreHistory(container, completedRounds, totals, gameState = state) {
    container.replaceChildren();

    const table = document.createElement("table");
    table.className = "history-table";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const roundHead = document.createElement("th");
    roundHead.scope = "col";
    roundHead.textContent = "Runde";
    headRow.append(roundHead);

    gameState.players.forEach((player, index) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = getPlayerDisplayName(player, index);
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
    totalLabel.textContent = "Gesamt";
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

  function reviewLastRound() {
    state.currentRound = state.totalRounds;
    const round = getCurrentRound();
    if (round) round.phase = "result";
    persistState();
    renderGame();
    showScreen("game");
  }

  function maybeShowRoundOneHint() {
    const round = getCurrentRound();
    if (round?.number === 1 && round.phase === "bids" && !state.roundOneHintConfirmed) {
      requestAnimationFrame(() => openDialog(elements["round-one-dialog"]));
    }
  }

  function confirmRoundOneHint() {
    state.roundOneHintConfirmed = true;
    persistState();
    closeDialog(elements["round-one-dialog"]);
  }

  // Wiederverwendbare Bausteine für dynamisch erzeugte Oberflächen
  function renderRoundOverview(phase) {
    const overviewPanel = elements["game-round-overview"];
    const container = elements["game-total-points"];
    container.replaceChildren();
    overviewPanel.hidden = phase !== "bids";
    if (overviewPanel.hidden) return;

    container.append(createTotalPointsGrid());
  }

  function createTotalPointsGrid() {
    const totals = Logic.calculateTotalPoints(state.rounds, state.players);
    const overview = document.createElement("div");
    overview.className = "points-grid";
    overview.setAttribute("aria-label", "Aktuelle Gesamtpunktzahlen");

    state.players.forEach((player) => {
      const card = document.createElement("div");
      card.className = "points-card";

      const name = document.createElement("span");
      name.textContent = getPlayerDisplayNameById(player.id);

      const points = document.createElement("strong");
      points.textContent = `${totals[player.id]} Punkte`;

      card.append(name, points);
      overview.append(card);
    });

    return overview;
  }

  function createPanel(title, description = "") {
    const panel = document.createElement("section");
    panel.className = "panel";

    if (title) {
      const heading = document.createElement("h3");
      heading.textContent = title;
      panel.append(heading);
    }

    if (description) {
      const text = document.createElement("p");
      text.textContent = description;
      panel.append(text);
    }

    return panel;
  }

  function createValueEntry({ name, meta, badges = [], value, min, max, onChange, quickAction = null }) {
    const row = document.createElement("div");
    row.className = "entry-row";

    const info = document.createElement("div");
    if (badges.length > 0) info.className = "entry-player-info";
    const nameElement = document.createElement("span");
    nameElement.className = "entry-name";
    nameElement.textContent = name;
    info.append(nameElement);

    if (meta) {
      const metaElement = document.createElement("span");
      metaElement.className = "entry-meta";
      metaElement.textContent = meta;
      info.append(metaElement);
    }

    if (badges.length > 0) {
      const badgeContainer = document.createElement("span");
      badgeContainer.className = "entry-role-badges";
      badges.forEach(({ label, role }) => badgeContainer.append(createSeatRoleBadge(label, role)));
      info.append(badgeContainer);
    }

    const stepper = document.createElement("div");
    stepper.className = "value-stepper";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "value-button";
    minus.textContent = "−";
    minus.disabled = value <= min;
    minus.setAttribute("aria-label", `${name}: Wert verringern`);
    minus.addEventListener("click", () => onChange(value - 1));

    const display = document.createElement("span");
    display.className = "value-display";
    display.textContent = String(value);
    display.setAttribute("aria-label", `${name}: ${value}`);

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "value-button";
    plus.textContent = "+";
    plus.disabled = value >= max;
    plus.setAttribute("aria-label", `${name}: Wert erhöhen`);
    plus.addEventListener("click", () => onChange(value + 1));

    stepper.append(minus, display, plus);

    const controls = document.createElement("div");
    controls.className = "entry-controls";

    if (quickAction) {
      const quickButton = createButton(
        quickAction.label,
        "button-secondary button-small correct-button",
        quickAction.onClick,
        Boolean(quickAction.disabled)
      );
      if (quickAction.title) quickButton.title = quickAction.title;
      controls.append(quickButton);
    }

    controls.append(stepper);
    row.append(info, controls);
    return row;
  }

  function createStatusCard(type, title, text) {
    const card = document.createElement("div");
    card.className = `status-card ${type}`;
    const strong = document.createElement("strong");
    strong.textContent = title;
    card.append(strong);

    if (text) {
      const body = document.createElement("span");
      body.textContent = text;
      card.append(body);
    }
    return card;
  }

  function createSpecialButton(label, active) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `special-button${active ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(active));

    const title = document.createElement("strong");
    title.textContent = label;
    button.append(title);

    return button;
  }

  function createButton(label, classNames, action, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${classNames}`;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", action);
    return button;
  }

  function numberCell(value, extraClass = "") {
    const cell = document.createElement("span");
    cell.className = `number${extraClass ? ` ${extraClass}` : ""}`;
    cell.textContent = String(value);
    return cell;
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function getRound(roundNumber) {
    return state.rounds.find((round) => round.number === roundNumber) ?? null;
  }

  function getCurrentRound() {
    return getRound(state.currentRound);
  }

  function ensureCurrentRound() {
    let round = getCurrentRound();
    if (!round) {
      round = Logic.createRound(state.players, state.firstDealerId, state.currentRound);
      state.rounds.push(round);
      state.rounds.sort((a, b) => a.number - b.number);
    }
    return round;
  }

  function replaceRound(nextRound) {
    const index = state.rounds.findIndex((round) => round.number === nextRound.number);
    if (index === -1) state.rounds.push(nextRound);
    else state.rounds[index] = nextRound;
    state.rounds.sort((a, b) => a.number - b.number);
  }

  function getPlayerDisplayNameById(playerId) {
    return getPlayerDisplayNameFromState(state, playerId);
  }

  function getPlayerDisplayNameFromState(gameState, playerId) {
    const index = gameState.players.findIndex((player) => player.id === playerId);
    if (index === -1) return "–";
    return getPlayerDisplayName(gameState.players[index], index);
  }

  function getPlayerDisplayName(player, index) {
    const trimmed = player?.name?.trim();
    return trimmed || `Spieler ${index + 1}`;
  }

  function formatSigned(value) {
    const number = Number(value) || 0;
    if (number > 0) return `+${number}`;
    if (number < 0) return `−${Math.abs(number)}`;
    return "0";
  }

  // Zustands-, Speicher- und Browser-Helfer
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureState() {
    if (!state) state = Logic.createInitialGameState();
  }

  function persistState(options) {
    if (!state) return;
    const saved = Storage.saveGame(state, options);
    if (!saved) {
      const error = Storage.getStorageErrors?.().gameError
        || "Der Spielstand konnte auf diesem Gerät nicht gespeichert werden. Exportiere den Spielstand, sobald die Speicherung wieder funktioniert.";
      updateStorageWarning(error);
      showToast(error);
    } else {
      externalGameWarning = "";
      updateStorageWarning();
    }
  }

  function archiveCompletedGame(gameState) {
    if (gameState?.status !== "completed") return true;

    const archived = Storage.saveCompletedGame(gameState);
    if (!archived) {
      const message = Storage.getStorageErrors?.().historyError
        || "Die abgeschlossene Partie konnte nicht im lokalen Archiv gespeichert werden.";
      updateStorageWarning(message);
      showToast(message);
    } else {
      updateHistoryControls(Storage.loadGameHistory());
      updateStorageWarning();
    }
    return archived;
  }

  function showToast(message) {
    const toast = elements["toast"];
    window.clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.hidden = false;
    toastTimeout = window.setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }


  async function requestPersistentStorage() {
    try {
      if (!navigator.storage?.persist) return;
      await navigator.storage.persist();
    } catch (error) {
      console.warn("Dauerhafte Speicherung konnte nicht angefragt werden:", error);
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js")
        .catch((error) => console.warn("Service Worker konnte nicht registriert werden:", error));
    });
  }
})();
