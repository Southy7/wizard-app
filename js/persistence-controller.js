(function attachPersistenceController(root) {
  "use strict";

  function createPersistenceController({
    Storage,
    elements,
    getState,
    showToast,
    getHistoryCapacityWarning = () => ""
  }) {
    let hasUnsavedChanges = false;
    let storageConflict = false;
    let externalGameWarning = "";
    let externalHistoryWarning = "";

    const conflictAllowedControlIds = new Set([
      "btn-setup-home",
      "btn-summary-back",
      "btn-game-home",
      "btn-finished-home",
      "btn-close-cloud-dialog",
      "btn-close-edit-dialog",
      "btn-confirm-round-one-hint"
    ]);

    function bindEvents() {
      ["click", "input", "change", "submit"].forEach((eventName) => {
        document.addEventListener(eventName, blockInteractionDuringConflict, true);
      });
      elements["btn-export-conflict-state"].addEventListener("click", exportConflictState);
      elements["btn-reload-after-conflict"].addEventListener("click", () => window.location.reload());
      window.addEventListener("storage", handleExternalStorageChange);
    }

    function persist(options) {
      const state = getState();
      if (!state) return false;

      const saved = Storage.saveGame(state, options);
      if (!saved) {
        storageConflict = Storage.wasLastGameSaveConflict?.() === true;
        hasUnsavedChanges = !storageConflict;
        const error = Storage.getStorageErrors?.().gameError
          || "Der Spielstand konnte auf diesem Gerät nicht gespeichert werden. Exportiere den Spielstand, sobald die Speicherung wieder funktioniert.";
        updateWarning(error);
        showToast(error);
      } else {
        hasUnsavedChanges = false;
        storageConflict = false;
        externalGameWarning = "";
        updateWarning();
      }
      refreshConflictMode();
      return saved;
    }

    function canContinueFromMemory() {
      return Boolean(getState() && hasUnsavedChanges && !storageConflict);
    }

    function markStateLoaded() {
      hasUnsavedChanges = false;
      storageConflict = false;
      externalGameWarning = "";
      refreshConflictMode();
      updateWarning();
    }

    function markStateImported() {
      markStateLoaded();
    }

    function clearHistoryWarning() {
      externalHistoryWarning = "";
      updateWarning();
    }

    function updateWarning(message = "") {
      const warning = elements["storage-warning"];
      if (!warning) return;

      const storageAvailable = Storage.isStorageAvailable();
      const storageError = Storage.getLastError?.();
      const externalWarning = [
        externalGameWarning,
        externalHistoryWarning,
        getHistoryCapacityWarning()
      ].filter(Boolean).join(" ");
      const text = message || externalWarning || storageError || (!storageAvailable
        ? "Der Browser stellt keinen dauerhaften lokalen Speicher bereit. Änderungen können beim Schließen verloren gehen."
        : "");

      warning.textContent = text;
      warning.hidden = !text;
    }

    function handleExternalStorageChange(event) {
      if (event.storageArea !== localStorage
        || ![Storage.STORAGE_KEY, Storage.HISTORY_KEY].includes(event.key)) {
        return;
      }

      if (event.key === Storage.STORAGE_KEY) {
        storageConflict = true;
        externalGameWarning = "Der Spielstand wurde in einem anderen Tab geändert. Lade diese Seite neu, bevor du weiterspielst.";
      } else {
        externalHistoryWarning = "Die History wurde in einem anderen Tab geändert. Lade diese Seite neu, um den aktuellen Stand zu sehen.";
      }
      refreshConflictMode();
      updateWarning();
      showToast(event.key === Storage.STORAGE_KEY ? externalGameWarning : externalHistoryWarning);
    }

    function refreshConflictMode() {
      const actions = elements["storage-conflict-actions"];
      if (!actions) return;

      actions.hidden = !storageConflict;
      elements["btn-export-conflict-state"].disabled = !getState();
      document.body.classList.toggle("game-storage-conflict", storageConflict);

      const stateUi = document.querySelectorAll(
        "#screen-setup button, #screen-setup input, #screen-setup select, #screen-setup textarea, "
        + "#screen-setup-summary button, #screen-game button, #screen-game input, "
        + "#screen-game select, #screen-game textarea, #screen-finished button, "
        + "#cloud-dialog button, #edit-round-dialog button"
      );

      stateUi.forEach((control) => {
        if (conflictAllowedControlIds.has(control.id)) return;

        if (storageConflict) {
          if (!control.disabled) {
            control.dataset.conflictDisabled = "true";
            control.disabled = true;
          }
        } else if (control.dataset.conflictDisabled === "true") {
          control.disabled = false;
          delete control.dataset.conflictDisabled;
        }
      });
    }

    function blockInteractionDuringConflict(event) {
      if (!storageConflict) return;

      const control = event.target instanceof Element
        ? event.target.closest("button, input, select, textarea, form")
        : null;
      if (!control || conflictAllowedControlIds.has(control.id)) return;
      if (!control.closest(
        "#screen-setup, #screen-setup-summary, #screen-game, #screen-finished, "
        + "#cloud-dialog, #edit-round-dialog"
      )) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      showToast("Dieser Spielstand ist wegen eines Speicherkonflikts gesperrt. Lade die Seite neu oder exportiere den ungespeicherten Stand.");
    }

    function exportConflictState() {
      const state = getState();
      if (!state || !storageConflict) return;

      const exportedAt = new Date();
      downloadJson({
        exportFormat: "wizard-punkte-app",
        exportVersion: 1,
        exportedAt: exportedAt.toISOString(),
        recoveryReason: "storage-conflict",
        gameState: JSON.parse(JSON.stringify(state))
      }, `wizard-konflikt-${formatFileTimestamp(exportedAt)}.json`);
    }

    function downloadJson(payload, filename) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function formatFileTimestamp(date) {
      const pad = (value) => String(value).padStart(2, "0");
      return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        "-",
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
      ].join("");
    }

    async function requestPersistentStorage() {
      try {
        if (!navigator.storage?.persist) return;
        await navigator.storage.persist();
      } catch (error) {
        console.warn("Dauerhafte Speicherung konnte nicht angefragt werden:", error);
      }
    }

    return Object.freeze({
      bindEvents,
      persist,
      canContinueFromMemory,
      markStateLoaded,
      markStateImported,
      clearHistoryWarning,
      updateWarning,
      refreshConflictMode,
      requestPersistentStorage
    });
  }

  root.WizardPersistenceController = Object.freeze({
    createPersistenceController
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
