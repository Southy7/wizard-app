(function attachSpecialCardsController(root) {
  "use strict";

  function createSpecialCardsController({
    Logic,
    elements,
    normalizeSpecialDependencies,
    createPanel,
    createSpecialButton,
    createButton,
    openDialog,
    closeDialog,
    getState,
    getCurrentRound,
    replaceRound,
    persistState,
    renderGame,
    setRoundPhase,
    createBidOverview,
    getPlayerDisplayNameById,
    getPlayerColorIndex,
    deepClone,
    showToast
  }) {
    let cloudDialogContext = null;

    function bindEvents() {
      elements["btn-close-cloud-dialog"].addEventListener("click", closeCloudDialog);
      elements["btn-cloud-minus"].addEventListener("click", () => commitCloudChange(-1));
      elements["btn-cloud-plus"].addEventListener("click", () => commitCloudChange(1));
    }

    function render(round) {
      const state = getState();
      const bidsPanel = createPanel();
      bidsPanel.classList.add("bid-overview-panel");
      bidsPanel.setAttribute("aria-label", "Bid overview");
      bidsPanel.append(createBidOverview(round));

      const specialPanel = createPanel();
      specialPanel.classList.add("special-panel");
      specialPanel.setAttribute("aria-label", "Select special cards");
      const cards = round.specialCards;
      const grid = document.createElement("div");
      grid.className = "special-card-grid";
      const cloudButton = createSpecialButton("☁ Cloud", cards.cloud.active);
      cloudButton.addEventListener("click", cards.cloud.active ? undoCloud : () => openCloudDialog("cloud"));
      const bombButton = createSpecialButton("💣 Bomb", cards.bomb.active);
      bombButton.addEventListener("click", cards.bomb.active ? undoBomb : activateBomb);
      const canActivateWitch = cards.cloud.active || cards.bomb.active;
      const witchButton = createSpecialButton("🧙 Witch", cards.witch.active);
      witchButton.disabled = !cards.witch.active && !canActivateWitch;
      witchButton.addEventListener("click", cards.witch.active ? undoWitch : activateWitch);
      grid.append(cloudButton, bombButton, witchButton);
      specialPanel.append(grid);

      if (cards.witch.active) specialPanel.append(createSecondEffectSection(round));

      const errors = Logic.getSpecialCardErrors(round, state.players);
      const actions = document.createElement("div");
      actions.className = "round-actions special-actions";
      const editBidsButton = createButton("<", "button-secondary special-back-button", () => setRoundPhase("bids"));
      editBidsButton.setAttribute("aria-label", "Edit Bids");
      editBidsButton.title = "Edit Bids";
      actions.append(
        editBidsButton,
        createButton("Enter Tricks", "button-primary", () => setRoundPhase("tricks"), errors.length > 0)
      );
      specialPanel.append(actions);
      elements["game-content"].replaceChildren(bidsPanel, specialPanel);
    }

    function createSecondEffectSection(round) {
      const cards = round.specialCards;
      const wrap = document.createElement("div");
      wrap.className = "second-effect-wrap";
      const label = document.createElement("p");
      label.className = "second-effect-label";
      label.textContent = "Played again through the Witch:";
      const grid = document.createElement("div");
      grid.className = "second-effect-grid";
      const secondCloudActive = cards.witch.secondEffect === "cloud" && cards.secondCloud.active;
      const secondBombActive = cards.witch.secondEffect === "bomb" && cards.secondBomb.active;

      if (cards.cloud.active) {
        const secondCloud = createSpecialButton("☁ 2nd Cloud", secondCloudActive);
        secondCloud.disabled = Boolean(cards.witch.secondEffect) && !secondCloudActive;
        secondCloud.addEventListener("click", secondCloudActive ? undoSecondEffect : () => openCloudDialog("secondCloud"));
        grid.append(secondCloud);
      }

      if (cards.bomb.active) {
        const secondBomb = createSpecialButton("💣 2nd Bomb", secondBombActive);
        secondBomb.disabled = Boolean(cards.witch.secondEffect) && !secondBombActive;
        secondBomb.addEventListener("click", secondBombActive ? undoSecondEffect : activateSecondBomb);
        grid.append(secondBomb);
      }

      wrap.append(label, grid);
      return wrap;
    }

    function updateRound(mutator, recalculate = true) {
      const state = getState();
      const round = getCurrentRound();
      if (!round) return;
      mutator(round);
      replaceRound(recalculate ? Logic.recalculateCurrentBids(round, state.players) : round);
      persistState();
      renderGame();
    }

    function activateBomb() {
      updateRound((round) => {
        round.specialCards.bomb.active = true;
      });
    }

    function undoBomb() {
      updateRound((round) => {
        round.specialCards.bomb.active = false;
        if (round.specialCards.witch.secondEffect === "bomb") {
          round.specialCards.witch.secondEffect = null;
          round.specialCards.secondBomb.active = false;
        }
        normalizeSpecialDependencies(round);
      });
    }

    function activateWitch() {
      const round = getCurrentRound();
      if (!round.specialCards.cloud.active && !round.specialCards.bomb.active) {
        showToast("The Witch requires a Cloud or Bomb first.");
        return;
      }
      updateRound((currentRound) => {
        currentRound.specialCards.witch.active = true;
      }, false);
    }

    function undoWitch() {
      updateRound((round) => {
        round.specialCards.witch.active = false;
        round.specialCards.witch.secondEffect = null;
        Object.assign(round.specialCards.secondCloud, { active: false, playerId: null, change: 0 });
        round.specialCards.secondBomb.active = false;
      });
    }

    function activateSecondBomb() {
      const round = getCurrentRound();
      if (!round.specialCards.witch.active || !round.specialCards.bomb.active || round.specialCards.witch.secondEffect) return;
      updateRound((currentRound) => {
        currentRound.specialCards.witch.secondEffect = "bomb";
        currentRound.specialCards.secondBomb.active = true;
      });
    }

    function undoSecondEffect() {
      updateRound((round) => {
        round.specialCards.witch.secondEffect = null;
        Object.assign(round.specialCards.secondCloud, { active: false, playerId: null, change: 0 });
        round.specialCards.secondBomb.active = false;
      });
    }

    function undoCloud() {
      updateRound((round) => {
        Object.assign(round.specialCards.cloud, { active: false, playerId: null, change: 0 });
        if (round.specialCards.witch.secondEffect === "cloud") {
          round.specialCards.witch.secondEffect = null;
          Object.assign(round.specialCards.secondCloud, { active: false, playerId: null, change: 0 });
        }
        normalizeSpecialDependencies(round);
      });
    }

    function openCloudDialog(key) {
      const round = getCurrentRound();
      if (!round) return;
      if (key === "secondCloud" && (!round.specialCards.witch.active || !round.specialCards.cloud.active)) {
        showToast("The second Cloud requires the Witch and the first Cloud.");
        return;
      }

      cloudDialogContext = { key, playerId: null };
      elements["cloud-dialog-kicker"].textContent = key === "cloud" ? "Cloud" : "2nd Cloud through Witch";
      elements["cloud-change-options"].hidden = true;
      renderCloudPlayerOptions(round);
      openDialog(elements["cloud-dialog"]);
    }

    function renderCloudPlayerOptions(round) {
      const state = getState();
      const container = elements["cloud-player-options"];
      container.innerHTML = "";
      const order = Logic.getPlayersFromStartingPlayer(state.players, round.startingPlayerId);
      order.forEach((player) => {
        const button = createButton(getPlayerDisplayNameById(player.id), "button-secondary choice-button", () => selectCloudPlayer(player.id));
        button.dataset.playerColor = String(getPlayerColorIndex(player.id));
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
      elements["btn-cloud-minus"].disabled = getBidBeforeCloud(round, cloudDialogContext.key, playerId) <= 0;
    }

    function getBidBeforeCloud(round, key, playerId) {
      let bid = Number(round.playerResults[playerId]?.originalBid) || 0;
      if (key === "secondCloud") {
        const first = round.specialCards.cloud;
        if (first.active && first.playerId === playerId) bid += first.change;
      }
      return bid;
    }

    function commitCloudChange(change) {
      const state = getState();
      if (!cloudDialogContext?.playerId) return;
      const round = getCurrentRound();
      const key = cloudDialogContext.key;
      const cloud = round.specialCards[key];
      const previousRound = deepClone(round);
      Object.assign(cloud, { active: true, playerId: cloudDialogContext.playerId, change });
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

    return { bindEvents, render };
  }

  root.WizardSpecialCardsController = { createSpecialCardsController };
}(window));
