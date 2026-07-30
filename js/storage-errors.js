(function attachStorageErrors(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardStorageErrors = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createStorageErrors() {
  "use strict";

  // Independent channels prevent a successful history operation from hiding a game-save failure.
  const errors = {
    storageError: "",
    gameError: "",
    historyError: ""
  };

  function setError(scope, message, error) {
    errors[scope] = message;
    if (error) console.error(message, error);
  }

  function clearError(scope) {
    errors[scope] = "";
  }

  function getStorageErrors() {
    return { ...errors };
  }

  function getLastError() {
    return [...new Set(Object.values(errors).filter(Boolean))].join(" ");
  }

  function isQuotaExceededError(error) {
    return (
      error?.name === "QuotaExceededError" ||
      error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error?.code === 22 ||
      error?.code === 1014
    );
  }

  return Object.freeze({
    setError,
    clearError,
    getStorageErrors,
    getLastError,
    isQuotaExceededError
  });
});
