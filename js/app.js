(function bootstrapWizardApp() {
  "use strict";

  const Logic = window.WizardGameLogic;
  const StateManager = window.WizardStateManager;
  const Storage = window.WizardStorage;
  const ResultView = window.WizardResultView;
  const HistoryControllerModule = window.WizardHistoryController;
  const PersistenceControllerModule = window.WizardPersistenceController;
  const SetupControllerModule = window.WizardSetupController;
  const GameViewModule = window.WizardGameView;
  const RoundResultViewModule = window.WizardRoundResultView;
  const RoundControllerModule = window.WizardRoundController;
  const SpecialCardsControllerModule = window.WizardSpecialCardsController;
  const Ui = window.WizardUiComponents;
  const cloneState = StateManager?.cloneState;
  const normalizeSpecialDependencies = StateManager?.normalizeSpecialDependencies;
  const {
    createSeatRoleBadge,
    createPanel,
    createValueEntry,
    createStatusCard,
    createSpecialButton,
    createButton,
    numberCell,
    openDialog,
    closeDialog
  } = Ui ?? {};

  if (!Logic || !StateManager || !Storage || !ResultView
    || !PersistenceControllerModule || !SetupControllerModule || !GameViewModule
    || !RoundResultViewModule || !RoundControllerModule || !SpecialCardsControllerModule || !Ui) {
    console.error("Application dependencies could not be loaded.");
    return;
  }

  const elements = {};
  let historyController = null;
  let persistenceController = null;
  let setupController = null;
  let gameView = null;
  let roundResultView = null;
  let roundController = null;
  let specialCardsController = null;
  let state = null;
  let toastTimeout = null;
  const historyAvailable = typeof HistoryControllerModule?.createHistoryController === "function";

  document.addEventListener("DOMContentLoaded", init);

  // Initialization and central DOM references
  function init() {
    cacheElements();
    persistenceController = PersistenceControllerModule.createPersistenceController({
      Storage,
      elements,
      getState: () => state,
      showToast,
      refreshHomeScreen,
      getHistoryCapacityWarning: () => historyController?.getCapacityWarning() ?? ""
    });
    historyController = historyAvailable
      ? HistoryControllerModule.createHistoryController({
        Storage,
        Logic,
        StateManager,
        ResultView,
        elements,
        showScreen,
        showToast,
        refreshHomeScreen,
        updateStorageWarning
      })
      : createUnavailableHistoryController();
    setupController = SetupControllerModule.createSetupController({
      Logic,
      elements,
      createSeatRoleBadge,
      getState: () => state,
      ensureState,
      persistState,
      showScreen,
      renderGame,
      maybeShowRoundOneHint,
      getPlayerDisplayNameById,
      refreshConflictMode: () => persistenceController.refreshConflictMode()
    });
    gameView = GameViewModule.createGameView({
      Logic,
      elements,
      createSeatRoleBadge,
      getState: () => state,
      getCurrentRound,
      getPlayerColorIndex,
      getPlayerDisplayNameById
    });
    roundResultView = RoundResultViewModule.createRoundResultView({
      Logic,
      elements,
      createPanel,
      createButton,
      numberCell,
      getState: () => state,
      getPlayerColorIndex,
      getPlayerDisplayNameById,
      formatSigned,
      onEditRound: () => roundController.openEditRoundDialog(),
      onNextRound: () => roundController.goToNextRound(),
      onFinishGame: finishGame
    });
    roundController = RoundControllerModule.createRoundController({
      Logic,
      elements,
      createPanel,
      createValueEntry,
      createStatusCard,
      createButton,
      openDialog,
      closeDialog,
      getState: () => state,
      getRound,
      getCurrentRound,
      replaceRound,
      persistState,
      renderGame,
      getPlayerDisplayNameById,
      getPlayerColorIndex,
      showToast,
      finishGame
    });
    specialCardsController = SpecialCardsControllerModule.createSpecialCardsController({
      Logic,
      elements,
      normalizeSpecialDependencies,
      createPanel,
      createSpecialButton,
      createButton,
      openDialog,
      closeDialog,
      getState: () => state,
      getCurrentRound,
      replaceRound,
      persistState,
      renderGame,
      setRoundPhase: (phase) => roundController.setRoundPhase(phase),
      createBidOverview: (round) => gameView.createBidOverview(round),
      getPlayerDisplayNameById,
      getPlayerColorIndex,
      deepClone,
      showToast
    });
    bindEvents();
    persistenceController.bindEvents();
    setupController.bindEvents();
    roundController.bindEvents();
    specialCardsController.bindEvents();
    refreshHomeScreen();
    updateStorageWarning();
    showScreen("home");
    registerServiceWorker();
    persistenceController.requestPersistentStorage();
  }

  function cacheElements() {
    const ids = [
      "screen-home", "screen-setup", "screen-setup-summary",
      "screen-game", "screen-history", "screen-finished",
      "btn-new-game", "btn-continue-game", "btn-history", "btn-import-game",
      "import-file-input", "storage-warning", "storage-conflict-actions",
      "btn-export-conflict-state", "btn-reload-after-conflict",
      "btn-setup-home", "setup-form", "player-list", "player-count-badge",
      "btn-add-player", "round-mode-toggle", "btn-round-mode-full",
      "btn-round-mode-individual", "full-game-rounds", "custom-round-controls",
      "btn-rounds-minus", "rounds-input", "btn-rounds-plus",
      "rounds-message",
      "summary-player-count", "summary-round-count",
      "summary-seat-order", "btn-summary-back",
      "btn-summary-start", "form-errors",
      "btn-game-help", "btn-game-home", "game-phase-label", "game-title",
      "game-round-overview", "game-total-points", "game-content", "btn-history-home",
      "history-list-view", "history-game-list", "history-detail-view", "btn-history-list-back",
      "history-detail-ranking", "history-score-content",
      "btn-history-export-all", "btn-history-import", "history-storage-status",
      "btn-history-clear", "btn-history-export-game", "btn-history-delete-game",
      "final-ranking", "final-score-history", "btn-review-last-round",
      "btn-finished-go-home", "round-one-dialog", "btn-confirm-round-one-hint",
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
    historyController.bindEvents();
    elements["btn-finished-go-home"].addEventListener("click", goHome);
    elements["btn-review-last-round"].addEventListener("click", reviewLastRound);
    elements["btn-confirm-round-one-hint"].addEventListener("click", confirmRoundOneHint);
    elements["round-one-dialog"].addEventListener("cancel", (event) => event.preventDefault());

  }

  function startNewGame(forceReplace) {
    const savedGame = Storage.loadGame();
    const hasStoredGameData = Storage.hasStoredData();
    const hasUnsavedMemoryGame = persistenceController.canContinueFromMemory();
    if (!forceReplace && (hasStoredGameData || hasUnsavedMemoryGame)) {
      const shouldReplace = window.confirm(
        "A game already exists. Starting a new game will replace it. Continue?"
      );
      if (!shouldReplace) return;
    }

    if (!savedGame && hasStoredGameData && !Storage.deleteGame()) {
      updateStorageWarning("The corrupted game could not be replaced.");
      return;
    }

    state = Logic.createInitialGameState();
    persistState({
      expectedUpdatedAt: savedGame?.updatedAt ?? null,
      expectedGameId: savedGame?.gameId ?? null
    });
    setupController.renderSetup();
    showScreen("setup");
  }

  function continueGame() {
    const canContinueFromMemory = persistenceController.canContinueFromMemory();
    const savedState = canContinueFromMemory ? state : Storage.loadGame();

    if (!savedState) {
      showToast("No valid game state was found.");
      refreshHomeScreen();
      return;
    }

    if (!canContinueFromMemory) {
      state = cloneState(savedState);
      persistenceController.markStateLoaded();
    } else {
      persistState();
    }

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

    setupController.renderSetup();
    showScreen("setup");
  }

  // Navigation between the six views defined in index.html
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
    persistenceController.refreshConflictMode();
  }

  // Home screen and local game state
  function refreshHomeScreen() {
    const savedState = Storage.loadGame();
    const continueButton = elements["btn-continue-game"];
    const historyButton = elements["btn-history"];

    const games = Storage.loadGameHistory();
    const canContinueFromMemory = persistenceController.canContinueFromMemory();
    continueButton.disabled = !savedState && !canContinueFromMemory;
    historyButton.disabled = !historyAvailable || games.length === 0;
    historyController.updateControls(games);
    updateStorageWarning();
  }

  function updateStorageWarning(message = "") {
    persistenceController?.updateWarning(message);
  }

  function openHistory() {
    persistenceController.clearHistoryWarning();
    historyController.open();
    updateStorageWarning();
  }

  function createUnavailableHistoryController() {
    const disableControls = () => {
      [
        "btn-history",
        "btn-history-export-all",
        "btn-history-import",
        "btn-history-clear",
        "btn-history-export-game",
        "btn-history-delete-game"
      ].forEach((id) => {
        if (elements[id]) elements[id].disabled = true;
      });
    };

    disableControls();
    return Object.freeze({
      bindEvents: disableControls,
      updateControls: disableControls,
      getCapacityWarning: () => "",
      open: () => showToast("History is not available in this installation."),
      importArchive: () => {
        throw new Error("History is not available in this installation.");
      }
    });
  }

  async function importGameFromFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (file.size > 10_000_000) {
      showToast("The import file is unusually large and was rejected.");
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.exportFormat === "wizard-scoreboard-history") {
        historyController.importArchive(parsed);
        return;
      }

      if (file.size > 2_000_000) {
        throw new Error("The individual game state is unusually large and was rejected.");
      }

      const candidate = parsed?.exportFormat === "wizard-scoreboard-game" ? parsed.gameState : parsed;
      const isRecoveryExport = parsed?.exportFormat === "wizard-scoreboard-game"
        && ["storage-conflict", "unsaved-changes"].includes(parsed?.recoveryReason);
      const validationErrors = isRecoveryExport
        ? Logic.validatePersistableGameState(candidate)
        : Logic.validateImportedGameState(candidate);
      if (validationErrors.length > 0) throw new Error(validationErrors[0]);

      const savedBeforeImport = Storage.loadGame();
      const hasStoredGameData = Storage.hasStoredData();
      const shouldReplace = !hasStoredGameData || window.confirm(
        "The existing save will be replaced by the imported save. Continue?"
      );
      if (!shouldReplace) return;

      if (!savedBeforeImport && hasStoredGameData && !Storage.deleteGame()) {
        throw new Error("The corrupted game could not be replaced.");
      }

      const importedState = cloneState(candidate);
      if (!Storage.saveGame(importedState, {
        expectedUpdatedAt: savedBeforeImport?.updatedAt ?? null,
        expectedGameId: savedBeforeImport?.gameId ?? null
      })) {
        throw new Error("The imported game could not be saved locally.");
      }
      if (importedState.status === "completed") {
        archiveCompletedGame(importedState);
      }

      state = importedState;
      persistenceController.markStateImported();
      refreshHomeScreen();
      showToast("Game imported successfully.");
    } catch (error) {
      console.error("Import fehlgeschlagen:", error);
      showToast(error instanceof Error ? error.message : "The import file could not be read.");
    }
  }

  // Active game: select the phase view that matches the current round state.
  function renderGame() {
    ensureState();
    let round = ensureCurrentRound();
    round = Logic.recalculateCurrentBids(round, state.players);
    replaceRound(round);

    elements["game-title"].textContent = `Round ${round.number} of ${state.totalRounds}`;

    const labels = {
      bids: "Bids",
      play: "Special Cards",
      tricks: "Tricks",
      result: "Round Result"
    };
    elements["game-phase-label"].textContent = labels[round.phase] ?? "Active Game";
    elements["btn-game-help"].hidden = false;
    gameView.renderRoundOverview(round.phase);

    if (round.phase === "bids") roundController.renderBids(round);
    else if (round.phase === "play") specialCardsController.render(round);
    else if (round.phase === "tricks") roundController.renderTricks(round);
    else roundResultView.render(round);
    persistenceController.refreshConflictMode();
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

  // Final view with ranking and complete score history
  function renderFinished() {
    ensureState();
    const completedRounds = state.rounds.filter((round) => round.completed).sort((a, b) => a.number - b.number);
    const totals = Logic.calculateTotalPoints(completedRounds, state.players);

    ResultView.renderRanking(elements["final-ranking"], state, totals);
    ResultView.renderScoreHistory(elements["final-score-history"], completedRounds, totals, state);
    persistenceController.refreshConflictMode();
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

  function getRound(roundNumber) {
    return state.rounds.find((round) => round.number === roundNumber) ?? null;
  }

  function getPlayerColorIndex(playerId) {
    const index = state.players.findIndex((player) => player.id === playerId);
    return (index >= 0 ? index : 0) + 1;
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
    if (index === -1) return "\u2013";
    return getPlayerDisplayName(gameState.players[index], index);
  }

  function getPlayerDisplayName(player, index) {
    const trimmed = player?.name?.trim();
    return trimmed || `Player ${index + 1}`;
  }

  function formatSigned(value) {
    const number = Number(value) || 0;
    if (number > 0) return `+${number}`;
    if (number < 0) return `\u2212${Math.abs(number)}`;
    return "0";
  }

  // State, storage, and browser helpers
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureState() {
    if (!state) state = Logic.createInitialGameState();
  }

  function persistState(options) {
    return persistenceController.persist(options);
  }

  function archiveCompletedGame(gameState) {
    if (gameState?.status !== "completed") return true;

    const archived = Storage.saveCompletedGame(gameState);
    if (!archived) {
      const message = Storage.getStorageErrors?.().historyError
        || "The completed game could not be saved to the local archive.";
      updateStorageWarning(message);
      showToast(message);
    } else {
      historyController.updateControls(Storage.loadGameHistory());
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
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js")
        .catch((error) => console.warn("The service worker could not be registered:", error));
    });
  }
})();
