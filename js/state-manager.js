(function attachStateManager(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardStateManager = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createStateManager() {
  "use strict";

  // Zustände werden vor dem Aufruf validiert und anschließend unverändert kopiert.
  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function normalizeSpecialDependencies(round) {
    const cards = round.specialCards;

    if (!cards.cloud.active) {
      Object.assign(cards.cloud, { playerId: null, change: 0 });
      if (cards.witch.secondEffect === "cloud") {
        cards.witch.secondEffect = null;
        Object.assign(cards.secondCloud, { active: false, playerId: null, change: 0 });
      }
    }

    if (!cards.bomb.active && cards.witch.secondEffect === "bomb") {
      cards.witch.secondEffect = null;
      cards.secondBomb.active = false;
    }

    if (!cards.cloud.active && !cards.bomb.active) cards.witch.active = false;

    if (!cards.witch.active) {
      cards.witch.secondEffect = null;
      Object.assign(cards.secondCloud, { active: false, playerId: null, change: 0 });
      cards.secondBomb.active = false;
    }

    if (cards.witch.secondEffect === "cloud" && !cards.secondCloud.active) {
      cards.witch.secondEffect = null;
    }
    if (cards.witch.secondEffect === "bomb" && !cards.secondBomb.active) {
      cards.witch.secondEffect = null;
    }
    if (cards.witch.secondEffect !== "cloud") {
      Object.assign(cards.secondCloud, { active: false, playerId: null, change: 0 });
    }
    if (cards.witch.secondEffect !== "bomb") cards.secondBomb.active = false;
  }

  return Object.freeze({
    cloneState,
    normalizeSpecialDependencies
  });
});
