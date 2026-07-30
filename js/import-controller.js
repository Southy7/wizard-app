// @ts-check

/**
 * @typedef {Record<string, unknown> & {
 *   gameId?: string | null,
 *   status?: string,
 *   updatedAt?: string | null
 * }} GameState
 *
 * @typedef {{
 *   loadGame: () => GameState | null,
 *   hasStoredData: () => boolean,
 *   deleteGame: () => boolean,
 *   saveGame: (state: GameState, options: {
 *     expectedUpdatedAt: string | null,
 *     expectedGameId: string | null
 *   }) => boolean
 * }} ImportStorage
 *
 * @typedef {{
 *   validatePersistableGameState: (state: GameState) => string[],
 *   validateImportedGameState: (state: GameState) => string[],
 *   createCanonicalGameState: (state: GameState) => GameState
 * }} ImportLogic
 *
 * @typedef {{
 *   Constants: {
 *     EXPORT_FORMAT: { GAME: string, HISTORY: string },
 *     GAME_STATUS: { COMPLETED: string }
 *   },
 *   Storage: ImportStorage,
 *   Logic: ImportLogic,
 *   elements: Record<string, HTMLElement>,
 *   historyController: { importArchive: (archive: unknown) => void },
 *   persistenceController: { markStateImported: () => void },
 *   setState: (state: GameState) => void,
 *   archiveCompletedGame: (state: GameState) => unknown,
 *   refreshHomeScreen: () => void,
 *   showToast: (message: string) => void,
 *   confirmReplace?: (message: string) => boolean
 * }} ImportControllerDependencies
 */

(function attachImportController(/** @type {any} */ root) {
  "use strict";

  const MAX_ARCHIVE_IMPORT_BYTES = 10_000_000;
  const MAX_GAME_IMPORT_BYTES = 2_000_000;
  const RECOVERY_REASONS = new Set(["storage-conflict", "unsaved-changes"]);
  const REQUIRED_ELEMENT_IDS = Object.freeze(["btn-import-game", "import-file-input"]);

  /**
   * @param {Document} documentRoot
   */
  function getRequiredElements(documentRoot) {
    return Object.freeze(
      Object.fromEntries(
        REQUIRED_ELEMENT_IDS.map((id) => {
          const element = documentRoot.getElementById(id);
          if (!element) throw new Error(`Required import element #${id} was not found.`);
          return [id, element];
        })
      )
    );
  }

  /**
   * @param {ImportControllerDependencies} dependencies
   */
  function createImportController({
    Constants,
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
      elements["btn-import-game"].addEventListener("click", () => elements["import-file-input"].click());
      elements["import-file-input"].addEventListener("change", handleFileSelection);
    }

    /**
     * @param {Event} event
     */
    async function handleFileSelection(event) {
      const input = /** @type {HTMLInputElement | null} */ (event.target);
      if (!input) return;
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

    /**
     * @param {any} parsed
     * @param {number} fileSize
     */
    function importPayload(parsed, fileSize) {
      if (parsed?.exportFormat === Constants.EXPORT_FORMAT.HISTORY) {
        historyController.importArchive(parsed);
        return;
      }
      importGamePayload(parsed, fileSize);
    }

    /**
     * @param {any} parsed
     * @param {number} fileSize
     */
    function importGamePayload(parsed, fileSize) {
      if (fileSize > MAX_GAME_IMPORT_BYTES) {
        throw new Error("The individual game state is unusually large and was rejected.");
      }

      const candidate = parsed?.exportFormat === Constants.EXPORT_FORMAT.GAME ? parsed.gameState : parsed;
      const isRecoveryExport =
        parsed?.exportFormat === Constants.EXPORT_FORMAT.GAME && RECOVERY_REASONS.has(parsed?.recoveryReason);
      const validationErrors = isRecoveryExport
        ? Logic.validatePersistableGameState(candidate)
        : Logic.validateImportedGameState(candidate);
      if (validationErrors.length > 0) {
        throw new Error(`Import failed: ${validationErrors[0]}`);
      }

      const savedBeforeImport = Storage.loadGame();
      const hasStoredGameData = Storage.hasStoredData();
      const shouldReplace =
        !hasStoredGameData || confirmReplace("The existing save will be replaced by the imported save. Continue?");
      if (!shouldReplace) return;

      if (!savedBeforeImport && hasStoredGameData && !Storage.deleteGame()) {
        throw new Error("The corrupted game could not be replaced.");
      }

      const importedState = Logic.createCanonicalGameState(candidate);
      if (
        !Storage.saveGame(importedState, {
          expectedUpdatedAt: savedBeforeImport?.updatedAt ?? null,
          expectedGameId: savedBeforeImport?.gameId ?? null
        })
      ) {
        throw new Error("The imported game could not be saved locally.");
      }
      if (importedState.status === Constants.GAME_STATUS.COMPLETED) {
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

  root.WizardImportController = Object.freeze({ createImportController, getRequiredElements });
})(typeof globalThis !== "undefined" ? globalThis : window);
