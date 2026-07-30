(function attachPersistenceController(root) {
  "use strict";

  function createPersistenceController({
    Storage,
    FileUtils,
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

      const effectiveOptions = options ?? pendingSaveOptions ?? undefined;
      const saved = Storage.saveGame(state, effectiveOptions);
      if (!saved) {
        storageConflict = Storage.wasLastGameSaveConflict?.() === true;
        hasUnsavedChanges = !storageConflict;
        // A technical retry must keep its original compare-and-set baseline to remain safe.
        pendingSaveOptions = storageConflict ? null : cloneSaveOptions(effectiveOptions);
        const error =
          Storage.getStorageErrors?.().gameError ||
          "The game could not be saved on this device. Export the game state as soon as storage is available again.";
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
      const externalWarning = [externalGameWarning, externalHistoryWarning, getHistoryCapacityWarning()]
        .filter(Boolean)
        .join(" ");
      const text =
        message ||
        externalWarning ||
        storageError ||
        (!storageAvailable
          ? "The browser does not provide persistent local storage. Changes may be lost when it is closed."
          : "");

      warning.textContent = text;
      warning.hidden = !text;
    }

    function handleExternalStorageChange(event) {
      if (event.storageArea !== localStorage || ![Storage.STORAGE_KEY, Storage.HISTORY_KEY].includes(event.key)) {
        return;
      }

      if (event.key === Storage.STORAGE_KEY) {
        if (!getState()) {
          // Without an in-memory game, only the home screen is stale; no conflict exists.
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
        "#screen-setup button, #screen-setup input, #screen-setup select, #screen-setup textarea, " +
          "#screen-setup-summary button, #screen-game button, #screen-game input, " +
          "#screen-game select, #screen-game textarea, #screen-finished button, " +
          "#cloud-dialog button, #edit-round-dialog button"
      );

      stateUi.forEach((control) => {
        if (conflictAllowedControlIds.has(control.id)) return;

        if (storageConflict) {
          if (!control.disabled) {
            // Track controls disabled here so their previous disabled state remains intact.
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

      // This capture-phase guard blocks events that bypass disabled-state updates.
      const control =
        event.target instanceof Element ? event.target.closest("button, input, select, textarea, form") : null;
      if (!control || conflictAllowedControlIds.has(control.id)) return;
      if (
        !control.closest(
          "#screen-setup, #screen-setup-summary, #screen-game, #screen-finished, " + "#cloud-dialog, #edit-round-dialog"
        )
      )
        return;

      event.preventDefault();
      event.stopImmediatePropagation();
      showToast("This game is locked because of a storage conflict. Reload the page or export the unsaved state.");
    }

    function exportRecoveryState() {
      const state = getState();
      if (!state || (!storageConflict && !hasUnsavedChanges)) return;

      const recoveryReason = storageConflict ? "storage-conflict" : "unsaved-changes";
      const gameExport = FileUtils.createGameExport(state, { recoveryReason });
      FileUtils.downloadJson(gameExport.payload, gameExport.filename);
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
