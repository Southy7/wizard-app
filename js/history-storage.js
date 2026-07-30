(function attachHistoryStorage(root, factory) {
  const isCommonJs = typeof module === "object" && module.exports;
  const errors = isCommonJs ? require("./storage-errors.js") : root.WizardStorageErrors;
  const logic = isCommonJs ? require("./game-logic.js") : root.WizardGameLogic;
  const api = factory(root, errors, logic);

  if (isCommonJs) {
    module.exports = api;
  }

  root.WizardHistoryStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createHistoryStorage(root, Errors, Logic) {
  "use strict";

  const HISTORY_KEY = "wizard-scoreboard:game-history:v1";
  const HISTORY_STORAGE_FORMAT = "wizard-scoreboard-history-storage";
  const HISTORY_STORAGE_VERSION = 1;
  const HISTORY_WRITE_ATTEMPTS = 3;
  const HISTORY_SOFT_LIMIT_COUNT = 100;
  const HISTORY_SOFT_LIMIT_BYTES = 3_000_000;

  function hasStoredHistoryData() {
    try {
      return root.localStorage.getItem(HISTORY_KEY) !== null;
    } catch (error) {
      Errors.setError("historyError", "The saved history could not be accessed.", error);
      return false;
    }
  }

  function getRawGameHistoryData() {
    try {
      const raw = root.localStorage.getItem(HISTORY_KEY);
      if (raw === null) {
        Errors.setError("historyError", "There is no saved history data to export.");
        return null;
      }
      return raw;
    } catch (error) {
      Errors.setError("historyError", "The damaged history data could not be exported.", error);
      return null;
    }
  }

  function loadGameHistory() {
    return readGameHistorySnapshot()?.games ?? [];
  }

  function readGameHistorySnapshot() {
    try {
      const raw = root.localStorage.getItem(HISTORY_KEY);
      if (!raw) {
        Errors.clearError("historyError");
        return { raw: null, revision: null, games: [] };
      }

      const parsed = JSON.parse(raw);
      const validEnvelope =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.format === HISTORY_STORAGE_FORMAT &&
        parsed.version === HISTORY_STORAGE_VERSION &&
        typeof parsed.revision === "string" &&
        parsed.revision &&
        typeof parsed.updatedAt === "string" &&
        !Number.isNaN(Date.parse(parsed.updatedAt)) &&
        Array.isArray(parsed.games);
      if (!validEnvelope) {
        throw new Error("Unknown archive format.");
      }

      if (parsed.games.some((game) => !isCompletedGameConsistent(game))) {
        throw new Error("The archive contains an incomplete or inconsistent game.");
      }

      Errors.clearError("historyError");
      return {
        raw,
        revision: parsed.revision,
        games: parsed.games
      };
    } catch (error) {
      Errors.setError("historyError", "The saved game archive is corrupted or unreadable.", error);
      return null;
    }
  }

  function saveCompletedGame(state) {
    if (!isCompletedGameConsistent(state)) return false;

    return updateGameHistory((history) => {
      const now = new Date().toISOString();
      const gameId = state.gameId;
      const existingIndex = history.findIndex((game) => game.gameId === gameId);
      const archivedAt = existingIndex >= 0 ? history[existingIndex].archivedAt : now;
      const archivedGame = {
        ...JSON.parse(JSON.stringify(state)),
        archivedAt,
        updatedAt: now
      };

      if (existingIndex >= 0) history[existingIndex] = archivedGame;
      else history.push(archivedGame);

      history.sort((a, b) => String(b.archivedAt ?? "").localeCompare(String(a.archivedAt ?? "")));
      return { games: history };
    }).success;
  }

  function deleteCompletedGame(gameId) {
    if (typeof gameId !== "string" || !gameId) return false;

    return updateGameHistory((history) => {
      const nextHistory = history.filter((game) => game.gameId !== gameId);
      return nextHistory.length === history.length ? null : { games: nextHistory };
    }, "The game could not be deleted from history.").success;
  }

  function clearGameHistory() {
    try {
      for (let attempt = 0; attempt < HISTORY_WRITE_ATTEMPTS; attempt += 1) {
        const snapshot = readGameHistorySnapshot();
        if (!snapshot) return false;
        if (root.localStorage.getItem(HISTORY_KEY) !== snapshot.raw) continue;

        root.localStorage.removeItem(HISTORY_KEY);
        if (root.localStorage.getItem(HISTORY_KEY) === null) {
          Errors.clearError("historyError");
          return true;
        }
      }
      setHistoryConflictError();
      return false;
    } catch (error) {
      setHistoryWriteError(error, "History could not be cleared.");
      return false;
    }
  }

  function resetDamagedGameHistory(expectedRaw) {
    if (typeof expectedRaw !== "string") return false;

    try {
      // Delete only the reviewed payload; another tab may have replaced it in the meantime.
      if (root.localStorage.getItem(HISTORY_KEY) !== expectedRaw) {
        setHistoryConflictError();
        return false;
      }

      root.localStorage.removeItem(HISTORY_KEY);
      if (root.localStorage.getItem(HISTORY_KEY) !== null) {
        setHistoryConflictError();
        return false;
      }

      Errors.clearError("historyError");
      return true;
    } catch (error) {
      setHistoryWriteError(error, "The damaged history could not be reset.");
      return false;
    }
  }

  function mergeGameHistory(importedGames) {
    const importedIds = Array.isArray(importedGames) ? importedGames.map((game) => game?.gameId) : [];
    if (
      !Array.isArray(importedGames) ||
      new Set(importedIds).size !== importedIds.length ||
      importedGames.some((game) => !isCompletedGameConsistent(game))
    ) {
      return { success: false, added: 0, updated: 0, skipped: 0 };
    }
    const mutation = updateGameHistory((history) => {
      const merged = new Map(history.map((game) => [game.gameId, game]));
      let added = 0;
      let updated = 0;
      let skipped = 0;

      for (const importedGame of importedGames) {
        const existing = merged.get(importedGame.gameId);
        const normalized = JSON.parse(JSON.stringify(importedGame));
        if (!existing) {
          merged.set(normalized.gameId, normalized);
          added += 1;
        } else if (isNewerGame(normalized, existing)) {
          normalized.archivedAt = existing.archivedAt ?? normalized.archivedAt;
          merged.set(normalized.gameId, normalized);
          updated += 1;
        } else {
          skipped += 1;
        }
      }

      return {
        games: [...merged.values()].sort((a, b) =>
          String(b.archivedAt ?? b.updatedAt ?? "").localeCompare(String(a.archivedAt ?? a.updatedAt ?? ""))
        ),
        value: { added, updated, skipped }
      };
    }, "The imported archive could not be saved locally.");
    const counts = mutation.value ?? { added: 0, updated: 0, skipped: 0 };
    return { success: mutation.success, ...counts };
  }

  function isNewerGame(candidate, existing) {
    const candidateTime = Date.parse(candidate.updatedAt ?? candidate.archivedAt);
    const existingTime = Date.parse(existing.updatedAt ?? existing.archivedAt);
    if (Number.isNaN(existingTime)) return !Number.isNaN(candidateTime);
    return !Number.isNaN(candidateTime) && candidateTime > existingTime;
  }

  function updateGameHistory(transform, fallbackMessage = "The completed game could not be saved to the archive.") {
    try {
      // localStorage has no transactions, so retry compare-and-set after a concurrent write.
      for (let attempt = 0; attempt < HISTORY_WRITE_ATTEMPTS; attempt += 1) {
        const snapshot = readGameHistorySnapshot();
        if (!snapshot) return { success: false, value: null };

        const mutation = transform(JSON.parse(JSON.stringify(snapshot.games)));
        if (!mutation) return { success: false, value: null };
        if (!Array.isArray(mutation.games) || mutation.games.some((game) => !isCompletedGameConsistent(game))) {
          Errors.setError("historyError", "The updated game archive would be inconsistent.");
          return { success: false, value: null };
        }

        if (root.localStorage.getItem(HISTORY_KEY) !== snapshot.raw) continue;

        const payload = {
          format: HISTORY_STORAGE_FORMAT,
          version: HISTORY_STORAGE_VERSION,
          revision: createHistoryRevision(),
          updatedAt: new Date().toISOString(),
          games: mutation.games
        };
        const serialized = JSON.stringify(payload);
        root.localStorage.setItem(HISTORY_KEY, serialized);
        if (root.localStorage.getItem(HISTORY_KEY) !== serialized) continue;

        Errors.clearError("historyError");
        return { success: true, value: mutation.value ?? null };
      }

      setHistoryConflictError();
      return { success: false, value: null };
    } catch (error) {
      setHistoryWriteError(error, fallbackMessage);
      return { success: false, value: null };
    }
  }

  function createHistoryRevision() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setHistoryConflictError() {
    Errors.setError(
      "historyError",
      "History changed in another tab while it was being saved. Please try the action again."
    );
  }

  function setHistoryWriteError(error, fallbackMessage = "The completed game could not be saved to the archive.") {
    const message = Errors.isQuotaExceededError(error)
      ? "Local storage is full. History could not be saved. Export or delete older games."
      : fallbackMessage;
    Errors.setError("historyError", message, error);
  }

  function getHistoryStorageStatus(history = loadGameHistory()) {
    const serialized = JSON.stringify(Array.isArray(history) ? history : []);
    // localStorage commonly stores strings as UTF-16; use a conservative quota estimate.
    const bytes = serialized.length * 2;
    const count = Array.isArray(history) ? history.length : 0;

    return {
      count,
      bytes,
      countLimit: HISTORY_SOFT_LIMIT_COUNT,
      byteLimit: HISTORY_SOFT_LIMIT_BYTES,
      softLimitReached: count >= HISTORY_SOFT_LIMIT_COUNT || bytes >= HISTORY_SOFT_LIMIT_BYTES
    };
  }

  function hasCompleteRoundSequence(state) {
    if (
      !state ||
      state.status !== "completed" ||
      !Number.isInteger(state.totalRounds) ||
      state.totalRounds < 1 ||
      state.currentRound !== state.totalRounds ||
      !Array.isArray(state.players) ||
      !Array.isArray(state.rounds) ||
      state.rounds.length !== state.totalRounds
    ) {
      return false;
    }

    const roundNumbers = new Set();
    for (const round of state.rounds) {
      if (
        !Number.isInteger(round?.number) ||
        round.number < 1 ||
        round.number > state.totalRounds ||
        roundNumbers.has(round.number) ||
        round.completed !== true
      ) {
        return false;
      }
      roundNumbers.add(round.number);
    }

    return roundNumbers.size === state.totalRounds;
  }

  function isCompletedGameConsistent(state) {
    if (
      !hasCompleteRoundSequence(state) ||
      state.version !== "1.0" ||
      typeof state.gameId !== "string" ||
      !state.gameId
    ) {
      return false;
    }

    const validateGameState = Logic?.validateImportedGameState;
    return typeof validateGameState !== "function" || validateGameState(state).length === 0;
  }

  function hasGameHistory() {
    return loadGameHistory().length > 0;
  }

  return Object.freeze({
    HISTORY_KEY,
    hasStoredHistoryData,
    getRawGameHistoryData,
    loadGameHistory,
    saveCompletedGame,
    deleteCompletedGame,
    clearGameHistory,
    resetDamagedGameHistory,
    mergeGameHistory,
    getHistoryStorageStatus,
    hasGameHistory
  });
});
