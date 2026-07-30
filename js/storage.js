(function attachStorage(root, factory) {
  const isCommonJs = typeof module === "object" && module.exports;
  const activeGameStorage = isCommonJs ? require("./active-game-storage.js") : root.WizardActiveGameStorage;
  const historyStorage = isCommonJs ? require("./history-storage.js") : root.WizardHistoryStorage;
  const storageErrors = isCommonJs ? require("./storage-errors.js") : root.WizardStorageErrors;
  const api = factory(activeGameStorage, historyStorage, storageErrors);

  if (isCommonJs) {
    module.exports = api;
  }

  root.WizardStorage = api;
})(
  typeof globalThis !== "undefined" ? globalThis : window,
  function createStorageFacade(ActiveGameStorage, HistoryStorage, StorageErrors) {
    "use strict";

    return Object.freeze({
      ...ActiveGameStorage,
      ...HistoryStorage,
      getLastError: StorageErrors.getLastError,
      getStorageErrors: StorageErrors.getStorageErrors
    });
  }
);
