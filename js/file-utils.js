(function attachFileUtils(root, factory) {
  const constants = typeof module === "object" && module.exports ? require("./constants.js") : root.WizardConstants;
  const api = factory(root, constants);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardFileUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createFileUtils(root, Constants) {
  "use strict";

  const { EXPORT_FORMAT } = Constants;
  const EXPORT_VERSION = 1;

  function downloadJson(payload, filename) {
    downloadText(JSON.stringify(payload, null, 2), filename);
  }

  function downloadText(text, filename, type = "application/json") {
    const blob = new root.Blob([text], { type });
    const url = root.URL.createObjectURL(blob);
    const link = root.document.createElement("a");
    link.href = url;
    link.download = filename;
    root.document.body.append(link);
    link.click();
    link.remove();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 0);
  }

  function formatFileTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return (
      [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-") +
      `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
  }

  function createGameExport(gameState, options = {}) {
    const exportedAt = options.exportedAt ?? new Date();

    return {
      payload: {
        exportFormat: EXPORT_FORMAT.GAME,
        exportVersion: EXPORT_VERSION,
        exportedAt: exportedAt.toISOString(),
        ...(options.recoveryReason ? { recoveryReason: options.recoveryReason } : {}),
        gameState: root.structuredClone(gameState)
      },
      filename: `wizard-game-${formatFileTimestamp(exportedAt)}.json`
    };
  }

  return Object.freeze({
    createGameExport,
    downloadJson,
    downloadText,
    formatFileTimestamp
  });
});
