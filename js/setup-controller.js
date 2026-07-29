(function attachSetupController(root) {
  "use strict";

  function createSetupController({
    Logic,
    elements,
    createSeatRoleBadge,
    getState,
    ensureState,
    persistState,
    showScreen,
    renderGame,
    maybeShowRoundOneHint,
    getPlayerDisplayNameById,
    refreshConflictMode
  }) {
    let state = null;
    let nameValidationActive = false;

    function syncState() {
      ensureState();
      state = getState();
      return state;
    }

    function bindEvents() {
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
    }

    function renderSetup() {
      syncState();
      nameValidationActive = false;
      renderPlayerList();
      renderRoundControls();
      renderSummary();
      clearFormErrors();
      refreshConflictMode();
    }

    function renderPlayerList() {
      const playerList = elements["player-list"];
      const duplicateIds = Logic.getDuplicateNameIds(state.players);
      playerList.innerHTML = "";

      state.players.forEach((player, index) => {
        const row = document.createElement("div");
        row.className = "player-row";
        row.dataset.playerId = player.id;
        row.dataset.playerColor = String(index + 1);

        const inputWrap = document.createElement("div");
        inputWrap.className = "player-input-wrap";
        const input = document.createElement("input");
        input.id = `player-name-${player.id}`;
        input.className = "text-input";
        input.type = "text";
        input.maxLength = 30;
        input.autocomplete = "off";
        input.placeholder = `Player ${index + 1}`;
        input.setAttribute("aria-label", `Player ${index + 1}`);
        input.value = player.name;
        input.setAttribute("aria-invalid", String(nameValidationActive && !player.name.trim()));
        input.addEventListener("input", (event) => updatePlayerName(player.id, event.target.value));

        const duplicateHint = document.createElement("span");
        duplicateHint.className = "duplicate-hint";
        duplicateHint.textContent = duplicateIds.has(player.id) ? "This name is used more than once." : "";
        inputWrap.append(input, duplicateHint);

        const actions = document.createElement("div");
        actions.className = "player-actions";
        const moveUp = createIconButton("↑", `Move player ${index + 1} up`, index === 0);
        moveUp.addEventListener("click", () => reorderPlayer(player.id, "up"));
        const moveDown = createIconButton("↓", `Move player ${index + 1} down`, index === state.players.length - 1);
        moveDown.addEventListener("click", () => reorderPlayer(player.id, "down"));
        const remove = createIconButton("×", `Remove player ${index + 1}`, state.players.length <= Logic.MIN_PLAYERS, true);
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
        if (input && player) {
          input.setAttribute("aria-invalid", String(nameValidationActive && !player.name.trim()));
        }
        if (hint) hint.textContent = duplicateIds.has(playerId) ? "This name is used more than once." : "";
      });
    }

    function addPlayer() {
      if (state.players.length >= Logic.MAX_PLAYERS) return;
      state.players.push(Logic.createPlayer(state.players.length));
      state.setupDealerRandomized = false;
      syncRoundsAfterPlayerChange();
      persistState();
      renderSetup();
      requestAnimationFrame(() => {
        const last = state.players[state.players.length - 1];
        document.getElementById(`player-name-${last.id}`)?.focus();
      });
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
      if (mode === "full") state.totalRounds = Logic.getStandardRounds(state.players.length);
      persistState();
      renderRoundControls();
      renderSummary();
      if (mode === "individual") requestAnimationFrame(() => elements["rounds-input"].focus());
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
      state.totalRounds = corrected;
      persistState();
      renderRoundControls(entered !== corrected ? `Choose between 1 and ${maximum} rounds. The value was adjusted.` : "");
      renderSummary();
    }

    function syncRoundsAfterPlayerChange() {
      state.totalRounds = state.roundMode === "individual"
        ? Logic.clampRoundCount(state.totalRounds, state.players.length, state.totalCards)
        : Logic.getStandardRounds(state.players.length);
    }

    function renderSummary() {
      state = getState();
      const starter = Logic.getStartingPlayerForRound(state.players, state.firstDealerId, 1);
      elements["summary-player-count"].textContent =
        `${state.players.length} ${state.players.length === 1 ? "Player" : "Players"}`;
      elements["summary-round-count"].textContent =
        `${state.totalRounds} ${state.totalRounds === 1 ? "Round" : "Rounds"}`;
      const seatOrder = elements["summary-seat-order"];
      seatOrder.innerHTML = "";

      state.players.forEach((player, index) => {
        const item = document.createElement("li");
        item.className = "seat-order-item";
        item.dataset.playerColor = String(index + 1);
        const position = document.createElement("span");
        position.className = "seat-position";
        position.textContent = String(index + 1);
        position.setAttribute("aria-label", `seat ${index + 1}`);
        const name = document.createElement("span");
        name.className = "seat-player-name";
        name.textContent = getPlayerDisplayNameById(player.id);
        const roles = document.createElement("span");
        roles.className = "seat-role-badges";
        if (player.id === state.firstDealerId) roles.append(createSeatRoleBadge("Dealer", "dealer"));
        if (player.id === starter?.id) roles.append(createSeatRoleBadge("Starting Player", "starter"));
        const playerMain = document.createElement("span");
        playerMain.className = "seat-player-main";
        playerMain.append(name, roles);
        item.append(position, playerMain);
        seatOrder.append(item);
      });
    }

    function submitSetup(event) {
      event.preventDefault();
      commitRoundInput();
      const errors = Logic.validateSetup(state);
      if (errors.length > 0) {
        nameValidationActive = true;
        updateDuplicateHints();
        showFormErrors(errors);
        focusFirstInvalidField();
        return;
      }
      clearFormErrors();
      if (!state.setupDealerRandomized && state.players.length > 0) {
        state.firstDealerId = state.players[Math.floor(Math.random() * state.players.length)].id;
        state.setupDealerRandomized = true;
      }
      renderSummary();
      persistState();
      showScreen("setup-summary");
    }

    function returnToSetup() {
      renderSetup();
      showScreen("setup");
    }

    function startGameFromSummary() {
      const errors = Logic.validateSetup(state);
      if (errors.length > 0) {
        renderSetup();
        nameValidationActive = true;
        updateDuplicateHints();
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
      (invalidNameInput ?? elements["rounds-input"]).focus();
    }

    return Object.freeze({
      bindEvents,
      renderSetup,
      renderSummary
    });
  }

  root.WizardSetupController = Object.freeze({
    createSetupController
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
