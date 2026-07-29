(function attachPersistenceController(root) {
  "use strict";

  function createPersistenceController({
    Storage,
    elements,
    getState,
    showToast,
    refreshHomeScreen = () => {},
    getHistoryCapacityWarning = () => ""
  }) {
    let hasUnsavedChanges = false;
    let storageConflict = false;
    let pendingSaveOptions = null;
    let externalGameWarning = "";
    let externalHistoryWarning = "";

    const conflictAllowedControlIds = new Set([
      "btn-setup-home",
      "btn-summary-back",
      "btn-game-home",
      "btn-finished-go-home",
      "btn-close-cloud-dialog",
      "btn-close-edit-dialog",
      "btn-confirm-round-one-hint"
    ]);

    function bindEvents() {
      ["click", "input", "change", "submit"].forEach((eventName) => {
        document.addEventListener(eventName, blockInteractionDuringConflict, true);
      });
      elements["btn-export-conflict-state"].addEventListener("click", exportRecoveryState);
      elements["btn-reload-after-conflict"].addEventListener("click", () => window.location.reload());
      window.addEventListener("storage", handleExternalStorageChange);
    }

    function persist(options) {
      const state = getState();
      if (!state) return false;

      // Preserve the last known storage baseline after a technical write error.
      // This is especially important when the first save has not succeeded yet:
      // subsequent writes must remain explicit initial writes instead of looking
      // like a stale tab trying to recreate a deleted game.
      const effectiveOptions = options ?? pendingSaveOptions ?? undefined;
      const saved = Storage.saveGame(state, effectiveOptions);
      if (!saved) {
        storageConflict = Storage.wasLastGameSaveConflict?.() === true;
        hasUnsavedChanges = !storageConflict;
        pendingSaveOptions = storageConflict
          ? null
          : cloneSaveOptions(effectiveOptions);
        const error = Storage.getStorageErrors?.().gameError
          || "The game could not be saved on this device. Export the game state as soon as storage is available again.";
        updateWarning(error);
        showToast(error);
      } else {
        hasUnsavedChanges = false;
        storageConflict = false;
        pendingSaveOptions = null;
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
      pendingSaveOptions = null;
      externalGameWarning = "";
      refreshConflictMode();
      updateWarning();
    }

    function markStateImported() {
      markStateLoaded();
    }

    function cloneSaveOptions(options) {
      if (!options || typeof options !== "object") return null;

      const copy = {};
      if (Object.prototype.hasOwnProperty.call(options, "expectedUpdatedAt")) {
        copy.expectedUpdatedAt = options.expectedUpdatedAt;
      }
      if (Object.prototype.hasOwnProperty.call(options, "expectedGameId")) {
        copy.expectedGameId = options.expectedGameId;
      }
      return Object.keys(copy).length > 0 ? copy : null;
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
        ? "The browser does not provide persistent local storage. Changes may be lost when it is closed."
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
        if (!getState()) {
          storageConflict = false;
          externalGameWarning = "";
          refreshConflictMode();
          refreshHomeScreen();
          return;
        }
        storageConflict = true;
        externalGameWarning = "The game was changed in another tab. Reload this page before continuing.";
      } else {
        externalHistoryWarning = "History was changed in another tab. Reload this page to see the latest state.";
      }
      refreshConflictMode();
      updateWarning();
      showToast(event.key === Storage.STORAGE_KEY ? externalGameWarning : externalHistoryWarning);
    }

    function refreshConflictMode() {
      const actions = elements["storage-conflict-actions"];
      if (!actions) return;

      const recoveryAvailable = Boolean(getState() && (storageConflict || hasUnsavedChanges));
      actions.hidden = !recoveryAvailable;
      actions.classList.toggle("recovery-only", hasUnsavedChanges && !storageConflict);
      elements["btn-export-conflict-state"].disabled = !recoveryAvailable;
      elements["btn-reload-after-conflict"].hidden = !storageConflict;
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
      showToast("This game is locked because of a storage conflict. Reload the page or export the unsaved state.");
    }

    function exportRecoveryState() {
      const state = getState();
      if (!state || (!storageConflict && !hasUnsavedChanges)) return;

      const exportedAt = new Date();
      const recoveryReason = storageConflict ? "storage-conflict" : "unsaved-changes";
      downloadJson({
        exportFormat: "wizard-scoreboard-game",
        exportVersion: 1,
        exportedAt: exportedAt.toISOString(),
        recoveryReason,
        gameState: JSON.parse(JSON.stringify(state))
      }, `wizard-recovery-${formatFileTimestamp(exportedAt)}.json`);
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
        console.warn("Persistent storage could not be requested:", error);
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
