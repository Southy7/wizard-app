(function attachActiveGameStorage(root, factory) {
  const isCommonJs = typeof module === "object" && module.exports;
  const errors = isCommonJs ? require("./storage-errors.js") : root.WizardStorageErrors;
  const logic = isCommonJs ? require("./game-logic.js") : root.WizardGameLogic;
  const api = factory(root, errors, logic);

  if (isCommonJs) {
    module.exports = api;
  }

  root.WizardActiveGameStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createActiveGameStorage(root, Errors, Logic) {
  "use strict";

  const STORAGE_KEY = "wizard-scoreboard:game-state:v1";
  let lastGameSaveConflict = false;

  function isStorageAvailable() {
    try {
      root.localStorage.getItem(STORAGE_KEY);
      Errors.clearError("storageError");
      return true;
    } catch (error) {
      Errors.setError("storageError", "The browser does not provide usable local storage.", error);
      return false;
    }
  }

  function saveGame(state, options = {}) {
    lastGameSaveConflict = false;

    try {
      const rawStoredState = root.localStorage.getItem(STORAGE_KEY);
      const storedState = rawStoredState ? safelyParseStoredGame(rawStoredState) : null;
      const hasExpectedUpdatedAt = Object.prototype.hasOwnProperty.call(options, "expectedUpdatedAt");
      const expectedUpdatedAt = hasExpectedUpdatedAt ? options.expectedUpdatedAt : (state?.updatedAt ?? null);
      const storedUpdatedAt = storedState?.updatedAt ?? null;
      const expectedGameId = Object.prototype.hasOwnProperty.call(options, "expectedGameId")
        ? options.expectedGameId
        : (state?.gameId ?? null);
      const storedGameId = storedState?.gameId ?? null;
      const storedValueIsDamaged = rawStoredState !== null && !isValidStoredGame(storedState);
      const implicitInitialWrite = rawStoredState === null && !hasExpectedUpdatedAt;
      const storedIdentityChanged = rawStoredState !== null && storedGameId !== expectedGameId;

      // The stored identity and timestamp form a compare-and-set baseline for rejecting stale tabs.
      if (
        storedValueIsDamaged ||
        implicitInitialWrite ||
        storedIdentityChanged ||
        storedUpdatedAt !== expectedUpdatedAt
      ) {
        lastGameSaveConflict = true;
        Errors.setError(
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
        Errors.setError("gameError", `The current game state is inconsistent: ${validationErrors[0]}`);
        return false;
      }

      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if (state && typeof state === "object") state.updatedAt = payload.updatedAt;
      Errors.clearError("gameError");
      return true;
    } catch (error) {
      const message = Errors.isQuotaExceededError(error)
        ? "Local storage is full. The game could not be saved. Export it or delete stored data."
        : "The game could not be saved locally.";
      Errors.setError("gameError", message, error);
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
    const validatePersistableGame = Logic?.validatePersistableGameState;
    if (typeof validatePersistableGame !== "function") {
      return ["Game-state validation is not available."];
    }
    return validatePersistableGame(candidate);
  }

  function createNextUpdatedAt(previousUpdatedAt) {
    // Keep revisions monotonic when writes share a millisecond or the system clock moves backward.
    const previousTime = Date.parse(previousUpdatedAt);
    const nextTime = Number.isNaN(previousTime) ? Date.now() : Math.max(Date.now(), previousTime + 1);
    return new Date(nextTime).toISOString();
  }

  function loadGame() {
    try {
      const raw = root.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        Errors.clearError("gameError");
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

      Errors.clearError("gameError");
      return parsed;
    } catch (error) {
      Errors.setError(
        "gameError",
        "The saved game is corrupted or unreadable. An exported backup can still be imported.",
        error
      );
      return null;
    }
  }

  function deleteGame() {
    try {
      root.localStorage.removeItem(STORAGE_KEY);
      Errors.clearError("gameError");
      return true;
    } catch (error) {
      Errors.setError("gameError", "The saved game could not be deleted.", error);
      return false;
    }
  }

  function hasStoredData() {
    try {
      return root.localStorage.getItem(STORAGE_KEY) !== null;
    } catch (error) {
      Errors.setError("gameError", "Local storage could not be checked.", error);
      return false;
    }
  }

  function wasLastGameSaveConflict() {
    return lastGameSaveConflict;
  }

  return Object.freeze({
    STORAGE_KEY,
    isStorageAvailable,
    saveGame,
    loadGame,
    deleteGame,
    hasStoredData,
    wasLastGameSaveConflict
  });
});
