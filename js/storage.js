(function attachStorage(root) {
  "use strict";

  const STORAGE_KEY = "wizard-punkte-app:game-state:v1";
  let lastError = "";

  // Speicherfehler werden zentral gehalten, damit die Oberfläche sie anzeigen kann.
  function setError(message, error) {
    lastError = message;
    if (error) console.error(message, error);
  }

  function clearLastError() {
    lastError = "";
  }

  function getLastError() {
    return lastError;
  }

  function isStorageAvailable() {
    try {
      const testKey = "__wizard_storage_test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      setError("Der Browser stellt keinen nutzbaren lokalen Speicher bereit.", error);
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
        schemaVersion: Math.max(Number(state?.schemaVersion) || 0, 3),
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      clearLastError();
      return true;
    } catch (error) {
      setError("Der Spielstand konnte nicht lokal gespeichert werden.", error);
      return false;
    }
  }

  function loadGame() {
    if (!isStorageAvailable()) return null;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        clearLastError();
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== "1.0" || !Array.isArray(parsed.players)) {
        throw new Error("Unbekanntes oder beschädigtes Speicherformat.");
      }

      clearLastError();
      return parsed;
    } catch (error) {
      setError("Der gespeicherte Spielstand ist beschädigt oder nicht lesbar. Eine exportierte Sicherung kann weiterhin importiert werden.", error);
      return null;
    }
  }

  function deleteGame() {
    if (!isStorageAvailable()) return false;

    try {
      localStorage.removeItem(STORAGE_KEY);
      clearLastError();
      return true;
    } catch (error) {
      setError("Der gespeicherte Spielstand konnte nicht gelöscht werden.", error);
      return false;
    }
  }

  function hasStoredData() {
    if (!isStorageAvailable()) return false;
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch (error) {
      setError("Der lokale Speicher konnte nicht geprüft werden.", error);
      return false;
    }
  }

  function hasSavedGame() {
    return loadGame() !== null;
  }

  root.WizardStorage = Object.freeze({
    STORAGE_KEY,
    isStorageAvailable,
    saveGame,
    loadGame,
    deleteGame,
    hasStoredData,
    hasSavedGame,
    getLastError,
    clearLastError
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
