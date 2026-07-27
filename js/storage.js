(function attachStorage(root) {
  "use strict";

  const STORAGE_KEY = "wizard-punkte-app:game-state:v1";
  const HISTORY_KEY = "wizard-punkte-app:game-history:v1";
  const errors = {
    storageError: "",
    gameError: "",
    historyError: ""
  };

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
  function saveGame(state) {
    if (!isStorageAvailable()) return false;

    try {
      const payload = {
        ...state,
        version: "1.0",
        schemaVersion: Math.max(Number(state?.schemaVersion) || 0, 4),
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      clearError("gameError");
      return true;
    } catch (error) {
      setError("gameError", "Der Spielstand konnte nicht lokal gespeichert werden.", error);
      return false;
    }
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
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      clearError("historyError");
      return true;
    } catch (error) {
      setError("historyError", "Die abgeschlossene Partie konnte nicht im Archiv gespeichert werden.", error);
      return false;
    }
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
    hasGameHistory,
    getLastError,
    getStorageErrors,
    clearLastError
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
