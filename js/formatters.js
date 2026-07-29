(function attachFormatters(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.WizardFormatters = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createFormatters() {
  "use strict";

  function formatNumber(value) {
    const number = Number(value) || 0;
    if (number < 0) return `\u2212${Math.abs(number)}`;
    return String(number);
  }

  function formatSigned(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : formatNumber(number);
  }

  function formatPlayerName(player, index) {
    const name = typeof player?.name === "string" ? player.name.trim() : "";
    return name || `Player ${index + 1}`;
  }

  function getPlayerDisplayName(gameState, playerId, fallbackIndex = null) {
    const players = Array.isArray(gameState?.players) ? gameState.players : [];
    const index = players.findIndex((player) => player.id === playerId);
    if (index >= 0) return formatPlayerName(players[index], index);
    return Number.isInteger(fallbackIndex) ? `Player ${fallbackIndex + 1}` : "\u2013";
  }

  return Object.freeze({
    formatNumber,
    formatSigned,
    formatPlayerName,
    getPlayerDisplayName
  });
});
