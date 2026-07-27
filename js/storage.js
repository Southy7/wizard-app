(function attachStorage(root) {
  "use strict";

  const STORAGE_KEY = "wizard-punkte-app:game-state:v1";
  const HISTORY_KEY = "wizard-punkte-app:game-history:v1";
  const HISTORY_SOFT_LIMIT_COUNT = 100;
  const HISTORY_SOFT_LIMIT_BYTES = 3_000_000;
  const errors = {
    storageError: "",
    gameError: "",
    historyError: ""
  };
  let lastGameSaveConflict = false;

  // Getrennte Fehlerkanäle verhindern, dass eine erfolgreiche Operation fremde Fehler löscht.
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
      setError("storageError", "Der Browser stellt keinen nutzbaren lokalen Speicher bereit.", error);
      return false;
    }
  }

  // Alle Speicherzugriffe bleiben in diesem Modul gekapselt.
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
          "Der Spielstand wurde in einem anderen Tab geändert oder gelöscht. Diese Seite wurde nicht gespeichert; lade sie neu, bevor du weiterarbeitest."
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
          `Der aktuelle Spielzustand ist inkonsistent: ${validationErrors[0]}`
        );
        return false;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if (state && typeof state === "object") state.updatedAt = payload.updatedAt;
      clearError("gameError");
      return true;
    } catch (error) {
      setError("gameError", "Der Spielstand konnte nicht lokal gespeichert werden.", error);
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
      return ["Die Spielstandvalidierung ist nicht verfügbar."];
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
        throw new Error("Unbekanntes oder beschädigtes Speicherformat.");
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
        "Der gespeicherte Spielstand ist beschädigt oder nicht lesbar. Eine exportierte Sicherung kann weiterhin importiert werden.",
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
      setError("gameError", "Der gespeicherte Spielstand konnte nicht gelöscht werden.", error);
      return false;
    }
  }

  function hasStoredData() {
    if (!isStorageAvailable()) return false;
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch (error) {
      setError("gameError", "Der lokale Speicher konnte nicht geprüft werden.", error);
      return false;
    }
  }

  function hasSavedGame() {
    return loadGame() !== null;
  }

  function loadGameHistory() {
    if (!isStorageAvailable()) return [];

    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) {
        clearError("historyError");
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("Unbekanntes Archivformat.");
      }

      if (parsed.some((game) => !isCompletedGameConsistent(game))) {
        throw new Error("Das Archiv enthält eine unvollständige oder inkonsistente Partie.");
      }

      clearError("historyError");
      return parsed;
    } catch (error) {
      setError("historyError", "Das gespeicherte Partienarchiv ist beschädigt oder nicht lesbar.", error);
      return [];
    }
  }

  function saveCompletedGame(state) {
    if (!isCompletedGameConsistent(state)) return false;

    if (!isStorageAvailable()) return false;

    try {
      const history = loadGameHistory();
      if (errors.historyError) return false;

      const now = new Date().toISOString();
      const gameId = typeof state.gameId === "string" && state.gameId
        ? state.gameId
        : `game-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const existingIndex = history.findIndex((game) => game.gameId === gameId);
      const archivedAt = existingIndex >= 0 ? history[existingIndex].archivedAt : now;
      const archivedGame = {
        ...JSON.parse(JSON.stringify(state)),
        gameId,
        archivedAt,
        updatedAt: now
      };

      if (existingIndex >= 0) history[existingIndex] = archivedGame;
      else history.push(archivedGame);

      history.sort((a, b) => String(b.archivedAt ?? "").localeCompare(String(a.archivedAt ?? "")));
      return writeGameHistory(history);
    } catch (error) {
      setHistoryWriteError(error);
      return false;
    }
  }

  function deleteCompletedGame(gameId) {
    if (typeof gameId !== "string" || !gameId || !isStorageAvailable()) return false;

    const history = loadGameHistory();
    if (errors.historyError) return false;

    const nextHistory = history.filter((game) => game.gameId !== gameId);
    if (nextHistory.length === history.length) return false;
    return writeGameHistory(nextHistory, "Die Partie konnte nicht aus der History gelöscht werden.");
  }

  function clearGameHistory() {
    if (!isStorageAvailable()) return false;

    try {
      localStorage.removeItem(HISTORY_KEY);
      clearError("historyError");
      return true;
    } catch (error) {
      setHistoryWriteError(error, "Die History konnte nicht gelöscht werden.");
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
    if (!isStorageAvailable()) {
      return { success: false, added: 0, updated: 0, skipped: 0 };
    }

    const history = loadGameHistory();
    if (errors.historyError) {
      return { success: false, added: 0, updated: 0, skipped: 0 };
    }

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

    const nextHistory = [...merged.values()]
      .sort((a, b) => String(b.archivedAt ?? b.updatedAt ?? "")
        .localeCompare(String(a.archivedAt ?? a.updatedAt ?? "")));
    const success = writeGameHistory(nextHistory, "Das importierte Archiv konnte nicht lokal gespeichert werden.");
    return { success, added: success ? added : 0, updated: success ? updated : 0, skipped: success ? skipped : 0 };
  }

  function isNewerGame(candidate, existing) {
    const candidateTime = Date.parse(candidate.updatedAt ?? candidate.archivedAt);
    const existingTime = Date.parse(existing.updatedAt ?? existing.archivedAt);
    if (Number.isNaN(existingTime)) return !Number.isNaN(candidateTime);
    return !Number.isNaN(candidateTime) && candidateTime > existingTime;
  }

  function writeGameHistory(history, fallbackMessage = "Die abgeschlossene Partie konnte nicht im Archiv gespeichert werden.") {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      clearError("historyError");
      return true;
    } catch (error) {
      setHistoryWriteError(error, fallbackMessage);
      return false;
    }
  }

  function setHistoryWriteError(error, fallbackMessage = "Die abgeschlossene Partie konnte nicht im Archiv gespeichert werden.") {
    const message = isQuotaExceededError(error)
      ? "Der lokale Speicher ist voll. Die History konnte nicht gespeichert werden. Exportiere oder lösche ältere Partien."
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
    // localStorage speichert Zeichenketten üblicherweise als UTF-16. Der Wert ist
    // daher eine bewusst vorsichtige Näherung an das belegte Browserkontingent.
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
    loadGameHistory,
    saveCompletedGame,
    deleteCompletedGame,
    clearGameHistory,
    mergeGameHistory,
    getHistoryStorageStatus,
    hasGameHistory,
    getLastError,
    wasLastGameSaveConflict,
    getStorageErrors,
    clearLastError
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
