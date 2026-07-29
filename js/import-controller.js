(function attachImportController(root) {
  "use strict";

  const MAX_ARCHIVE_IMPORT_BYTES = 10_000_000;
  const MAX_GAME_IMPORT_BYTES = 2_000_000;
  const RECOVERY_REASONS = new Set(["storage-conflict", "unsaved-changes"]);

  function createImportController({
    Storage,
    Logic,
    elements,
    historyController,
    persistenceController,
    setState,
    archiveCompletedGame,
    refreshHomeScreen,
    showToast,
    confirmReplace = (message) => window.confirm(message)
  }) {
    function bindEvents() {
      elements["btn-import-game"].addEventListener(
        "click",
        () => elements["import-file-input"].click()
      );
      elements["import-file-input"].addEventListener("change", handleFileSelection);
    }

    async function handleFileSelection(event) {
      const input = event.target;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;

      if (file.size > MAX_ARCHIVE_IMPORT_BYTES) {
        showToast("The import file is unusually large and was rejected.");
        return;
      }

      try {
        const parsed = JSON.parse(await file.text());
        importPayload(parsed, file.size);
      } catch (error) {
        console.error("Import failed:", error);
        showToast(error instanceof Error ? error.message : "The import file could not be read.");
      }
    }

    function importPayload(parsed, fileSize) {
      if (parsed?.exportFormat === "wizard-scoreboard-history") {
        historyController.importArchive(parsed);
        return;
      }
      importGamePayload(parsed, fileSize);
    }

    function importGamePayload(parsed, fileSize) {
      if (fileSize > MAX_GAME_IMPORT_BYTES) {
        throw new Error("The individual game state is unusually large and was rejected.");
      }

      const candidate = parsed?.exportFormat === "wizard-scoreboard-game"
        ? parsed.gameState
        : parsed;
      const isRecoveryExport = parsed?.exportFormat === "wizard-scoreboard-game"
        && RECOVERY_REASONS.has(parsed?.recoveryReason);
      const validationErrors = isRecoveryExport
        ? Logic.validatePersistableGameState(candidate)
        : Logic.validateImportedGameState(candidate);
      if (validationErrors.length > 0) {
        throw new Error(`Import failed: ${validationErrors[0]}`);
      }

      const savedBeforeImport = Storage.loadGame();
      const hasStoredGameData = Storage.hasStoredData();
      const shouldReplace = !hasStoredGameData || confirmReplace(
        "The existing save will be replaced by the imported save. Continue?"
      );
      if (!shouldReplace) return;

      if (!savedBeforeImport && hasStoredGameData && !Storage.deleteGame()) {
        throw new Error("The corrupted game could not be replaced.");
      }

      const importedState = Logic.createCanonicalGameState(candidate);
      if (!Storage.saveGame(importedState, {
        expectedUpdatedAt: savedBeforeImport?.updatedAt ?? null,
        expectedGameId: savedBeforeImport?.gameId ?? null
      })) {
        throw new Error("The imported game could not be saved locally.");
      }
      if (importedState.status === "completed") {
        archiveCompletedGame(importedState);
      }

      setState(importedState);
      persistenceController.markStateImported();
      refreshHomeScreen();
      showToast("Game imported successfully.");
    }

    return Object.freeze({
      bindEvents
    });
  }

  root.WizardImportController = Object.freeze({ createImportController });
})(typeof globalThis !== "undefined" ? globalThis : window);
