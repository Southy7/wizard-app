(function attachStorage(root) {
  "use strict";

  const STORAGE_KEY = "wizard-scoreboard:game-state:v1";
  const HISTORY_KEY = "wizard-scoreboard:game-history:v1";
  const HISTORY_STORAGE_FORMAT = "wizard-scoreboard-history-storage";
  const HISTORY_STORAGE_VERSION = 1;
  const HISTORY_WRITE_ATTEMPTS = 3;
  const HISTORY_SOFT_LIMIT_COUNT = 100;
  const HISTORY_SOFT_LIMIT_BYTES = 3_000_000;
  const errors = {
    storageError: "",
    gameError: "",
    historyError: ""
  };
  let lastGameSaveConflict = false;

  // Separate error channels prevent a successful operation from clearing unrelated errors.
  function setError(scope, message, error) {
    errors[scope] = message;
    if (error) console.error(message, error);
  }

  function clearError(scope) {
    errors[scope] = "";
  }

  function clearLastError(scope) {
    if (Object.prototype.hasOwnProperty.call(errors, scope)) {
      clearError(scope);
      return;
    }

    Object.keys(errors).forEach(clearError);
  }

  function getStorageErrors() {
    return { ...errors };
  }

  function getLastError() {
    return [...new Set(Object.values(errors).filter(Boolean))].join(" ");
  }

  function wasLastGameSaveConflict() {
    return lastGameSaveConflict;
  }

  function isStorageAvailable() {
    try {
      const testKey = "__wizard_storage_test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      clearError("storageError");
      return true;
    } catch (error) {
      setError("storageError", "The browser does not provide usable local storage.", error);
      return false;
    }
  }

  // All storage access is encapsulated in this module.
  function saveGame(state, options = {}) {
    lastGameSaveConflict = false;
    if (!isStorageAvailable()) return false;

    try {
      const rawStoredState = localStorage.getItem(STORAGE_KEY);
      const storedState = rawStoredState ? safelyParseStoredGame(rawStoredState) : null;
      const hasExpectedUpdatedAt = Object.prototype.hasOwnProperty.call(options, "expectedUpdatedAt");
      const expectedUpdatedAt = hasExpectedUpdatedAt
        ? options.expectedUpdatedAt
        : state?.updatedAt ?? null;
      const storedUpdatedAt = storedState?.updatedAt ?? null;
      const expectedGameId = Object.prototype.hasOwnProperty.call(options, "expectedGameId")
        ? options.expectedGameId
        : state?.gameId ?? null;
      const storedGameId = storedState?.gameId ?? null;
      const storedValueIsDamaged = rawStoredState !== null && !isValidStoredGame(storedState);
      const implicitInitialWrite = rawStoredState === null && !hasExpectedUpdatedAt;
      const storedIdentityChanged = rawStoredState !== null && storedGameId !== expectedGameId;

      if (storedValueIsDamaged
        || implicitInitialWrite
        || storedIdentityChanged
        || storedUpdatedAt !== expectedUpdatedAt) {
        lastGameSaveConflict = true;
        setError(
          "gameError",
          "The game was changed or deleted in another tab. This page was not saved; reload it before continuing."
        );
        return false;
      }

      const payload = {
        ...state,
        updatedAt: createNextUpdatedAt(storedState?.updatedAt)
      };
      const validationErrors = getPersistableGameValidationErrors(payload);
      if (validationErrors.length > 0) {
        setError(
          "gameError",
          `The current game state is inconsistent: ${validationErrors[0]}`
        );
        return false;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if (state && typeof state === "object") state.updatedAt = payload.updatedAt;
      clearError("gameError");
      return true;
    } catch (error) {
      setError("gameError", "The game could not be saved locally.", error);
      return false;
    }
  }

  function safelyParseStoredGame(raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function isValidStoredGame(candidate) {
    return Boolean(candidate) && getPersistableGameValidationErrors(candidate).length === 0;
  }

  function getPersistableGameValidationErrors(candidate) {
    const validatePersistableGame = root.WizardGameLogic?.validatePersistableGameState;
    if (typeof validatePersistableGame !== "function") {
      return ["Game-state validation is not available."];
    }
    return validatePersistableGame(candidate);
  }

  function createNextUpdatedAt(previousUpdatedAt) {
    const previousTime = Date.parse(previousUpdatedAt);
    const nextTime = Number.isNaN(previousTime)
      ? Date.now()
      : Math.max(Date.now(), previousTime + 1);
    return new Date(nextTime).toISOString();
  }

  function loadGame() {
    if (!isStorageAvailable()) return null;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        clearError("gameError");
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== "1.0" || !Array.isArray(parsed.players)) {
        throw new Error("Unknown or corrupted storage format.");
      }

      const validationErrors = getPersistableGameValidationErrors(parsed);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      clearError("gameError");
      return parsed;
    } catch (error) {
      setError(
        "gameError",
        "The saved game is corrupted or unreadable. An exported backup can still be imported.",
        error
      );
      return null;
    }
  }

  function deleteGame() {
    if (!isStorageAvailable()) return false;

    try {
      localStorage.removeItem(STORAGE_KEY);
      clearError("gameError");
      return true;
    } catch (error) {
      setError("gameError", "The saved game could not be deleted.", error);
      return false;
    }
  }

  function hasStoredData() {
    if (!isStorageAvailable()) return false;
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch (error) {
      setError("gameError", "Local storage could not be checked.", error);
      return false;
    }
  }

  function hasSavedGame() {
    return loadGame() !== null;
  }

  function hasStoredHistoryData() {
    if (!isStorageAvailable()) return false;

    try {
      return localStorage.getItem(HISTORY_KEY) !== null;
    } catch (error) {
      setError("historyError", "The saved history could not be accessed.", error);
      return false;
    }
  }

  function getRawGameHistoryData() {
    if (!isStorageAvailable()) return null;

    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw === null) {
        setError("historyError", "There is no saved history data to export.");
        return null;
      }
      return raw;
    } catch (error) {
      setError("historyError", "The damaged history data could not be exported.", error);
      return null;
    }
  }

  function loadGameHistory() {
    return readGameHistorySnapshot()?.games ?? [];
  }

  function readGameHistorySnapshot() {
    if (!isStorageAvailable()) return null;

    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) {
        clearError("historyError");
        return { raw: null, revision: null, games: [] };
      }

      const parsed = JSON.parse(raw);
      const isLegacyArray = Array.isArray(parsed);
      const validEnvelope = parsed
        && typeof parsed === "object"
        && !Array.isArray(parsed)
        && parsed.format === HISTORY_STORAGE_FORMAT
        && parsed.version === HISTORY_STORAGE_VERSION
        && typeof parsed.revision === "string"
        && parsed.revision
        && typeof parsed.updatedAt === "string"
        && !Number.isNaN(Date.parse(parsed.updatedAt))
        && Array.isArray(parsed.games);
      if (!isLegacyArray && !validEnvelope) {
        throw new Error("Unknown archive format.");
      }

      const storedGames = isLegacyArray ? parsed : parsed.games;
      const restoredHistory = storedGames.map(restoreStoredHistoryEntry);
      if (restoredHistory.some((game) => !isCompletedGameConsistent(game))) {
        throw new Error("The archive contains an incomplete or inconsistent game.");
      }

      clearError("historyError");
      return {
        raw,
        revision: isLegacyArray ? null : parsed.revision,
        games: restoredHistory
      };
    } catch (error) {
      setError("historyError", "The saved game archive is corrupted or unreadable.", error);
      return null;
    }
  }

  function restoreStoredHistoryEntry(candidate) {
    const Logic = root.WizardGameLogic;
    if (!candidate
      || typeof candidate !== "object"
      || !Array.isArray(candidate.players)
      || !Array.isArray(candidate.rounds)
      || typeof Logic?.createRound !== "function") {
      return candidate;
    }

    const restored = JSON.parse(JSON.stringify(candidate));
    for (const round of restored.rounds) {
      if (!round || typeof round !== "object" || !Number.isInteger(round.number)) continue;

      const defaults = Logic.createRound(restored.players, restored.firstDealerId, round.number);
      if (round.dealerId == null) round.dealerId = defaults.dealerId;
      if (round.startingPlayerId == null) round.startingPlayerId = defaults.startingPlayerId;

      if (round.specialCards === undefined) {
        round.specialCards = defaults.specialCards;
        continue;
      }
      if (!round.specialCards
        || typeof round.specialCards !== "object"
        || Array.isArray(round.specialCards)) {
        continue;
      }

      for (const [cardName, defaultCard] of Object.entries(defaults.specialCards)) {
        if (round.specialCards[cardName] === undefined) {
          round.specialCards[cardName] = defaultCard;
          continue;
        }

        const storedCard = round.specialCards[cardName];
        if (!storedCard || typeof storedCard !== "object" || Array.isArray(storedCard)) continue;
        for (const [field, defaultValue] of Object.entries(defaultCard)) {
          if (storedCard[field] === undefined) storedCard[field] = defaultValue;
        }
      }
    }

    return restored;
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
    if (typeof gameId !== "string" || !gameId || !isStorageAvailable()) return false;

    return updateGameHistory((history) => {
      const nextHistory = history.filter((game) => game.gameId !== gameId);
      return nextHistory.length === history.length ? null : { games: nextHistory };
    }, "The game could not be deleted from history.").success;
  }

  function clearGameHistory() {
    if (!isStorageAvailable()) return false;

    try {
      for (let attempt = 0; attempt < HISTORY_WRITE_ATTEMPTS; attempt += 1) {
        const snapshot = readGameHistorySnapshot();
        if (!snapshot) return false;
        if (localStorage.getItem(HISTORY_KEY) !== snapshot.raw) continue;

        localStorage.removeItem(HISTORY_KEY);
        if (localStorage.getItem(HISTORY_KEY) === null) {
          clearError("historyError");
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
    if (typeof expectedRaw !== "string" || !isStorageAvailable()) return false;

    try {
      if (localStorage.getItem(HISTORY_KEY) !== expectedRaw) {
        setHistoryConflictError();
        return false;
      }

      localStorage.removeItem(HISTORY_KEY);
      if (localStorage.getItem(HISTORY_KEY) !== null) {
        setHistoryConflictError();
        return false;
      }

      clearError("historyError");
      return true;
    } catch (error) {
      setHistoryWriteError(error, "The damaged history could not be reset.");
      return false;
    }
  }

  function mergeGameHistory(importedGames) {
    const importedIds = Array.isArray(importedGames) ? importedGames.map((game) => game?.gameId) : [];
    if (!Array.isArray(importedGames)
      || new Set(importedIds).size !== importedIds.length
      || importedGames.some((game) => !isCompletedGameConsistent(game))) {
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
        games: [...merged.values()]
          .sort((a, b) => String(b.archivedAt ?? b.updatedAt ?? "")
            .localeCompare(String(a.archivedAt ?? a.updatedAt ?? ""))),
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

  function updateGameHistory(
    transform,
    fallbackMessage = "The completed game could not be saved to the archive."
  ) {
    if (!isStorageAvailable()) return { success: false, value: null };

    try {
      for (let attempt = 0; attempt < HISTORY_WRITE_ATTEMPTS; attempt += 1) {
        const snapshot = readGameHistorySnapshot();
        if (!snapshot) return { success: false, value: null };

        const mutation = transform(JSON.parse(JSON.stringify(snapshot.games)));
        if (!mutation) return { success: false, value: null };
        if (!Array.isArray(mutation.games)
          || mutation.games.some((game) => !isCompletedGameConsistent(game))) {
          setError("historyError", "The updated game archive would be inconsistent.");
          return { success: false, value: null };
        }

        if (localStorage.getItem(HISTORY_KEY) !== snapshot.raw) continue;

        const payload = {
          format: HISTORY_STORAGE_FORMAT,
          version: HISTORY_STORAGE_VERSION,
          revision: createHistoryRevision(),
          updatedAt: new Date().toISOString(),
          games: mutation.games
        };
        const serialized = JSON.stringify(payload);
        localStorage.setItem(HISTORY_KEY, serialized);
        if (localStorage.getItem(HISTORY_KEY) !== serialized) continue;

        clearError("historyError");
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
    setError(
      "historyError",
      "History changed in another tab while it was being saved. Please try the action again."
    );
  }

  function setHistoryWriteError(error, fallbackMessage = "The completed game could not be saved to the archive.") {
    const message = isQuotaExceededError(error)
      ? "Local storage is full. History could not be saved. Export or delete older games."
      : fallbackMessage;
    setError("historyError", message, error);
  }

  function isQuotaExceededError(error) {
    return error?.name === "QuotaExceededError"
      || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
      || error?.code === 22
      || error?.code === 1014;
  }

  function getHistoryStorageStatus(history = loadGameHistory()) {
    const serialized = JSON.stringify(Array.isArray(history) ? history : []);
    // localStorage usually stores strings as UTF-16. This value is therefore a
    // deliberately conservative estimate of the browser quota in use.
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
    if (!state
      || state.status !== "completed"
      || !Number.isInteger(state.totalRounds)
      || state.totalRounds < 1
      || state.currentRound !== state.totalRounds
      || !Array.isArray(state.players)
      || !Array.isArray(state.rounds)
      || state.rounds.length !== state.totalRounds) {
      return false;
    }

    const roundNumbers = new Set();
    for (const round of state.rounds) {
      if (!Number.isInteger(round?.number)
        || round.number < 1
        || round.number > state.totalRounds
        || roundNumbers.has(round.number)
        || round.completed !== true) {
        return false;
      }
      roundNumbers.add(round.number);
    }

    return roundNumbers.size === state.totalRounds;
  }

  function isCompletedGameConsistent(state) {
    if (!hasCompleteRoundSequence(state)
      || state.version !== "1.0"
      || typeof state.gameId !== "string"
      || !state.gameId) {
      return false;
    }

    const validateGameState = root.WizardGameLogic?.validateImportedGameState;
    return typeof validateGameState !== "function" || validateGameState(state).length === 0;
  }

  function hasGameHistory() {
    return loadGameHistory().length > 0;
  }

  root.WizardStorage = Object.freeze({
    STORAGE_KEY,
    HISTORY_KEY,
    isStorageAvailable,
    saveGame,
    loadGame,
    deleteGame,
    hasStoredData,
    hasSavedGame,
    hasStoredHistoryData,
    getRawGameHistoryData,
    loadGameHistory,
    saveCompletedGame,
    deleteCompletedGame,
    clearGameHistory,
    resetDamagedGameHistory,
    mergeGameHistory,
    getHistoryStorageStatus,
    hasGameHistory,
    getLastError,
    wasLastGameSaveConflict,
    getStorageErrors,
    clearLastError
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
