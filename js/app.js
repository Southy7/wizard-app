(function bootstrapWizardApp() {
  "use strict";

  const Logic = window.WizardGameLogic;
  const StateManager = window.WizardStateManager;
  const Storage = window.WizardStorage;
  const ResultView = window.WizardResultView;
  const HistoryControllerModule = window.WizardHistoryController;
  const PersistenceControllerModule = window.WizardPersistenceController;
  const SetupControllerModule = window.WizardSetupController;
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
    || !PersistenceControllerModule || !SetupControllerModule || !Ui) {
    console.error("Die Anwendungsabhängigkeiten konnten nicht geladen werden.");
    return;
  }

  const elements = {};
  let historyController = null;
  let persistenceController = null;
  let setupController = null;
  let state = null;
  let toastTimeout = null;
  let cloudDialogContext = null;
  const historyAvailable = typeof HistoryControllerModule?.createHistoryController === "function";

  document.addEventListener("DOMContentLoaded", init);

  // Initialisierung und zentrale DOM-Verknüpfungen
  function init() {
    cacheElements();
    persistenceController = PersistenceControllerModule.createPersistenceController({
      Storage,
      elements,
      getState: () => state,
      showToast,
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
    bindEvents();
    persistenceController.bindEvents();
    setupController.bindEvents();
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
    historyController.bindEvents();
    elements["btn-finished-home"].addEventListener("click", goHome);
    elements["btn-finished-new-game"].addEventListener("click", () => startNewGame(false));
    elements["btn-review-last-round"].addEventListener("click", reviewLastRound);
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
    const hasStoredGameData = Storage.hasStoredData();
    if (!forceReplace && hasStoredGameData) {
      const shouldReplace = window.confirm(
        "Es ist bereits ein Spiel gespeichert. Beim Starten eines neuen Spiels wird der bisherige Spielstand ersetzt. Fortfahren?"
      );
      if (!shouldReplace) return;
    }

    if (!savedGame && hasStoredGameData && !Storage.deleteGame()) {
      updateStorageWarning("Der beschädigte Spielstand konnte nicht ersetzt werden.");
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
      showToast("Es wurde kein gültiger Spielstand gefunden.");
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
    persistenceController.refreshConflictMode();
  }

  // Startseite und lokaler Spielstand
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
      open: () => showToast("Die optionale History ist in dieser Installation nicht verfügbar."),
      importArchive: () => {
        throw new Error("Die optionale History ist in dieser Installation nicht verfügbar.");
      }
    });
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
        historyController.importArchive(parsed);
        return;
      }

      if (file.size > 2_000_000) {
        throw new Error("Der einzelne Spielstand ist ungewöhnlich groß und wurde abgelehnt.");
      }

      const candidate = parsed?.exportFormat === "wizard-punkte-app" ? parsed.gameState : parsed;
      const isConflictRecovery = parsed?.exportFormat === "wizard-punkte-app"
        && parsed?.recoveryReason === "storage-conflict";
      const validationErrors = isConflictRecovery
        ? Logic.validatePersistableGameState(candidate)
        : Logic.validateImportedGameState(candidate);
      if (validationErrors.length > 0) throw new Error(validationErrors[0]);

      const savedBeforeImport = Storage.loadGame();
      const hasStoredGameData = Storage.hasStoredData();
      const shouldReplace = !hasStoredGameData || window.confirm(
        "Der vorhandene Spielstand wird durch den importierten Spielstand ersetzt. Fortfahren?"
      );
      if (!shouldReplace) return;

      if (!savedBeforeImport && hasStoredGameData && !Storage.deleteGame()) {
        throw new Error("Der beschädigte Spielstand konnte nicht ersetzt werden.");
      }

      const importedState = cloneState(candidate);
      if (!Storage.saveGame(importedState, {
        expectedUpdatedAt: savedBeforeImport?.updatedAt ?? null,
        expectedGameId: savedBeforeImport?.gameId ?? null
      })) {
        throw new Error("Der importierte Spielstand konnte nicht lokal gespeichert werden.");
      }
      if (importedState.status === "completed") {
        archiveCompletedGame(importedState);
      }

      state = importedState;
      persistenceController.markStateImported();
      refreshHomeScreen();
      showToast("Spielstand wurde erfolgreich importiert.");
    } catch (error) {
      console.error("Import fehlgeschlagen:", error);
      showToast(error instanceof Error ? error.message : "Die Importdatei konnte nicht gelesen werden.");
    }
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
    persistenceController.refreshConflictMode();
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

    if (phase === "bids"
      && round.specialCards.witch.active
      && !round.specialCards.witch.secondEffect) {
      showToast("Wähle zuerst die zweite Sonderkarte der Hexe aus oder entferne die Hexe.");
      return;
    }

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
    return persistenceController.persist(options);
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
        .catch((error) => console.warn("Service Worker konnte nicht registriert werden:", error));
    });
  }
})();
