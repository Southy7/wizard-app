(function attachRoundController(root) {
  "use strict";

  const REQUIRED_ELEMENT_IDS = Object.freeze([
    "game-content",
    "edit-round-dialog",
    "btn-close-edit-dialog",
    "btn-edit-bids",
    "btn-edit-specials",
    "btn-edit-tricks"
  ]);

  function getRequiredElements(documentRoot) {
    return Object.freeze(
      Object.fromEntries(
        REQUIRED_ELEMENT_IDS.map((id) => {
          const element = documentRoot.getElementById(id);
          if (!element) throw new Error(`Required round element #${id} was not found.`);
          return [id, element];
        })
      )
    );
  }

  function createRoundController({ services = {}, state = {}, ui = {} } = {}) {
    const { Logic, persistence = {} } = services;
    const { persistState } = persistence;
    const { getState, getRound, getCurrentRound, replaceRound } = state;
    const {
      elements,
      createPanel,
      createValueEntry,
      createStatusCard,
      createButton,
      openDialog,
      closeDialog,
      renderGame,
      getPlayerDisplayNameById,
      getPlayerColorIndex,
      showToast,
      finishGame
    } = ui;
    function bindEvents() {
      elements["btn-close-edit-dialog"].addEventListener("click", () => closeDialog(elements["edit-round-dialog"]));
      elements["btn-edit-bids"].addEventListener("click", () => beginRoundEdit("bids"));
      elements["btn-edit-specials"].addEventListener("click", () => beginRoundEdit("play"));
      elements["btn-edit-tricks"].addEventListener("click", () => beginRoundEdit("tricks"));
    }

    function renderBids(round) {
      const state = getState();
      const panel = createPanel("Bids");
      panel.classList.add("bid-panel");
      panel.setAttribute("aria-label", "Enter bids");
      const list = document.createElement("div");
      list.className = "entry-list";

      const order = Logic.getPlayersFromStartingPlayer(state.players, round.startingPlayerId);
      order.forEach((player) => {
        const result = round.playerResults[player.id];
        list.append(
          createValueEntry({
            name: getPlayerDisplayNameById(player.id),
            badges: [
              ...(player.id === round.dealerId ? [{ label: "Dealer", role: "dealer" }] : []),
              ...(player.id === round.startingPlayerId ? [{ label: "Starting Player", role: "starter" }] : [])
            ],
            value: result.originalBid,
            min: 0,
            max: round.number,
            colorIndex: getPlayerColorIndex(player.id),
            onChange: (next) => updateBid(round.number, player.id, next)
          })
        );
      });

      const sum = Logic.getBidSum(round);
      const validSum = Logic.isBidSumValid(round);
      const specialErrors = Logic.getSpecialCardErrors(round, state.players);
      const summary = document.createElement("div");
      summary.className = "phase-summary";
      const bidTotal = document.createElement("div");
      bidTotal.className = "status-card bid-total-card";
      const bidTotalLabel = document.createElement("strong");
      bidTotalLabel.textContent = "Total Bids:";
      const bidTotalValues = document.createElement("span");
      bidTotalValues.className = `bid-total-values ${validSum ? "valid" : "invalid"}`;
      bidTotalValues.textContent = `${sum} / ${round.number}`;
      bidTotalValues.setAttribute("aria-label", `${sum} total bids; ${round.number} total bids are not allowed`);
      bidTotal.append(bidTotalLabel, bidTotalValues);
      summary.append(bidTotal);

      if (specialErrors.length > 0) {
        summary.append(createStatusCard("error", "Check Special Cards", specialErrors.join(" ")));
      }

      const confirm = createButton("Confirm Bids", "button-primary full-width bid-confirm-button", () =>
        confirmBids(round.number)
      );
      confirm.disabled = !validSum || specialErrors.length > 0;
      panel.append(list, summary, confirm);
      elements["game-content"].replaceChildren(panel);
    }

    function updateBid(roundNumber, playerId, nextValue) {
      const state = getState();
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
      const state = getState();
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

    function setRoundPhase(phase) {
      const state = getState();
      const round = getCurrentRound();
      if (!round) return;

      if (phase === "bids" && round.specialCards.witch.active && !round.specialCards.witch.secondEffect) {
        showToast("Choose the Witch's second special card first or remove the Witch.");
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

    function renderTricks(round) {
      const state = getState();
      const panel = createPanel("Tricks");
      panel.classList.add("tricks-panel");
      panel.setAttribute("aria-label", "Enter Tricks");
      const list = document.createElement("div");
      list.className = "entry-list";
      const maximumTricks = Logic.getExpectedTrickCount(round);

      const order = Logic.getPlayersFromStartingPlayer(state.players, round.startingPlayerId);
      order.forEach((player) => {
        const result = round.playerResults[player.id];
        const predictionIsCorrect = result.tricks === result.currentBid;
        list.append(
          createValueEntry({
            name: getPlayerDisplayNameById(player.id),
            value: result.tricks,
            min: 0,
            max: round.number,
            colorIndex: getPlayerColorIndex(player.id),
            onChange: (next) => updateTricks(round.number, player.id, next),
            quickAction: {
              label: `Bid ${result.currentBid}`,
              onClick: () => updateTricks(round.number, player.id, result.currentBid),
              disabled: predictionIsCorrect || result.currentBid > maximumTricks,
              completed: predictionIsCorrect,
              title:
                result.currentBid > maximumTricks
                  ? "This bid cannot be reached with the available tricks."
                  : "Set tricks to the current bid"
            }
          })
        );
      });

      const validation = Logic.validateTrickSum(round);
      const trickTotal = document.createElement("div");
      trickTotal.className = "status-card trick-total-card trick-status";
      const trickTotalLabel = document.createElement("strong");
      trickTotalLabel.textContent = "Total Tricks:";
      const trickTotalValues = document.createElement("span");
      trickTotalValues.className = `trick-total-values ${validation.valid ? "valid" : "invalid"}`;
      trickTotalValues.textContent = `${validation.actual} / ${validation.expected}`;
      trickTotalValues.setAttribute(
        "aria-label",
        `${validation.actual} total tricks; ${validation.expected} tricks must be assigned`
      );
      trickTotal.append(trickTotalLabel, trickTotalValues);

      const actions = document.createElement("div");
      actions.className = "round-actions tricks-actions";
      const backToSpecialsButton = createButton("<", "button-secondary special-back-button", () =>
        setRoundPhase("play")
      );
      backToSpecialsButton.setAttribute("aria-label", "Back to Special Cards");
      backToSpecialsButton.title = "Back to Special Cards";
      actions.append(
        backToSpecialsButton,
        createButton("Complete Round", "button-primary", completeRound, !validation.valid)
      );

      panel.append(list, trickTotal, actions);
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
      const state = getState();
      let round = getCurrentRound();
      if (!round) return;

      const specialErrors = Logic.getSpecialCardErrors(round, state.players);
      const tricks = Logic.validateTrickSum(round);
      if (specialErrors.length > 0) {
        showToast(specialErrors[0]);
        return;
      }
      if (!tricks.valid) {
        showToast("The trick total is not correct yet.");
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

    function openEditRoundDialog() {
      openDialog(elements["edit-round-dialog"]);
    }

    function beginRoundEdit(phase) {
      const state = getState();
      closeDialog(elements["edit-round-dialog"]);
      const round = getCurrentRound();
      if (!round) return;

      // Reopening a round invalidates its completion metadata and derived points before editing.
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
      const state = getState();
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

    return Object.freeze({
      bindEvents,
      renderBids,
      renderTricks,
      setRoundPhase,
      openEditRoundDialog,
      goToNextRound
    });
  }

  root.WizardRoundController = Object.freeze({ createRoundController, getRequiredElements });
})(window);
