"use strict";

const assert = require("node:assert/strict");

require("../js/import-controller.js");
const ImportController = global.WizardImportController;
const Constants = require("../js/constants.js");

function createHarness(overrides = {}) {
  const listeners = {};
  const toasts = [];
  const importedArchives = [];
  const importedStates = [];
  const savedStates = [];
  let inputClicks = 0;
  let importedMarks = 0;
  let refreshes = 0;
  let archivedGames = 0;
  let strictValidations = 0;
  let persistableValidations = 0;
  let canonicalizations = 0;

  const elements = {
    "btn-import-game": {
      addEventListener(type, handler) {
        listeners[`button:${type}`] = handler;
      }
    },
    "import-file-input": {
      files: [],
      value: "",
      click() {
        inputClicks += 1;
      },
      addEventListener(type, handler) {
        listeners[`input:${type}`] = handler;
      }
    }
  };
  const Storage = {
    loadGame: () => null,
    hasStoredData: () => false,
    deleteGame: () => true,
    saveGame(state, options) {
      savedStates.push({ state, options });
      return true;
    },
    ...overrides.Storage
  };
  const Logic = {
    validateImportedGameState() {
      strictValidations += 1;
      return [];
    },
    validatePersistableGameState() {
      persistableValidations += 1;
      return [];
    },
    createCanonicalGameState(state) {
      canonicalizations += 1;
      const canonicalState = JSON.parse(JSON.stringify(state));
      delete canonicalState.unknownState;
      return canonicalState;
    },
    ...overrides.Logic
  };
  const controller = ImportController.createImportController({
    Constants,
    Storage,
    Logic,
    elements,
    historyController: {
      importArchive(archive) {
        importedArchives.push(archive);
      }
    },
    persistenceController: {
      markStateImported() {
        importedMarks += 1;
      }
    },
    setState(state) {
      importedStates.push(state);
    },
    archiveCompletedGame() {
      archivedGames += 1;
    },
    refreshHomeScreen() {
      refreshes += 1;
    },
    showToast(message) {
      toasts.push(message);
    },
    confirmReplace: () => true
  });
  controller.bindEvents();

  return {
    elements,
    listeners,
    toasts,
    importedArchives,
    importedStates,
    savedStates,
    getCounts: () => ({
      inputClicks,
      importedMarks,
      refreshes,
      archivedGames,
      strictValidations,
      persistableValidations,
      canonicalizations
    })
  };
}

function createFile(payload, size = 1_000) {
  return {
    size,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

(async () => {
  const gameHarness = createHarness();
  gameHarness.listeners["button:click"]();
  assert.equal(gameHarness.getCounts().inputClicks, 1);

  const gameState = {
    gameId: "game-1",
    status: "running",
    updatedAt: null,
    unknownState: true
  };
  const canonicalGameState = {
    gameId: "game-1",
    status: "running",
    updatedAt: null
  };
  gameHarness.elements["import-file-input"].files = [createFile({ exportFormat: "wizard-scoreboard-game", gameState })];
  gameHarness.elements["import-file-input"].value = "wizard-game.json";
  await gameHarness.listeners["input:change"]({
    target: gameHarness.elements["import-file-input"]
  });

  assert.equal(gameHarness.elements["import-file-input"].value, "");
  assert.equal(gameHarness.savedStates.length, 1);
  assert.deepEqual(gameHarness.savedStates[0].options, {
    expectedUpdatedAt: null,
    expectedGameId: null
  });
  assert.deepEqual(gameHarness.importedStates, [canonicalGameState]);
  assert.deepEqual(gameHarness.savedStates[0].state, canonicalGameState);
  assert.deepEqual(gameHarness.getCounts(), {
    inputClicks: 1,
    importedMarks: 1,
    refreshes: 1,
    archivedGames: 0,
    strictValidations: 1,
    persistableValidations: 0,
    canonicalizations: 1
  });
  assert.equal(gameHarness.toasts.at(-1), "Game imported successfully.");

  const historyHarness = createHarness();
  const archive = {
    exportFormat: "wizard-scoreboard-history",
    exportVersion: 1,
    games: []
  };
  historyHarness.elements["import-file-input"].files = [createFile(archive)];
  await historyHarness.listeners["input:change"]({
    target: historyHarness.elements["import-file-input"]
  });
  assert.deepEqual(historyHarness.importedArchives, [archive]);
  assert.equal(historyHarness.savedStates.length, 0);

  const recoveryHarness = createHarness({
    Logic: {
      validateImportedGameState() {
        throw new Error("Strict validation must not handle recovery exports.");
      }
    }
  });
  recoveryHarness.elements["import-file-input"].files = [
    createFile({
      exportFormat: "wizard-scoreboard-game",
      recoveryReason: "unsaved-changes",
      gameState
    })
  ];
  await recoveryHarness.listeners["input:change"]({
    target: recoveryHarness.elements["import-file-input"]
  });
  assert.equal(recoveryHarness.getCounts().persistableValidations, 1);
  assert.equal(recoveryHarness.savedStates.length, 1);

  console.log("All import-controller tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
