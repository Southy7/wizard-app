(function attachConstants(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardConstants = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createConstants() {
  "use strict";

  const EXPORT_FORMAT = Object.freeze({
    GAME: "wizard-scoreboard-game",
    HISTORY: "wizard-scoreboard-history"
  });

  const GAME_STATUS = Object.freeze({
    SETUP: "setup",
    RUNNING: "running",
    COMPLETED: "completed"
  });

  const ROUND_PHASE = Object.freeze({
    BIDS: "bids",
    SPECIAL_CARDS: "play",
    TRICKS: "tricks",
    RESULT: "result"
  });

  return Object.freeze({
    EXPORT_FORMAT,
    GAME_STATUS,
    ROUND_PHASE
  });
});
