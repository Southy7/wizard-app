(function bootstrapWizardApp() {
  "use strict";

  const TOAST_DURATION_MS = 3_200;
  const UNARCHIVED_GAME_REPLACEMENT_MESSAGE =
    "The completed game is not safely stored in History. Open it with Continue and export it before starting a new game.";
  const GAME_HELP_CONTENT = createGameHelpContent({
    bids: {
      title: "Bids",
      intro: "Enter how many tricks each player expects to win.",
      steps: [
        ["Set each bid", "Use − and + next to each player."],
        ["Check Total Bids", "The total must not equal the round number. Green is valid; red must be changed."],
        ["Continue", "Select Confirm Bids when every bid is correct."]
      ]
    },
    play: {
      title: "Special Cards",
      intro: "Record only the special-card effects that occurred in this round.",
      steps: [
        ["Select cards", "Tap Cloud, Bomb, or Witch to activate it. Tap an active card again to undo it."],
        [
          "Complete effects",
          "For Cloud, choose the affected player and −1 or +1. Witch requires a second Cloud or Bomb."
        ],
        [
          "Cloud with Bomb",
          "If both were played in the same trick, Bomb cancels Cloud. Record only Bomb and do not enter a Cloud change."
        ],
        ["Continue", "Select Enter Tricks when all played special cards are recorded."]
      ]
    },
    tricks: {
      title: "Tricks",
      intro: "Enter how many tricks each player actually won.",
      steps: [
        ["Set each result", "Use − and +, or tap Bid to set a player's tricks directly to their current bid."],
        ["Check Total Tricks", "The assigned total must match the displayed target. Bombs reduce that target."],
        ["Continue", "Select Complete Round when the total is correct."]
      ]
    },
    result: {
      title: "Round Result",
      intro: "Review the completed round before continuing.",
      steps: [
        [
          "Read the result",
          "Bid and Tricks show the entries; Round shows points earned now; Total shows the overall score. Gold marks the current leader."
        ],
        ["Correct mistakes", "Select Edit Round and choose the section that needs changing."],
        ["Continue", "Select Next Round, or Finish Game after the final round."]
      ]
    }
  });

  const Logic = window.WizardGameLogic;
  const StateManager = window.WizardStateManager;
  const Storage = window.WizardStorage;
  const FileUtils = window.WizardFileUtils;
  const Formatters = window.WizardFormatters;
  const ResultView = window.WizardResultView;
  const HistoryControllerModule = window.WizardHistoryController;
  const ImportControllerModule = window.WizardImportController;
  const PersistenceControllerModule = window.WizardPersistenceController;
  const SetupControllerModule = window.WizardSetupController;
  const GameViewModule = window.WizardGameView;
  const RoundResultViewModule = window.WizardRoundResultView;
  const RoundControllerModule = window.WizardRoundController;
  const SpecialCardsControllerModule = window.WizardSpecialCardsController;
  const Ui = window.WizardUiComponents;
  const cloneState = StateManager?.cloneState;
  const normalizeSpecialDependencies = StateManager?.normalizeSpecialDependencies;
  const formatNumber = Formatters?.formatNumber;
  const formatSigned = Formatters?.formatSigned;
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

  if (
    !Logic ||
    !StateManager ||
    !Storage ||
    !FileUtils ||
    !Formatters ||
    !ResultView ||
    !ImportControllerModule ||
    !PersistenceControllerModule ||
    !SetupControllerModule ||
    !GameViewModule ||
    !RoundResultViewModule ||
    !RoundControllerModule ||
    !SpecialCardsControllerModule ||
    !Ui
  ) {
    console.error("Application dependencies could not be loaded.");
    return;
  }

  const elements = {};
  let historyController = null;
  let importController = null;
  let persistenceController = null;
  let setupController = null;
  let gameView = null;
  let roundResultView = null;
  let roundController = null;
  let specialCardsController = null;
  let state = null;
  let toastTimeout = null;
  // History is intentionally degradable; the core scoreboard can still start if that module fails.
  const historyAvailable = typeof HistoryControllerModule?.createHistoryController === "function";

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    persistenceController = PersistenceControllerModule.createPersistenceController({
      Storage,
      FileUtils,
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
          FileUtils,
          Formatters,
          elements,
          showScreen,
          showToast,
          refreshHomeScreen,
          updateStorageWarning,
          deleteMatchingActiveCompletedGame
        })
      : createUnavailableHistoryController();
    importController = ImportControllerModule.createImportController({
      Storage,
      Logic,
      elements,
      historyController,
      persistenceController,
      setState: (nextState) => {
        state = nextState;
      },
      archiveCompletedGame,
      refreshHomeScreen,
      showToast
    });
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
      getPlayerDisplayNameById,
      formatNumber
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
      formatNumber,
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
      cloneState,
      showToast
    });
    bindEvents();
    importController.bindEvents();
    persistenceController.bindEvents();
    setupController.bindEvents();
    roundController.bindEvents();
    specialCardsController.bindEvents();
    refreshHomeScreen();
    updateStorageWarning();
    // Avoid a focus ring on first paint; later client-side navigation still focuses headings.
    showScreen("home", { focusHeading: false });
    registerServiceWorker();
    persistenceController.requestPersistentStorage();
  }

  function getRequiredElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Required element #${id} was not found.`);
    }
    return element;
  }

  function cacheElements() {
    const ids = [
      "screen-home",
      "screen-setup",
      "screen-setup-summary",
      "screen-game",
      "screen-history",
      "screen-finished",
      "home-title",
      "players-title",
      "summary-title",
      "history-page-title",
      "finished-title",
      "btn-new-game",
      "btn-continue-game",
      "btn-history",
      "btn-import-game",
      "import-file-input",
      "storage-warning",
      "storage-conflict-actions",
      "btn-export-conflict-state",
      "btn-reload-after-conflict",
      "btn-setup-home",
      "setup-form",
      "player-list",
      "player-count-badge",
      "btn-add-player",
      "round-mode-toggle",
      "btn-round-mode-full",
      "btn-round-mode-individual",
      "full-game-rounds",
      "custom-round-controls",
      "btn-rounds-minus",
      "rounds-input",
      "btn-rounds-plus",
      "rounds-message",
      "summary-player-count",
      "summary-round-count",
      "summary-seat-order",
      "btn-summary-back",
      "btn-summary-start",
      "form-errors",
      "btn-game-help",
      "btn-game-cards",
      "btn-game-home",
      "game-phase-label",
      "game-title",
      "game-round-overview",
      "game-total-points",
      "game-content",
      "btn-history-home",
      "history-list-view",
      "history-game-list",
      "history-detail-view",
      "btn-history-list-back",
      "history-detail-ranking",
      "history-score-content",
      "history-score-progress",
      "btn-history-export-all",
      "btn-history-import",
      "history-storage-status",
      "btn-history-clear",
      "btn-history-export-game",
      "btn-history-delete-game",
      "history-recovery-view",
      "history-recovery-message",
      "btn-history-export-damaged",
      "btn-history-reset-damaged",
      "final-ranking",
      "final-score-history",
      "final-score-progress",
      "btn-review-last-round",
      "btn-finished-export-game",
      "btn-finished-go-home",
      "round-one-dialog",
      "btn-confirm-round-one-hint",
      "game-help-dialog",
      "game-help-dialog-title",
      "game-help-intro",
      "game-help-steps",
      "btn-close-game-help-dialog",
      "special-cards-dialog",
      "btn-close-special-cards-dialog",
      "cloud-dialog",
      "cloud-dialog-kicker",
      "cloud-player-options",
      "cloud-change-options",
      "btn-cloud-minus",
      "btn-cloud-plus",
      "btn-close-cloud-dialog",
      "edit-round-dialog",
      "btn-close-edit-dialog",
      "btn-edit-bids",
      "btn-edit-specials",
      "btn-edit-tricks",
      "toast"
    ];

    for (const id of ids) {
      elements[id] = getRequiredElement(id);
    }
  }

  function bindEvents() {
    elements["btn-new-game"].addEventListener("click", startNewGame);
    elements["btn-continue-game"].addEventListener("click", continueGame);
    elements["btn-history"].addEventListener("click", openHistory);
    elements["btn-setup-home"].addEventListener("click", goHome);
    elements["btn-game-home"].addEventListener("click", goHome);
    elements["btn-game-help"].addEventListener("click", openGameHelp);
    elements["btn-close-game-help-dialog"].addEventListener("click", () => closeDialog(elements["game-help-dialog"]));
    elements["btn-game-cards"].addEventListener("click", () => openDialog(elements["special-cards-dialog"]));
    elements["btn-close-special-cards-dialog"].addEventListener("click", () =>
      closeDialog(elements["special-cards-dialog"])
    );
    elements["btn-history-home"].addEventListener("click", goHome);
    historyController.bindEvents();
    elements["btn-finished-export-game"].addEventListener("click", exportCompletedGame);
    elements["btn-finished-go-home"].addEventListener("click", goHome);
    elements["btn-review-last-round"].addEventListener("click", reviewLastRound);
    elements["btn-confirm-round-one-hint"].addEventListener("click", confirmRoundOneHint);
    elements["round-one-dialog"].addEventListener("cancel", (event) => event.preventDefault());
  }

  function startNewGame() {
    const savedGame = Storage.loadGame();
    const hasStoredGameData = Storage.hasStoredData();
    const hasUnsavedMemoryGame = persistenceController.canContinueFromMemory();
    if (hasStoredGameData || hasUnsavedMemoryGame) {
      const shouldReplace = window.confirm("A game already exists. Starting a new game will replace it. Continue?");
      if (!shouldReplace) return;
    }

    if (hasUnsavedMemoryGame && state?.status === "completed") {
      updateStorageWarning(UNARCHIVED_GAME_REPLACEMENT_MESSAGE);
      showToast(UNARCHIVED_GAME_REPLACEMENT_MESSAGE);
      return;
    }

    const gameToReplace = hasUnsavedMemoryGame ? null : savedGame;
    if (!ensureCompletedGameArchived(gameToReplace)) {
      updateStorageWarning(UNARCHIVED_GAME_REPLACEMENT_MESSAGE);
      showToast(UNARCHIVED_GAME_REPLACEMENT_MESSAGE);
      return;
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
    let stateIsPersisted = !canContinueFromMemory;

    if (!savedState) {
      showToast("No valid game state was found.");
      refreshHomeScreen();
      return;
    }

    if (!canContinueFromMemory) {
      state = cloneState(savedState);
      persistenceController.markStateLoaded();
    } else {
      stateIsPersisted = persistState();
    }

    if (state.status === "completed") {
      if (stateIsPersisted) ensureCompletedGameArchived(state);
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

  function goHome() {
    const stateIsPersisted = persistState();
    if (stateIsPersisted) ensureCompletedGameArchived(state);
    refreshHomeScreen();
    showScreen("home");
  }

  function showScreen(name, { focusHeading = true } = {}) {
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

    const focusTargetIds = {
      home: "home-title",
      setup: "players-title",
      "setup-summary": "summary-title",
      game: "game-phase-label",
      history: "history-page-title",
      finished: "finished-title"
    };
    if (focusHeading) {
      elements[focusTargetIds[name]]?.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    persistenceController.refreshConflictMode();
  }

  function openGameHelp() {
    const phase = getCurrentRound()?.phase;
    const help = GAME_HELP_CONTENT[phase];

    if (!help) return;

    elements["game-help-dialog-title"].textContent = help.title;
    elements["game-help-intro"].textContent = help.intro;
    const items = help.steps.map(([title, text]) => {
      const item = document.createElement("li");
      const strong = document.createElement("strong");
      const description = document.createElement("span");
      strong.textContent = title;
      description.textContent = text;
      item.append(strong, description);
      return item;
    });
    elements["game-help-steps"].replaceChildren(...items);
    openDialog(elements["game-help-dialog"]);
  }

  function refreshHomeScreen() {
    const savedState = Storage.loadGame();
    const continueButton = elements["btn-continue-game"];
    const historyButton = elements["btn-history"];

    const games = Storage.loadGameHistory();
    const historyNeedsRecovery = Boolean(Storage.getStorageErrors?.().historyError && Storage.hasStoredHistoryData?.());
    const canContinueFromMemory = persistenceController.canContinueFromMemory();
    continueButton.disabled = !savedState && !canContinueFromMemory;
    historyButton.disabled = !historyAvailable || (games.length === 0 && !historyNeedsRecovery);
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
        "btn-history-delete-game",
        "btn-history-export-damaged",
        "btn-history-reset-damaged"
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
    const stateIsPersisted = persistState();
    if (!stateIsPersisted) return;

    archiveCompletedGame(state);
    renderFinished();
    showScreen("finished");
  }

  function renderFinished() {
    ensureState();
    const completedRounds = state.rounds.filter((round) => round.completed).sort((a, b) => a.number - b.number);
    const totals = Logic.calculateTotalPoints(completedRounds, state.players);

    ResultView.renderRanking(elements["final-ranking"], state, totals);
    ResultView.renderScoreHistory(elements["final-score-history"], completedRounds, totals, state);
    ResultView.renderScoreProgress(elements["final-score-progress"], completedRounds, state);
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
    return Formatters.getPlayerDisplayName(state, playerId);
  }

  function ensureState() {
    if (!state) state = Logic.createInitialGameState();
  }

  function persistState(options) {
    return persistenceController.persist(options);
  }

  function deleteMatchingActiveCompletedGame(gameIds) {
    const deletedIds = new Set(Array.isArray(gameIds) ? gameIds : []);
    if (deletedIds.size === 0) return true;

    const storedState = Storage.loadGame();
    const storedGameMatches =
      storedState?.status === "completed" &&
      typeof storedState.gameId === "string" &&
      deletedIds.has(storedState.gameId);
    const memoryGameMatches =
      state?.status === "completed" && typeof state.gameId === "string" && deletedIds.has(state.gameId);

    if (!storedGameMatches && !memoryGameMatches) return true;

    if (storedGameMatches && !Storage.deleteGame()) {
      const message =
        Storage.getStorageErrors?.().gameError || "The matching completed save could not be deleted from this device.";
      updateStorageWarning(message);
      showToast(message);
      return false;
    }

    if (memoryGameMatches) state = null;
    if (!state) persistenceController.markStateLoaded();
    return true;
  }

  function archiveCompletedGame(gameState) {
    if (gameState?.status !== "completed") return true;

    const archived = Storage.saveCompletedGame(gameState);
    if (!archived) {
      const message =
        Storage.getStorageErrors?.().historyError || "The completed game could not be saved to the local archive.";
      updateStorageWarning(message);
      showToast(message);
    } else {
      historyController.updateControls(Storage.loadGameHistory());
      updateStorageWarning();
    }
    return archived;
  }

  function ensureCompletedGameArchived(gameState) {
    if (gameState?.status !== "completed") return true;

    const candidate = serializeComparableCompletedGame(gameState);
    const matchingEntryExists = Storage.loadGameHistory().some(
      (archivedGame) => serializeComparableCompletedGame(archivedGame) === candidate
    );
    return matchingEntryExists || archiveCompletedGame(gameState);
  }

  function serializeComparableCompletedGame(gameState) {
    const canonicalState = Logic.createCanonicalGameState(gameState);
    canonicalState.updatedAt = null;
    return JSON.stringify(canonicalState);
  }

  function exportCompletedGame() {
    if (state?.status !== "completed") return;

    const exportedAt = new Date();
    FileUtils.downloadJson(
      {
        exportFormat: "wizard-scoreboard-game",
        exportVersion: 1,
        exportedAt: exportedAt.toISOString(),
        gameState: JSON.parse(JSON.stringify(state))
      },
      `wizard-game-${FileUtils.formatFileTimestamp(exportedAt)}.json`
    );
    showToast("The completed game was exported.");
  }

  function showToast(message) {
    const toast = elements["toast"];
    window.clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.hidden = false;
    toastTimeout = window.setTimeout(() => {
      toast.hidden = true;
    }, TOAST_DURATION_MS);
  }

  function createGameHelpContent(content) {
    const entries = Object.entries(content).map(([phase, help]) => [
      phase,
      Object.freeze({
        ...help,
        steps: Object.freeze(help.steps.map((step) => Object.freeze(step)))
      })
    ]);
    return Object.freeze(Object.fromEntries(entries));
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./service-worker.js")
        .catch((error) => console.warn("The service worker could not be registered:", error));
    });
  }
})();
