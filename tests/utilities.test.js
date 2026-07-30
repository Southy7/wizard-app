"use strict";

const assert = require("node:assert/strict");
const Constants = require("../js/constants.js");
const Formatters = require("../js/formatters.js");

assert.ok(Object.isFrozen(Constants));
assert.ok(Object.isFrozen(Constants.EXPORT_FORMAT));
assert.ok(Object.isFrozen(Constants.GAME_STATUS));
assert.ok(Object.isFrozen(Constants.ROUND_PHASE));
assert.deepEqual(Constants.EXPORT_FORMAT, {
  GAME: "wizard-scoreboard-game",
  HISTORY: "wizard-scoreboard-history"
});
assert.deepEqual(Constants.GAME_STATUS, {
  SETUP: "setup",
  RUNNING: "running",
  COMPLETED: "completed"
});
assert.deepEqual(Constants.ROUND_PHASE, {
  BIDS: "bids",
  SPECIAL_CARDS: "play",
  TRICKS: "tricks",
  RESULT: "result"
});

assert.equal(Formatters.formatNumber(12), "12");
assert.equal(Formatters.formatNumber(-12), "\u221212");
assert.equal(Formatters.formatNumber(0), "0");
assert.equal(Formatters.formatSigned(12), "+12");
assert.equal(Formatters.formatSigned(-12), "\u221212");
assert.equal(Formatters.formatSigned(0), "0");
assert.equal(Formatters.formatSigned("invalid"), "0");
assert.equal(Formatters.formatPlayerName({ name: "  Anna  " }, 0), "Anna");
assert.equal(Formatters.formatPlayerName({ name: "  " }, 2), "Player 3");

const gameState = {
  players: [
    { id: "anna", name: "Anna" },
    { id: "blank", name: "" }
  ]
};
assert.equal(Formatters.getPlayerDisplayName(gameState, "anna"), "Anna");
assert.equal(Formatters.getPlayerDisplayName(gameState, "blank"), "Player 2");
assert.equal(Formatters.getPlayerDisplayName(gameState, "missing"), "\u2013");
assert.equal(Formatters.getPlayerDisplayName(gameState, "missing", 3), "Player 4");

const originalGlobals = {
  Blob: global.Blob,
  URL: global.URL,
  document: global.document,
  setTimeout: global.setTimeout
};
let createdBlob = null;
let appendedLink = null;
let clicked = false;
let removed = false;
let revokedUrl = null;

try {
  global.Blob = class MockBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
      createdBlob = this;
    }
  };
  global.URL = {
    createObjectURL(blob) {
      assert.equal(blob, createdBlob);
      return "blob:test";
    },
    revokeObjectURL(url) {
      revokedUrl = url;
    }
  };
  global.document = {
    createElement(tagName) {
      assert.equal(tagName, "a");
      return {
        click() {
          clicked = true;
        },
        remove() {
          removed = true;
        }
      };
    },
    body: {
      append(link) {
        appendedLink = link;
      }
    }
  };
  global.setTimeout = (callback) => {
    callback();
    return 1;
  };

  const FileUtils = require("../js/file-utils.js");
  FileUtils.downloadJson({ result: 42 }, "wizard.json");

  assert.equal(createdBlob.parts[0], '{\n  "result": 42\n}');
  assert.equal(createdBlob.type, "application/json");
  assert.equal(appendedLink.download, "wizard.json");
  assert.equal(appendedLink.href, "blob:test");
  assert.equal(clicked, true);
  assert.equal(removed, true);
  assert.equal(revokedUrl, "blob:test");

  const timestamp = new Date(2026, 6, 21, 9, 5, 7);
  assert.equal(FileUtils.formatFileTimestamp(timestamp), "2026-07-21-090507");

  const stateForExport = {
    gameId: "game-1",
    players: [{ id: "anna", name: "Anna" }]
  };
  const gameExport = FileUtils.createGameExport(stateForExport, { exportedAt: timestamp });
  assert.deepEqual(gameExport, {
    payload: {
      exportFormat: "wizard-scoreboard-game",
      exportVersion: 1,
      exportedAt: timestamp.toISOString(),
      gameState: stateForExport
    },
    filename: "wizard-game-2026-07-21-090507.json"
  });
  assert.notEqual(gameExport.payload.gameState, stateForExport);
  assert.notEqual(gameExport.payload.gameState.players, stateForExport.players);
  stateForExport.players[0].name = "Changed";
  assert.equal(gameExport.payload.gameState.players[0].name, "Anna");

  const recoveryExport = FileUtils.createGameExport(stateForExport, {
    exportedAt: timestamp,
    recoveryReason: "storage-conflict"
  });
  assert.equal(recoveryExport.payload.recoveryReason, "storage-conflict");
  assert.equal(recoveryExport.filename, gameExport.filename);
} finally {
  for (const [name, value] of Object.entries(originalGlobals)) {
    if (value === undefined) delete global[name];
    else global[name] = value;
  }
}

console.log("All utility tests passed.");
